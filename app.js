(function () {
  "use strict";

  const STORAGE_KEY = "career-hunter-ai-mvp-state-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STOP_WORDS = new Set([
    "about", "able", "above", "across", "after", "all", "also", "am", "an", "and",
    "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "could", "did", "do", "does", "during",
    "each", "either", "else", "for", "from", "further", "get", "got", "had", "has",
    "have", "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in",
    "into", "is", "it", "its", "just", "may", "me", "might", "more", "most", "must",
    "my", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
    "our", "out", "over", "own", "per", "same", "she", "should", "so", "some",
    "such", "than", "that", "the", "their", "them", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "us", "very",
    "was", "we", "were", "what", "when", "where", "which", "while", "who", "will",
    "with", "within", "without", "would", "you", "your", "year", "years", "work",
    "working", "role", "position", "candidate", "company", "team", "including",
    "business", "data", "bi", "analyst", "developer", "using", "build", "experience",
    "required", "preferred", "responsibilities", "responsibility", "ability"
  ]);
  const SYNONYMS = [
    ["power bi", "powerbi", "pbi"],
    ["business intelligence", "bi"],
    ["data analytics", "analytics"],
    ["data visualization", "data viz", "visualization"],
    ["microsoft excel", "excel"],
    ["sql server", "mssql"],
    ["extract transform load", "etl"],
    ["machine learning", "ml"]
  ];

  const elements = {
    resumeFile: document.getElementById("resume-file"),
    resumeText: document.getElementById("resume-text"),
    resumeState: document.getElementById("resume-state"),
    resumeWordCount: document.getElementById("resume-word-count"),
    targetRoles: document.getElementById("target-roles"),
    targetLocation: document.getElementById("target-location"),
    minimumMatch: document.getElementById("minimum-match"),
    dailyLimit: document.getElementById("daily-limit"),
    form: document.getElementById("job-form"),
    formFeedback: document.getElementById("form-feedback"),
    clearJobDetails: document.getElementById("clear-job-details"),
    list: document.getElementById("job-list"),
    empty: document.getElementById("empty-state"),
    emptyHeading: document.getElementById("empty-heading"),
    emptyCopy: document.getElementById("empty-copy"),
    emptyAction: document.getElementById("empty-action"),
    addJobToggle: document.getElementById("add-job-toggle"),
    loadDescription: document.getElementById("load-description"),
    toast: document.getElementById("toast"),
    sort: document.getElementById("sort-jobs"),
    searchDialog: document.getElementById("search-dialog"),
    searchForm: document.getElementById("search-form"),
    searchDialogTitle: document.getElementById("search-dialog-title"),
    searchProviderButton: document.getElementById("search-provider-button"),
    searchKeywords: document.getElementById("search-keywords"),
    searchLocation: document.getElementById("search-location")
  };

  let state = loadState();
  let activeFilter = "all";
  let selectedSearchProvider = "";
  let descriptionLoadPromise = null;
  let toastTimer = null;
  state.jobs = rescoreJobs(state.jobs);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        resume: typeof parsed.resume === "string" ? parsed.resume : "",
        roles: typeof parsed.roles === "string" ? parsed.roles : "Business Intelligence Analyst, Power BI Developer, Data Analyst",
        location: typeof parsed.location === "string" ? parsed.location : "",
        threshold: clampNumber(parsed.threshold, 51, 51, 100),
        dailyLimit: clampNumber(parsed.dailyLimit, 10, 1, 100),
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs.filter(isValidJob) : []
      };
    } catch (error) {
      console.error("Could not load saved Career Hunter data.", error);
      return defaultState();
    }
  }

  function defaultState() {
    return {
      resume: "",
      roles: "Business Intelligence Analyst, Power BI Developer, Data Analyst",
      location: "",
      threshold: 51,
      dailyLimit: 10,
      jobs: []
    };
  }

  function isValidJob(job) {
    return job && typeof job.id === "string" && typeof job.title === "string" &&
      typeof job.description === "string" && typeof job.status === "string" &&
      Number.isFinite(job.score);
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save Career Hunter data.", error);
      showToast("Your browser couldn’t save this change. Check available storage and try again.");
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(value) {
    const normalized = normalizeText(value);
    const tokens = normalized.split(/\s+/).filter(function (word) {
      return word.length > 1 && !STOP_WORDS.has(word);
    });
    const terms = new Set(tokens);

    SYNONYMS.forEach(function (group) {
      const normalizedGroup = group.map(normalizeText);
      if (normalizedGroup.some(function (term) {
        return term.includes(" ") ? normalized.includes(term) : terms.has(term);
      })) {
        terms.add(normalizedGroup[0].replace(/\s+/g, "_"));
      }
    });

    return terms;
  }

  function getRoleTerms() {
    return elements.targetRoles.value
      .split(",")
      .map(function (role) { return role.trim(); })
      .filter(Boolean);
  }

  function scoreJob(job) {
    const resumeTerms = tokenize(state.resume);
    const descriptionTerms = tokenize(job.description);
    const matched = [];
    resumeTerms.forEach(function (term) {
      if (descriptionTerms.has(term)) matched.push(term);
    });

    const uniqueMatches = Array.from(new Set(matched)).sort();
    const contentScore = resumeTerms.size
      ? Math.min(1, uniqueMatches.length / Math.max(1, Math.min(resumeTerms.size, 35)))
      : 0;
    const requiredTerms = descriptionTerms;
    const coverage = requiredTerms.size
      ? uniqueMatches.filter(function (term) { return requiredTerms.has(term); }).length /
        Math.min(requiredTerms.size, 24)
      : 0;
    const score = Math.round(Math.min(100, (coverage * 70) + (contentScore * 30)));

    const reasons = [];
    uniqueMatches.slice(0, 5).forEach(function (term) {
      const displayTerm = term.replace("power_bi", "Power BI")
        .replace("business_intelligence", "Business Intelligence")
        .replace("data_analytics", "Data Analytics")
        .replace("data_visualization", "Data Visualization")
        .replace("microsoft_excel", "Microsoft Excel")
        .replace("sql_server", "SQL Server")
        .replace("extract_transform_load", "ETL")
        .replace("machine_learning", "Machine Learning");
      reasons.push("Resume mentions " + displayTerm);
    });
    if (!reasons.length && !state.resume.trim()) reasons.push("Add your resume to calculate a match");
    if (!reasons.length) reasons.push("Few shared skills found");

    return { score: score, reasons: reasons.slice(0, 5) };
  }

  function rescoreJobs(jobs) {
    return jobs.map(function (job) {
      const match = scoreJob(job);
      return Object.assign({}, job, { score: match.score, reasons: match.reasons });
    });
  }

  function inferJobTitle(description, source) {
    const firstLine = description.split(/\r?\n/).map(function (line) {
      return line.trim();
    }).find(Boolean);
    if (!firstLine) return source + " job listing";
    if (firstLine.length <= 80) return firstLine;
    return firstLine.slice(0, 77).replace(/\s+\S*$/, "") + "...";
  }

  function isAppliedToday(job) {
    return job.status === "applied" && job.appliedAt &&
      new Date(job.appliedAt).toDateString() === new Date().toDateString();
  }

  function countAppliedToday() {
    return state.jobs.filter(function (job) {
      return isEligibleJob(job) && isAppliedToday(job);
    }).length;
  }

  function readiness(job) {
    if (job.status === "applied") return "applied";
    if (job.status === "skipped") return "skipped";
    if (!isQualifyingMatch(job)) return "below";
    if (job.score < state.threshold) return "below";
    if (countAppliedToday() >= state.dailyLimit) return "capped";
    return "ready";
  }

  function isQualifyingMatch(job) {
    return isEligibleJob(job) && job.score > 50 && job.score >= state.threshold;
  }

  function isEligibleJob(job) {
    return job.remote === true && (job.contractType === "C2C" || job.contractType === "1099");
  }

  function findContractType(text) {
    const c2cPattern = /\b(?:c2c|corp(?:oration)?[\s-]+to[\s-]+corp(?:oration)?)\b/gi;
    const contractorPattern = /\b1099(?:[\s-]*nec)?\b/gi;

    function hasPositiveMention(pattern) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const before = text.slice(Math.max(0, match.index - 48), match.index).split(/[.;\n]/).pop();
        const after = text.slice(match.index + match[0].length, match.index + match[0].length + 32);
        const negativePrefix = before.match(/\b(?:not|no|without|excluding|except)\b([^.;\n]*)$/i);
        if (negativePrefix && negativePrefix[1].length <= 32 &&
          !/\b(?:but|however|although)\b/i.test(negativePrefix[1])) continue;
        if (/^\s*(?:(?:is|are)\s+)?(?:not|unavailable|not offered|not accepted)\b/i.test(after)) continue;
        return true;
      }
      return false;
    }

    if (hasPositiveMention(c2cPattern)) return "C2C";
    if (hasPositiveMention(contractorPattern)) return "1099";
    return "";
  }

  function updateSearchLinks() {
    const keywords = getRoleTerms().join(" ").trim();
    const hasResume = Boolean(state.resume.trim());
    document.querySelectorAll(".source-link").forEach(function (link) {
      link.href = buildSearchUrl(
        link.dataset.provider,
        keywords,
        defaultSearchLocation(link.dataset.provider)
      );
      link.setAttribute("aria-disabled", String(!hasResume));
      link.tabIndex = hasResume ? 0 : -1;
    });
  }

  function defaultSearchLocation(provider) {
    if (provider === "OCC México" || provider === "Bumeran México") return "México";
    return elements.targetLocation.value.trim();
  }

  function openSearchDialog(provider) {
    if (!state.resume.trim()) {
      elements.resumeText.focus();
      showToast("Add your resume before searching for matching jobs.");
      return;
    }
    selectedSearchProvider = provider;
    elements.searchDialogTitle.textContent = "Search " + provider;
    elements.searchProviderButton.textContent = provider;
    elements.searchKeywords.value = getRoleTerms().join(", ");
    elements.searchLocation.value = defaultSearchLocation(provider);
    elements.searchDialog.showModal();
    elements.searchKeywords.focus();
  }

  function buildSearchUrl(provider, keywords, location) {
    const params = new URLSearchParams();
    const remoteQuery = [keywords.trim(), "remote"].filter(Boolean).join(" ");
    const encodedLocation = location.trim();

    if (provider === "Dice") {
      params.set("q", remoteQuery);
      if (encodedLocation) params.set("location", encodedLocation);
      params.set("filters.remote", "true");
      return "https://www.dice.com/jobs?" + params.toString();
    }
    if (provider === "Monster") {
      params.set("q", remoteQuery);
      if (encodedLocation) params.set("where", encodedLocation);
      params.set("whereType", "remote");
      return "https://www.monster.com/jobs/search?" + params.toString();
    }
    if (provider === "LinkedIn") {
      if (keywords.trim()) params.set("keywords", keywords.trim());
      if (encodedLocation) params.set("location", encodedLocation);
      params.set("f_WT", "2");
      return "https://www.linkedin.com/jobs/search/?" + params.toString();
    }
    if (provider === "Glassdoor") {
      if (keywords.trim()) params.set("sc.keyword", keywords.trim());
      if (encodedLocation) params.set("locKeyword", encodedLocation);
      params.set("remoteWorkType", "1");
      return "https://www.glassdoor.com/Job/jobs.htm?" + params.toString();
    }
    if (provider === "OCC México") {
      params.set("q", remoteQuery);
      if (encodedLocation) params.set("location", encodedLocation);
      return "https://www.occ.com.mx/empleos/?" + params.toString();
    }
    if (provider === "Bumeran México") {
      params.set("q", remoteQuery);
      if (encodedLocation) params.set("location", encodedLocation);
      return "https://www.bumeran.com.mx/empleos/?" + params.toString();
    }
    throw new Error("Unsupported job search provider: " + provider);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function safeExternalUrl(value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function renderJob(job) {
    const status = readiness(job);
    const statusCopy = {
      ready: "Ready to apply",
      below: "Below your match threshold",
      capped: "Daily limit reached",
      applied: "Applied",
      skipped: "Skipped"
    }[status];
    const badgeClass = status === "applied" ? "applied" : status === "below" || status === "capped" ? "low" : "";
    const reasons = job.reasons.map(function (reason) {
      return '<span class="reason-chip">' + escapeHtml(reason) + "</span>";
    }).join("");
    const externalUrl = safeExternalUrl(job.url);
    const location = job.location || state.location || "Location not specified";
    const dateText = new Date(job.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
    let action = "";

    if (status === "applied") {
      action = '<span class="status-label applied">Applied</span>';
    } else if (status === "skipped") {
      action = '<span class="status-label below">Skipped</span>';
    } else if (externalUrl) {
      const statusClass = status === "capped" || status === "below" ? " " + status : "";
      action = '<span class="status-label' + statusClass + '">' + escapeHtml(statusCopy) + '</span>' +
        '<a class="button button-primary" href="' + escapeHtml(externalUrl) +
        '" target="_blank" rel="noopener noreferrer" data-action="open" data-id="' + escapeHtml(job.id) +
        '">Open posting <span aria-hidden="true">↗</span></a>' +
        '<button class="text-button" type="button" data-action="applied" data-id="' +
        escapeHtml(job.id) + '">Mark as applied</button>';
    } else {
      action = '<span class="status-label ' + (status === "ready" ? "" : "below") + '">' + escapeHtml(statusCopy) + '</span>' +
        '<button class="text-button" type="button" data-action="applied" data-id="' +
        escapeHtml(job.id) + '">Mark as applied</button>';
    }

    return '<article class="job-card">' +
      '<div class="job-card-main">' +
        '<div class="job-title-row"><div><h3>' + escapeHtml(job.title) + '</h3>' +
        '</div></div>' +
        '<div class="job-meta"><span>' + escapeHtml(job.source) + '</span><span>' +
        escapeHtml(job.contractType) + '</span><span>Remote</span><span>' + escapeHtml(location) +
        '</span><span>Added ' + escapeHtml(dateText) + '</span></div>' +
        '<div class="job-reasons">' + reasons + '</div>' +
      '</div>' +
      '<div class="job-card-side">' +
        '<div class="match-badge ' + badgeClass + '"><strong>' + job.score + '%</strong><span>resume match</span></div>' +
        '<div class="job-actions">' + action +
          (status !== "applied" && status !== "skipped" ?
            '<button class="text-button" type="button" data-action="skip" data-id="' +
            escapeHtml(job.id) + '">Skip</button>' : "") +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function render() {
    const hasResume = Boolean(state.resume.trim());
    elements.resumeState.textContent = hasResume ? "Resume added" : "Resume required to start";
    elements.resumeWordCount.textContent = countWords(state.resume) + " words";

    const matchedJobs = state.jobs.filter(isQualifyingMatch);
    const readyCount = matchedJobs.filter(function (job) { return readiness(job) === "ready"; }).length;
    const appliedCount = countAppliedToday();
    document.getElementById("metric-total").textContent = String(matchedJobs.length);
    document.getElementById("metric-ready").textContent = String(readyCount);
    document.getElementById("metric-applied").textContent = String(appliedCount);
    document.getElementById("metric-limit").textContent = String(state.dailyLimit);
    document.getElementById("count-all").textContent = String(matchedJobs.length);
    document.getElementById("count-ready").textContent = String(readyCount);
    document.getElementById("count-applied").textContent = String(state.jobs.filter(function (job) {
      return isEligibleJob(job) && job.status === "applied";
    }).length);

    const filtered = matchedJobs.filter(function (job) {
      if (activeFilter === "ready") return readiness(job) === "ready";
      if (activeFilter === "applied") return job.status === "applied";
      return true;
    });
    if (elements.sort.value === "newest") {
      filtered.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    } else {
      filtered.sort(function (a, b) { return b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt); });
    }
    elements.list.innerHTML = filtered.map(renderJob).join("");
    elements.empty.hidden = filtered.length > 0;
    if (!hasResume) {
      elements.emptyHeading.textContent = "Add your resume to get started.";
      elements.emptyCopy.textContent = "Share your resume first. Career Hunter will compare job descriptions to your experience and show roles scoring above 50%.";
      elements.emptyAction.textContent = "Add my resume";
      elements.emptyAction.hidden = false;
    } else if (matchedJobs.length === 0) {
      elements.emptyHeading.textContent = state.threshold > 51
        ? "No roles meet your " + state.threshold + "% minimum."
        : "No matches over 50% yet.";
      elements.emptyCopy.textContent = state.threshold > 51
        ? "Add a Dice or Monster listing to compare it with your resume, or lower your minimum match to see more roles."
        : "Add a Dice or Monster listing to compare it with your resume. Only roles scoring over 50% will appear here.";
      elements.emptyAction.textContent = "Add a job to compare";
      elements.emptyAction.hidden = false;
    } else if (filtered.length === 0 && activeFilter === "ready") {
      elements.emptyHeading.textContent = "No matches ready to apply.";
      elements.emptyCopy.textContent = "Your matching roles may be applied, skipped, or currently at today's application limit.";
      elements.emptyAction.hidden = true;
    } else if (filtered.length === 0 && activeFilter === "applied") {
      elements.emptyHeading.textContent = "No applications tracked yet.";
      elements.emptyCopy.textContent = "When you apply to a matching role, mark it as applied to keep your search up to date.";
      elements.emptyAction.hidden = true;
    } else {
      elements.emptyHeading.textContent = "No matching roles in this view.";
      elements.emptyCopy.textContent = "Try another queue filter to see your other matches.";
      elements.emptyAction.hidden = true;
    }
    elements.addJobToggle.disabled = !hasResume;
    elements.addJobToggle.title = hasResume ? "" : "Add your resume before comparing jobs.";
    updateSearchLinks();
  }

  function countWords(text) {
    const words = String(text || "").trim().match(/\S+/g);
    return words ? words.length : 0;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      elements.toast.classList.remove("visible");
    }, 3200);
  }

  function persistPreferences() {
    state.roles = elements.targetRoles.value;
    state.location = elements.targetLocation.value;
    state.threshold = clampNumber(elements.minimumMatch.value, 51, 51, 100);
    state.dailyLimit = clampNumber(elements.dailyLimit.value, 10, 1, 100);
    elements.minimumMatch.value = String(state.threshold);
    elements.dailyLimit.value = String(state.dailyLimit);
    state.jobs = rescoreJobs(state.jobs);
    saveState();
    render();
  }

  async function addJob(formData) {
    let description = String(formData.get("description") || "").trim();
    if (!state.resume.trim()) {
      elements.formFeedback.textContent = "Add your resume before scoring a job.";
      elements.resumeText.focus();
      return;
    }
    const urlValue = String(formData.get("url") || "").trim();
    const safeUrl = urlValue ? safeExternalUrl(urlValue) : "";
    if (urlValue && !safeUrl) {
      elements.formFeedback.textContent = "Use a valid http or https posting link, or leave the link blank.";
      return;
    }
    if (!description) {
      if (!urlValue) {
        elements.formFeedback.textContent = "Enter a job description or provide a public Dice or Monster link.";
        return;
      }
      description = await loadDescriptionFromUrl();
      if (!description) return;
    }
    const contractType = findContractType(description + " " + urlValue);
    if (!contractType) {
      elements.formFeedback.textContent = "This isn’t a good option: the pasted description or URL doesn’t state C2C or 1099. Add a listing that explicitly mentions one of these contract types.";
      return;
    }
    if (formData.get("remoteConfirmed") !== "on") {
      elements.formFeedback.textContent = "Confirm the posting is fully remote. Hybrid and on-site roles are not eligible.";
      return;
    }
    const duplicate = safeUrl && state.jobs.some(function (job) { return job.url === safeUrl; });
    if (duplicate) {
      elements.formFeedback.textContent = "That posting is already in your queue.";
      return;
    }

    const job = {
      id: createId(),
      source: String(formData.get("source") || "Other"),
      url: safeUrl,
      description: description,
      remote: true,
      contractType: contractType,
      location: "",
      status: "saved",
      createdAt: new Date().toISOString()
    };
    job.title = inferJobTitle(description, job.source);
    const match = scoreJob(job);
    job.score = match.score;
    job.reasons = match.reasons;
    if (!isQualifyingMatch(job)) {
      elements.formFeedback.textContent = job.score <= 50
        ? "This role scored " + job.score + "%. It wasn’t added because matches must be over 50%."
        : "This role scored " + job.score + "%. It wasn’t added because it is below your " + state.threshold + "% minimum.";
      return;
    }
    state.jobs.push(job);
    saveState();
    render();
    updateClearButton();
    showToast("Job scored at " + job.score + "%. " + (readiness(job) === "ready" ? "It’s ready for you to apply." : "Review the match before applying."));
  }

  function updateClearButton() {
    const url = elements.form.querySelector('input[name="url"]').value.trim();
    const description = elements.form.querySelector('textarea[name="description"]').value.trim();
    elements.clearJobDetails.disabled = Boolean(descriptionLoadPromise) || (!url && !description);
  }

  function clearJobDetails() {
    if (descriptionLoadPromise) return;
    elements.form.querySelector('input[name="url"]').value = "";
    elements.form.querySelector('textarea[name="description"]').value = "";
    elements.form.querySelector('input[name="remoteConfirmed"]').checked = false;
    elements.formFeedback.textContent = "";
    updateClearButton();
    elements.form.querySelector('input[name="url"]').focus();
  }

  function loadDescriptionFromUrl() {
    if (descriptionLoadPromise) return descriptionLoadPromise;
    const url = elements.form.querySelector('input[name="url"]').value.trim();
    const source = elements.form.querySelector('select[name="source"]').value;
    if (!url) {
      elements.formFeedback.textContent = "Enter a Dice or Monster job link first.";
      return Promise.resolve("");
    }
    if (source !== "Dice" && source !== "Monster") {
      elements.formFeedback.textContent = "Automatic description loading is available for Dice and Monster only. Paste the description from this listing.";
      return Promise.resolve("");
    }

    elements.loadDescription.disabled = true;
    elements.loadDescription.textContent = "Loading description...";
    elements.formFeedback.textContent = "";
    descriptionLoadPromise = (async function () {
      try {
        const response = await fetch("/api/job-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url })
        });
        const result = await response.json();
        if (!response.ok) {
          elements.formFeedback.textContent = result.error || "Could not load the description. Paste it instead.";
          return "";
        }
        elements.form.querySelector('textarea[name="description"]').value = result.description;
        elements.formFeedback.textContent = "Description loaded. Check it before scoring.";
        return result.description;
      } catch (error) {
        console.error("Could not load a job description from its link.", error);
        elements.formFeedback.textContent = "Could not load the description. Paste it instead.";
        return "";
      } finally {
        descriptionLoadPromise = null;
        elements.loadDescription.disabled = false;
        elements.loadDescription.textContent = "Load description from link";
        updateClearButton();
      }
    })();
    updateClearButton();
    return descriptionLoadPromise;
  }

  function syncDescriptionLoader() {
    const source = elements.form.querySelector('select[name="source"]').value;
    const canLoadDescription = source === "Dice" || source === "Monster";
    elements.loadDescription.disabled = !canLoadDescription || Boolean(descriptionLoadPromise);
    elements.loadDescription.title = canLoadDescription
      ? ""
      : "Paste descriptions from this job board; automatic loading currently supports Dice and Monster.";
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "job-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function hydrateInputs() {
    elements.resumeText.value = state.resume;
    elements.targetRoles.value = state.roles;
    elements.targetLocation.value = state.location;
    elements.minimumMatch.value = String(state.threshold);
    elements.dailyLimit.value = String(state.dailyLimit);
  }

  function handleJobAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const job = state.jobs.find(function (item) { return item.id === button.dataset.id; });
    if (!job) return;

    if (button.dataset.action === "open") {
      return;
    }
    if (button.dataset.action === "applied") {
      if (countAppliedToday() >= state.dailyLimit) {
        showToast("You’ve reached today’s application limit. Increase it in Search preferences to continue.");
        return;
      }
      job.status = "applied";
      job.appliedAt = new Date().toISOString();
      saveState();
      render();
      showToast("Application marked as submitted.");
    } else if (button.dataset.action === "skip") {
      job.status = "skipped";
      saveState();
      render();
      showToast("Job moved out of your active queue.");
    }
  }

  elements.resumeText.addEventListener("input", function () {
    state.resume = elements.resumeText.value;
    elements.resumeState.textContent = state.resume.trim() ? "Resume added" : "No resume added";
    elements.resumeWordCount.textContent = countWords(state.resume) + " words";
    state.jobs = rescoreJobs(state.jobs);
    saveState();
    render();
  });

  elements.resumeFile.addEventListener("change", function () {
    const file = elements.resumeFile.files && elements.resumeFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      if (typeof reader.result !== "string") {
        showToast("Couldn’t read that file. Paste your resume text instead.");
        return;
      }
      elements.resumeText.value = reader.result;
      elements.resumeText.dispatchEvent(new Event("input", { bubbles: true }));
      showToast("Resume text added. Check it for formatting before saving jobs.");
    };
    reader.onerror = function () {
      showToast("Couldn’t read that file. Paste your resume text instead.");
    };
    reader.readAsText(file);
  });

  [elements.targetRoles, elements.targetLocation].forEach(function (element) {
    element.addEventListener("input", persistPreferences);
  });
  [elements.minimumMatch, elements.dailyLimit].forEach(function (element) {
    element.addEventListener("change", persistPreferences);
  });

  document.getElementById("add-job-toggle").addEventListener("click", function () {
    elements.form.hidden = !elements.form.hidden;
    elements.formFeedback.textContent = "";
    if (!elements.form.hidden) elements.form.querySelector('textarea[name="description"]').focus();
  });
  elements.emptyAction.addEventListener("click", function () {
    if (!state.resume.trim()) {
      elements.resumeText.focus();
      elements.resumeText.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    elements.addJobToggle.click();
    elements.addJobToggle.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.querySelectorAll(".source-link").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      openSearchDialog(link.dataset.provider);
    });
  });
  elements.searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!selectedSearchProvider) return;
    const url = buildSearchUrl(
      selectedSearchProvider,
      elements.searchKeywords.value,
      elements.searchLocation.value
    );
    window.open(url, "_blank", "noopener,noreferrer");
    elements.searchDialog.close();
  });
  ["close-search-dialog", "cancel-search"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      elements.searchDialog.close();
    });
  });
  document.getElementById("close-job-form").addEventListener("click", function () {
    elements.form.hidden = true;
  });
  elements.clearJobDetails.addEventListener("click", clearJobDetails);
  elements.form.querySelector('select[name="source"]').addEventListener("change", syncDescriptionLoader);
  elements.form.querySelector('input[name="url"]').addEventListener("input", updateClearButton);
  elements.form.querySelector('textarea[name="description"]').addEventListener("input", updateClearButton);
  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();
    void addJob(new FormData(elements.form));
  });
  elements.loadDescription.addEventListener("click", loadDescriptionFromUrl);
  elements.form.querySelector('input[name="url"]').addEventListener("blur", function () {
    const description = elements.form.querySelector('textarea[name="description"]').value.trim();
    const source = elements.form.querySelector('select[name="source"]').value;
    if (this.value.trim() && !description && (source === "Dice" || source === "Monster")) {
      loadDescriptionFromUrl();
    }
  });
  elements.list.addEventListener("click", handleJobAction);
  elements.sort.addEventListener("change", render);
  document.querySelectorAll(".queue-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      activeFilter = tab.dataset.filter;
      document.querySelectorAll(".queue-tab").forEach(function (item) {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render();
    });
  });

  window.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    syncDescriptionLoader();
    hydrateInputs();
    render();
    showToast("Saved data was updated in another tab.");
  });

  hydrateInputs();
  render();
})();
