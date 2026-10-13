const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedHosts = new Set(['dice.com', 'www.dice.com', 'monster.com', 'www.monster.com']);
const maxPageBytes = 2 * 1024 * 1024;

app.use(express.json({ limit: '2kb' }));

function isAllowedJobUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (!url.port || url.port === '443') &&
      !url.username &&
      !url.password &&
      allowedHosts.has(url.hostname);
  } catch (error) {
    return false;
  }
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function (entity, code) {
      return String.fromCodePoint(Number(code));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (entity, code) {
      return String.fromCodePoint(parseInt(code, 16));
    });
}

function plainText(value) {
  return decodeHtml(String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function descriptionFromHtml(html) {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const data = JSON.parse(script[1].replace(/^\s*<!--|-->\s*$/g, ''));
      const queue = (Array.isArray(data) ? data : [data]).slice();
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        if (Array.isArray(item)) {
          queue.push(...item);
          continue;
        }
        if (item['@graph']) queue.push(item['@graph']);
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if (types.includes('JobPosting') && typeof item.description === 'string') {
          const description = plainText(item.description);
          if (description.length >= 40) return description;
        }
      }
    } catch (error) {
      continue;
    }
  }

  const metaTags = html.matchAll(/<meta\b[^>]*>/gi);
  for (const tag of metaTags) {
    const name = tag[0].match(/\b(?:name|property)=["'](?:description|og:description)["']/i);
    const content = tag[0].match(/\bcontent=["']([^"']+)["']/i);
    if (name && content) {
      const description = plainText(content[1]);
      if (description.length >= 40) return description;
    }
  }

  const main = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  const description = main ? plainText(main[1]) : '';
  return description.length >= 80 ? description : '';
}

async function fetchJobDescription(value) {
  if (!isAllowedJobUrl(value)) {
    const error = new Error('Enter an HTTPS Dice or Monster job-posting link.');
    error.status = 400;
    throw error;
  }

  let url = new URL(value);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CareerHunter local job description reader' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) {
        const error = new Error('The job page redirected too many times.');
        error.status = 422;
        throw error;
      }
      url = new URL(location, url);
      if (!isAllowedJobUrl(url.href)) {
        const error = new Error('The job page redirected outside Dice or Monster, so it was not opened.');
        error.status = 400;
        throw error;
      }
      continue;
    }
    if (!response.ok) {
      const error = new Error('The job site did not allow the description to be loaded. Paste the job description instead.');
      error.status = 422;
      throw error;
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxPageBytes) {
      const error = new Error('The job page is too large to read. Paste the job description instead.');
      error.status = 413;
      throw error;
    }
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > maxPageBytes) {
      const error = new Error('The job page is too large to read. Paste the job description instead.');
      error.status = 413;
      throw error;
    }
    const description = descriptionFromHtml(html);
    if (!description) {
      const error = new Error('No readable job description was found. The site may require sign-in; paste the job description instead.');
      error.status = 422;
      throw error;
    }
    return description;
  }

  const error = new Error('The job page could not be loaded.');
  error.status = 422;
  throw error;
}

app.post('/api/job-description', async (req, res) => {
  try {
    const description = await fetchJobDescription(String(req.body && req.body.url || ''));
    res.json({ description });
  } catch (error) {
    if (!error.status) console.error('Could not load job description.', error);
    res.status(error.status || 502).json({
      error: error.status ? error.message : 'Could not reach the job site. Paste the job description instead.'
    });
  }
});

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(['/app.js', '/styles.css'], express.static(__dirname));

if (require.main === module) {
  app.listen(port, '127.0.0.1', () => {
    console.log(`Career Hunter is running at http://localhost:${port}`);
  });
}

module.exports = { app, descriptionFromHtml, fetchJobDescription, isAllowedJobUrl };
