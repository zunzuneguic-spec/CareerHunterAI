// Asks Claude to compare a resume with one job description.
// The result is only a draft for the user to review; nothing is submitted anywhere.

const MODEL = 'claude-opus-5-5';
const MAX_TEXT_CHARS = 60000;

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: 'Overall fit from 0 to 100.' },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    fullyRemote: { type: 'boolean' },
    contractType: { type: 'string', enum: ['C2C', '1099', 'C2C or 1099', 'W2 only', 'Not stated'] },
    summary: { type: 'string' },
    coverLetter: { type: 'string' }
  },
  required: ['score', 'strengths', 'gaps', 'fullyRemote', 'contractType', 'summary', 'coverLetter'],
  additionalProperties: false
};

const SYSTEM_PROMPT = [
  'You help a Business Intelligence / Power BI / analytics professional review contract job postings.',
  'Compare the resume with the job description and return an honest assessment.',
  'score: 0-100 fit based on required skills, tools, seniority, and domain. Do not inflate it.',
  'strengths: up to 5 short points where the resume clearly meets the job requirements.',
  'gaps: up to 5 short points the job asks for that the resume does not show.',
  'fullyRemote: true only if the posting says the role is 100% remote (no hybrid or on-site days).',
  'contractType: what the posting allows. Use "Not stated" if it does not say.',
  'summary: one or two plain-language sentences explaining the score.',
  'coverLetter: a concise cover letter (under 250 words) for this job, using only facts from the resume.',
  'Never invent experience, employers, certifications, or numbers that are not in the resume.'
].join('\n');

function analysisError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true; // safe to show this message to the user
  return error;
}

function cleanList(value) {
  return Array.isArray(value)
    ? value.filter(function (item) { return typeof item === 'string' && item.trim(); }).slice(0, 5)
    : [];
}

function normalizeAnalysis(data) {
  const score = Math.round(Number(data.score));
  return {
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0,
    strengths: cleanList(data.strengths),
    gaps: cleanList(data.gaps),
    fullyRemote: data.fullyRemote === true,
    contractType: typeof data.contractType === 'string' ? data.contractType : 'Not stated',
    summary: typeof data.summary === 'string' ? data.summary : '',
    coverLetter: typeof data.coverLetter === 'string' ? data.coverLetter : ''
  };
}

async function analyzeJob(client, resume, description) {
  resume = String(resume || '').trim();
  description = String(description || '').trim();
  if (!resume || !description) {
    throw analysisError('Both the resume and the job description are required.', 400);
  }
  if (resume.length > MAX_TEXT_CHARS || description.length > MAX_TEXT_CHARS) {
    throw analysisError('The resume or job description is too long to analyze.', 413);
  }

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If a safety check declines the request, Anthropic retries it on a recommended backup model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA }
    },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: '<resume>\n' + resume + '\n</resume>\n\n<job_description>\n' + description + '\n</job_description>'
    }]
  });

  if (response.stop_reason === 'refusal') {
    throw analysisError('The AI declined to analyze this job. The keyword score is shown instead.', 422);
  }
  const textBlock = response.content.find(function (block) { return block.type === 'text'; });
  if (response.stop_reason === 'max_tokens' || !textBlock) {
    throw analysisError('The AI response was incomplete. The keyword score is shown instead.', 502);
  }
  try {
    return normalizeAnalysis(JSON.parse(textBlock.text));
  } catch (error) {
    throw analysisError('The AI response could not be read. The keyword score is shown instead.', 502);
  }
}

module.exports = { analyzeJob, normalizeAnalysis, MODEL };
