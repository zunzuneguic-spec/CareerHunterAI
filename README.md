# CareerHunterAI

CareerHunter is a local-first job-search workspace for matching your resume to Business Intelligence, Power BI, and Analytics roles. The match queue accepts fully remote roles offered as C2C or 1099 only.

## Run the MVP

Run the local app server to use all features, including loading a job description from a public posting link.

### Start on Windows

1. Install Node.js LTS if it is not already installed.
2. Open PowerShell and change to the folder containing the repository. For example:

   ```powershell
   cd "$HOME\.copilot\repos\CareerHunterAI"
   ```

3. Install the app dependencies (first run or after dependencies change), then start the app:

   ```powershell
   npm install
   npm start
   ```

4. Open `http://localhost:3000` in your browser. Leave the PowerShell window open while using the app. Press `Ctrl+C` in that window to stop the server.

### Turn on AI job analysis (optional)

Without this step the app still works, using the simple keyword score. With it, Claude (Anthropic's AI) reads each job and your resume and gives you:

- a match score from 0 to 100 and a one-line explanation,
- strengths (where your resume fits) and gaps (what the job wants that your resume doesn't show),
- a check of whether the job looks fully remote and C2C/1099,
- a cover-letter draft you can copy, edit, and use yourself.

Setup:

1. Create an API key at https://console.anthropic.com (Settings → API keys). API usage is billed by Anthropic per request.
2. In the repository folder, copy the example settings file to a new file named `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Open `.env` in VS Code and replace `paste-your-key-here` with your key. The line should look like `ANTHROPIC_API_KEY=sk-ant-...`.
4. Restart the app (`Ctrl+C`, then `npm start`).

`.env` is listed in `.gitignore`, so Git will not commit or push your key. Never paste the key into `README.md`, `app.js`, or any other tracked file. If `git status` ever shows `.env`, stop and do not commit.

When you click **Score this job**, the card shows "AI match" if Claude scored it, or "keyword match" if AI was unavailable (no key, no internet, or an API error). Jobs scored by keywords have a **Run AI analysis** button to try again. If you edit your resume, earlier AI results go back to the keyword score until you re-run the analysis.

The AI only drafts. You still open each posting, review the cover letter, and submit the application yourself. Career Hunter never fills in or submits job-board forms.

### Use Career Hunter

1. Add your resume text or choose a `.txt`/`.md` file. A resume is required before you can search job boards or compare listings. PDF and Word files are not parsed in this MVP; copy their text into the resume field.
2. Set target roles, location, match threshold, and daily application limit. Click Search Dice or Search Monster to review and edit role/skill keywords and location before opening that site's search. A remote term and remote filter are added automatically; contract type is not filtered in the search. Job boards may interpret search keywords and filters differently.
3. Search Dice or Monster and enter the listing link. When you leave the link field or choose to score the job, Career Hunter tries to load a public description into the description box. If the site blocks access or requires sign-in, paste the description yourself. Career Hunter checks the description and URL text for an explicit C2C or 1099 mention. Confirm that it is fully remote before calculating a match. Listings without C2C/1099 evidence, plus hybrid and on-site roles, are excluded. The default match is 51%, so only roles scoring above 50% are shown.
4. Open the posting to apply on the job board, then mark it submitted in Career Hunter to track your daily limit.

Resume text, preferences, and saved jobs are stored in this browser's local storage. The resume is never sent to Dice or Monster; the local server requests only the job URL when loading a public description. When AI analysis is turned on, the local server sends the resume and the job description to the Anthropic API for scoring and nothing else. Clearing this browser's site data will erase saved data.

## Current limitations

- Scoring uses Claude when an API key is set, and a transparent keyword-overlap score otherwise. AI scores are estimates; read the strengths and gaps instead of relying on the number alone. Only roles scoring above 50% and meeting your chosen minimum match are kept in the match queue.
- Job listings are added by pasting their details or attempting to load a public description from a Dice or Monster link. Sites may block loading or require sign-in; the app does not log in on the user's behalf.
- Remote status is confirmed manually from each listing. The app checks the description and URL text for C2C/1099 keywords and may load a public description from the supported job-board domains; verify the details on the employer's posting.
- Application submission remains on the job board. The MVP does not sign in, fill, or submit external application forms.

## Update the GitHub repository manually

After editing files in the repository folder, use PowerShell to review, commit, and push the changes:

```powershell
cd "$HOME\.copilot\repos\CareerHunterAI"
git status
git diff
git add .gitignore .env.example README.md analyzer.js app.js index.html package.json package-lock.json server.js styles.css test/
git commit -m "Describe the change"
git push origin main
```

Review `git status` and `git diff` before staging. Include only files you intend to publish. GitHub may ask you to authenticate before the push completes.
