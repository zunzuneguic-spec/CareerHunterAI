const assert = require('node:assert/strict');
const test = require('node:test');
const { descriptionFromHtml, isAllowedJobUrl } = require('../server');

test('allows HTTPS posting links only on Dice and Monster hosts', () => {
  assert.equal(isAllowedJobUrl('https://www.dice.com/job-detail/123'), true);
  assert.equal(isAllowedJobUrl('https://monster.com/jobs/123'), true);
  assert.equal(isAllowedJobUrl('http://www.dice.com/job-detail/123'), false);
  assert.equal(isAllowedJobUrl('https://dice.com.example.org/job-detail/123'), false);
  assert.equal(isAllowedJobUrl('https://www.dice.com:8443/job-detail/123'), false);
  assert.equal(isAllowedJobUrl('https://user:password@www.dice.com/job-detail/123'), false);
  assert.equal(isAllowedJobUrl('https://127.0.0.1/'), false);
});

test('extracts and cleans a JobPosting description from JSON-LD', () => {
  const html = '<script type="application/ld+json">' +
    '{"@type":"JobPosting","description":"<p>Remote Power BI C2C role</p><p>SQL and reporting experience.</p>"}' +
    '</script>';

  assert.equal(
    descriptionFromHtml(html),
    'Remote Power BI C2C role\nSQL and reporting experience.'
  );
});

test('extracts a description from a JSON-LD graph', () => {
  const html = '<script type="application/ld+json">' +
    '{"@graph":[{"@type":"Organization"},{"@type":"JobPosting","description":"1099 contract role for analytics and reporting professionals."}]}' +
    '</script>';

  assert.equal(
    descriptionFromHtml(html),
    '1099 contract role for analytics and reporting professionals.'
  );
});

test('does not treat short generic metadata as a job description', () => {
  assert.equal(descriptionFromHtml('<meta name="description" content="Find jobs">'), '');
});
