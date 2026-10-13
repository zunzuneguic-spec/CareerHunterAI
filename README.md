# CareerHunterAI

CareerHunter is a local-first job-search workspace for matching your resume to Business Intelligence, Power BI, and Analytics roles.

## Run the MVP

Open `index.html` in a modern browser. No install, account, or server is required.

1. Add your resume text or choose a `.txt`/`.md` file. A resume is required before you can search job boards or compare listings. PDF and Word files are not parsed in this MVP; copy their text into the resume field.
2. Set target roles, location, remote preference, match threshold, and daily application limit. The default match is 51%, so only roles scoring above 50% are shown; you can raise this cutoff.
3. Search Dice or Monster, then paste the listing's description and optional link to calculate its match. Title and company fields aren't needed; the score uses only your resume and the job description.
4. Open the posting to apply on the job board, then mark it submitted in Career Hunter to track your daily limit.

Resume text, preferences, and saved jobs are stored in this browser's local storage. They are not sent to a server. Clearing this browser's site data will erase them.

## Current limitations

- The MVP calculates a transparent keyword-overlap score; it does not use an AI service. Only roles scoring above 50% and meeting your chosen minimum match are kept in the match queue.
- Job listings are added by pasting their details; Dice and Monster are opened as search links and are not scraped.
- Application submission remains on the job board. The MVP does not sign in, fill, or submit external application forms.
