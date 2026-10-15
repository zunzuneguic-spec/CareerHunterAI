const assert = require('node:assert/strict');
const test = require('node:test');
const { app } = require('../server');

const resume = 'Power BI developer with 6 years of DAX, SQL Server, and Azure Data Factory experience.';
const description = 'Remote C2C Power BI Developer. 100% remote. Requires DAX, SQL, and Snowflake.';

// A stand-in for the Anthropic client: records the request and returns a canned response.
function fakeClient(response) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async function (params) {
          calls.push(params);
          if (response instanceof Error) throw response;
          return response;
        }
      }
    }
  };
}

function textResponse(data, stopReason) {
  return {
    stop_reason: stopReason || 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(data) }]
  };
}

async function postAnalyze(body) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

test.afterEach(() => {
  delete app.locals.anthropicClient;
});

test('returns the AI analysis for a resume and job description', async () => {
  const client = fakeClient(textResponse({
    score: 82,
    strengths: ['DAX', 'SQL Server'],
    gaps: ['Snowflake'],
    fullyRemote: true,
    contractType: 'C2C',
    summary: 'Strong Power BI fit; Snowflake is missing.',
    coverLetter: 'Dear hiring manager, ...'
  }));
  app.locals.anthropicClient = client;

  const result = await postAnalyze({ resume, description });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    score: 82,
    strengths: ['DAX', 'SQL Server'],
    gaps: ['Snowflake'],
    fullyRemote: true,
    contractType: 'C2C',
    summary: 'Strong Power BI fit; Snowflake is missing.',
    coverLetter: 'Dear hiring manager, ...'
  });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, 'claude-opus-5-5');
  assert.equal(client.calls[0].output_config.format.type, 'json_schema');
  assert.match(client.calls[0].messages[0].content, /Power BI developer with 6 years/);
  assert.match(client.calls[0].messages[0].content, /Requires DAX, SQL, and Snowflake/);
});

test('clamps an out-of-range score and trims long lists', async () => {
  app.locals.anthropicClient = fakeClient(textResponse({
    score: 140,
    strengths: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    gaps: [],
    fullyRemote: false,
    contractType: 'Not stated',
    summary: '',
    coverLetter: ''
  }));

  const result = await postAnalyze({ resume, description });

  assert.equal(result.status, 200);
  assert.equal(result.body.score, 100);
  assert.equal(result.body.strengths.length, 5);
});

test('rejects a request without a resume and does not call the API', async () => {
  const client = fakeClient(textResponse({}));
  app.locals.anthropicClient = client;

  const result = await postAnalyze({ resume: '  ', description });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /resume and the job description are required/);
  assert.equal(client.calls.length, 0);
});

test('returns 503 so the browser falls back to keyword scoring when no API key is set', async () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await postAnalyze({ resume, description });
    assert.equal(result.status, 503);
    assert.match(result.body.error, /ANTHROPIC_API_KEY/);
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

test('hides API error details and returns 502 when the Claude API fails', async () => {
  app.locals.anthropicClient = fakeClient(new Error('connect ECONNREFUSED secret-detail'));
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await postAnalyze({ resume, description });
    assert.equal(result.status, 502);
    assert.doesNotMatch(result.body.error, /secret-detail/);
  } finally {
    console.error = originalError;
  }
});

test('reports a refusal as a readable error', async () => {
  app.locals.anthropicClient = fakeClient({ stop_reason: 'refusal', content: [] });

  const result = await postAnalyze({ resume, description });

  assert.equal(result.status, 422);
  assert.match(result.body.error, /declined/);
});
