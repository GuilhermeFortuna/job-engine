import http from "node:http";

const PORT = parseInt(process.env.MOCK_PORT || "8088", 10);
let isDegradedGlobal = false;
let liveSyncCooldownActive = false;
let liveSyncDegradedSource = false;

const WORKSPACE_RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXISTING_RUN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WORKSPACE_EXCEPTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let workspaceMode = "armed";
let workspaceAutomationMode = "semi_auto_pause_before_submit";
let workspaceDuplicateOverride = false;
let workspaceSequence = 1;

// FRONT-006 gates every launch control on applicant-profile readiness, so the
// workspace specs need a profile that exists. Values stay synthetic.
const PROFILE_FIELD_NAMES = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "region",
  "country",
  "timezone",
  "headline",
  "summary",
  "portfolio_url",
  "linkedin_url",
  "github_url",
  "custom_urls",
  "notice_period_days",
  "employment_history",
  "education_history",
  "skills",
  "languages",
  "certifications",
  "work_authorizations",
  "compensation_expectation",
  "location_preferences",
  "demographics",
];

function applicantProfileFixture() {
  const profile = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  for (const name of PROFILE_FIELD_NAMES) {
    profile[name] = {
      state: "provided",
      value: `synthetic-${name}`,
      source: "owner",
      last_confirmed_at: "2026-01-01T00:00:00Z",
      policy_category: "verified_profile",
    };
  }
  return profile;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function workspaceFieldReports(status = "REVIEW_REQUIRED") {
  return [
    {
      field_fingerprint: "fp_hybrid_work",
      label: "Are you willing to work in hybrid mode?",
      control_type: "text",
      required: true,
      status,
      reason_code: status === "REVIEW_REQUIRED" ? "no_applicable_answer" : "owner_confirmed",
      question_intent: "location_preference",
      options: [],
      min_length: 1,
      max_length: 200,
      pattern: null,
      allow_save_to_answer_bank: true,
    },
  ];
}

function workspaceRunDetail(runId = WORKSPACE_RUN_ID) {
  const now = "2026-08-19T00:00:00Z";
  const base = {
    id: runId,
    job_group_id: sampleJobDetail.id,
    canonical_application_url:
      sampleJobDetail.preferred_application_target.target_url,
    application_url: sampleJobDetail.preferred_application_target.target_url,
    platform_adapter_id: "greenhouse",
    resume_asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    resume_sha256: "cc".repeat(32),
    automation_mode: workspaceAutomationMode,
    status: "queued",
    current_step: "Run queued",
    current_checkpoint: null,
    terminal_reason: null,
    receipt_summary: null,
    policy_snapshot: { resume_id: "res_primary_pdf" },
    created_at: now,
    updated_at: now,
    started_at: now,
    completed_at: null,
    events: [],
    exceptions: [],
    evidence: [],
  };

  if (workspaceMode === "progress") {
    return { ...base, status: "running", current_step: "Filling profile", current_checkpoint: "form_discovered" };
  }
  if (workspaceMode === "review") {
    return {
      ...base,
      status: "needs_input",
      current_step: "Waiting for owner answers",
      current_checkpoint: "questions_answered",
      exceptions: [
        {
          id: WORKSPACE_EXCEPTION_ID,
          run_id: runId,
          exception_type: "unresolved_question",
          status: "pending",
          context_payload: { raw_dom: "should-not-render" },
          resolution_payload: { answer_text: "secret" },
          field_reports: workspaceFieldReports("REVIEW_REQUIRED"),
          created_at: now,
          resolved_at: null,
        },
      ],
    };
  }
  if (workspaceMode === "auth") {
    return {
      ...base,
      status: "paused_auth",
      current_step: "CAPTCHA in embedded page",
      current_checkpoint: "form_discovered",
      exceptions: [
        {
          id: "ex-captcha",
          run_id: runId,
          exception_type: "captcha_required",
          status: "pending",
          context_payload: {},
          field_reports: [],
          created_at: now,
          resolved_at: null,
        },
      ],
    };
  }
  if (workspaceMode === "submitted") {
    return {
      ...base,
      status: "submitted",
      current_step: "Submitted",
      current_checkpoint: "submitted",
      completed_at: now,
      receipt_summary: {
        platform_adapter_id: "greenhouse",
        final_url: "https://boards.greenhouse.io/thanks",
        platform_receipt_id: "gh-1",
        confirmation_signal: "thank_you_page",
        capture_timestamp: now,
        artifact_hash: "aa".repeat(32),
        summary_notes: null,
      },
    };
  }
  if (workspaceMode === "unknown") {
    return {
      ...base,
      status: "submission_unknown",
      current_step: "Submission unknown",
      current_checkpoint: "submitting",
      evidence: [
        {
          id: "ev-1",
          run_id: runId,
          attempt: 1,
          evidence_type: "receipt",
          relative_path: "runs/secret.log",
          sha256: "bb".repeat(32),
          file_size_bytes: 2048,
          captured_at: now,
          metadata_payload: { cookie: "nope" },
        },
      ],
    };
  }
  if (workspaceMode === "cancelled") {
    return {
      ...base,
      status: "cancelled",
      current_step: "Cancelled",
      terminal_reason: "Owner cancelled from workspace",
      completed_at: now,
    };
  }
  return {
    ...base,
    status: "needs_input",
    current_step: "Ready to submit",
    current_checkpoint: "submit_armed",
    exceptions: [
      {
        id: "ex-armed",
        run_id: runId,
        exception_type: "semi_auto_armed",
        status: "pending",
        field_reports: workspaceFieldReports("AUTO_FILL"),
        created_at: now,
        resolved_at: null,
      },
    ],
  };
}

export const mockFilters = {
  role_families: [
    { id: "software_developer", label: "Software developer" },
    { id: "full_stack", label: "Full stack" },
    { id: "backend", label: "Backend" },
    { id: "python", label: "Python" },
    { id: "frontend", label: "Frontend" },
    { id: "ai_application", label: "AI application" },
    { id: "applied_ai", label: "Applied AI" },
  ],
  technologies: [
    { value: "Python", label: "Python" },
    { value: "JavaScript", label: "JavaScript" },
    { value: "TypeScript", label: "TypeScript" },
    { value: "React", label: "React" },
    { value: "Next.js", label: "Next.js" },
    { value: "FastAPI", label: "FastAPI" },
    { value: "PostgreSQL", label: "PostgreSQL" },
    { value: "SQL", label: "SQL" },
    { value: "Docker", label: "Docker" },
    { value: "Git", label: "Git" },
    { value: "GitHub", label: "GitHub" },
    { value: "CI/CD", label: "CI/CD" },
    { value: "AWS", label: "AWS" },
    { value: "GCP", label: "GCP" },
    { value: "LLM", label: "LLM" },
  ],
  remote_status: [
    { value: "remote", label: "Remote" },
    { value: "hybrid", label: "Hybrid" },
    { value: "onsite", label: "On-site" },
    { value: "unknown", label: "Unknown" },
  ],
  location_eligibility: [
    { value: "brazil", label: "Brazil" },
    { value: "latin_america", label: "Latin America" },
    { value: "worldwide", label: "Worldwide" },
    { value: "unknown", label: "Unknown" },
  ],
  seniority: [
    { value: "internship", label: "Internship" },
    { value: "junior", label: "Junior" },
    { value: "mid", label: "Mid" },
    { value: "senior", label: "Senior" },
    { value: "lead_staff", label: "Lead/staff" },
    { value: "unknown", label: "Unknown" },
  ],
  posted_within: [
    { value: "24h", label: "Past 24 hours" },
    { value: "7d", label: "Past 7 days" },
    { value: "30d", label: "Past 30 days" },
    { value: "any", label: "Any time" },
  ],
  sort: [
    { value: "newest", label: "Newest" },
    { value: "compensation_desc", label: "Compensation (high to low)" },
  ],
  sources: [
    { id: "himalayas", label: "Himalayas" },
    { id: "jobicy", label: "Jobicy" },
    { id: "remoteok", label: "Remote OK" },
  ],
};

export const sampleJobDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Senior Backend Engineer",
  title_original: "Senior Backend Engineer (Python & Distributed Systems)",
  company: "Apex Global",
  company_original: "Apex Global Technologies Inc",
  location_original: "Remote (Brazil / Latin America)",
  location_normalized_country: "Brazil",
  location_normalized_region: "Latin America",
  remote_status: "remote",
  location_eligibility: {
    unknown: false,
    regions: [
      {
        region: "brazil",
        evidence_text: "Candidates residing in Brazil are eligible to apply",
      },
      {
        region: "latin_america",
        evidence_text: "LATAM timezones supported",
      },
    ],
  },
  seniority: "senior",
  seniority_original: "Lead / Sr. Staff",
  employment_type: "full_time",
  compensation: {
    original_text: "$110,000 - $140,000 USD per year",
    currency: "USD",
    period: "year",
    minimum: "110000",
    maximum: "140000",
    annual_usd_minimum: "110000",
    annual_usd_maximum: "140000",
  },
  technologies: [
    { term: "Python", source_text: "Python 3.13" },
    { term: "FastAPI", source_text: "FastAPI framework" },
    { term: "PostgreSQL", source_text: "PostgreSQL 17" },
    { term: "Docker", source_text: "Docker containerization" },
  ],
  role_families: ["backend", "python"],
  published_at: "2026-08-14T10:00:00Z",
  first_seen_at: "2026-08-14T12:00:00Z",
  last_seen_at: "2026-08-17T00:00:00Z",
  sources: [
    {
      source_id: "himalayas",
      source_name: "Himalayas",
      listing_url: "https://himalayas.app/jobs/apex-senior-backend",
    },
    {
      source_id: "remoteok",
      source_name: "Remote OK",
      listing_url: "https://remoteok.com/l/apex-senior-backend-rok",
    },
  ],
  preferred_application_target: {
    id: "target-1",
    target_url: "https://boards.greenhouse.io/apex/jobs/101",
    listing_url: "https://himalayas.app/jobs/apex-senior-backend",
    provider: "greenhouse",
    desktop_adapter_id: "greenhouse",
    status: "executable",
    resolution_method: "ats_native_listing",
    verified_at: "2026-08-14T12:00:00Z",
    source_posting_id: "22222222-2222-4222-8222-222222222221",
    assisted_reason: null,
  },
  description:
    "Apex Global is seeking a Senior Backend Engineer to build high-throughput data processing pipelines and resilient APIs.\n\nResponsibilities:\n- Design and implement scalable Python services.\n- Optimize PostgreSQL queries and maintain schema migrations.\n- Collaborate with frontend teams to deliver clean APIs.\n\nQualifications:\n- 5+ years of production experience with Python.\n- Deep understanding of relational databases and async programming.",
  status: "active",
  closed_at: null,
  source_postings: [
    {
      id: "22222222-2222-4222-8222-222222222221",
      source_id: "himalayas",
      source_posting_id: "him-apex-101",
      source_name: "Himalayas",
      listing_url: "https://himalayas.app/jobs/apex-senior-backend",
      title_original: "Senior Backend Engineer (Python & Distributed Systems)",
      company_original: "Apex Global Technologies Inc",
      description: "Himalayas job posting text",
      location_original: "Remote (Brazil / Latin America)",
      remote_status: "remote",
      employment_type: "full_time",
      seniority: "senior",
      seniority_original: "Lead / Sr. Staff",
      compensation: {
        original_text: "$110,000 - $140,000 USD per year",
        currency: "USD",
        period: "year",
        minimum: "110000",
        maximum: "140000",
        annual_usd_minimum: "110000",
        annual_usd_maximum: "140000",
      },
      technologies_original_text: "Python, FastAPI, Postgres, Docker",
      location_eligibility_evidence: "Open to Brazil and LATAM",
      published_at: "2026-08-14T10:00:00Z",
      source_timestamp: "2026-08-14T10:00:00Z",
      first_seen_at: "2026-08-14T12:00:00Z",
      last_seen_at: "2026-08-17T00:00:00Z",
      closed_at: null,
      status: "active",
      adapter_version: "1.0.0",
      linked_at: "2026-08-14T12:00:00Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      source_id: "remoteok",
      source_posting_id: "rok-apex-888",
      source_name: "Remote OK",
      listing_url: "https://remoteok.com/l/apex-senior-backend-rok",
      title_original: "Senior Backend Developer",
      company_original: "Apex Global",
      description: "Remote OK posting text",
      location_original: "Anywhere",
      remote_status: "remote",
      employment_type: "full_time",
      seniority: "senior",
      seniority_original: "Senior",
      compensation: {
        original_text: "$110k - $140k",
        currency: "USD",
        period: "year",
        minimum: "110000",
        maximum: "140000",
        annual_usd_minimum: "110000",
        annual_usd_maximum: "140000",
      },
      technologies_original_text: "Python, Docker, SQL",
      location_eligibility_evidence: "Worldwide",
      published_at: "2026-08-14T11:30:00Z",
      source_timestamp: "2026-08-14T11:30:00Z",
      first_seen_at: "2026-08-14T13:00:00Z",
      last_seen_at: "2026-08-17T00:00:00Z",
      closed_at: null,
      status: "active",
      adapter_version: "1.2.0",
      linked_at: "2026-08-14T13:00:00Z",
    },
  ],
};

export const sampleUnknownFieldsJob = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Software Engineer",
  title_original: "Software Engineer",
  company: "Stealth Corp",
  company_original: "Stealth Corp",
  location_original: null,
  location_normalized_country: null,
  location_normalized_region: null,
  remote_status: "unknown",
  location_eligibility: { unknown: true, regions: [] },
  seniority: "unknown",
  seniority_original: null,
  employment_type: "unknown",
  compensation: {
    original_text: null,
    currency: null,
    period: null,
    minimum: null,
    maximum: null,
    annual_usd_minimum: null,
    annual_usd_maximum: null,
  },
  technologies: [],
  role_families: ["software_developer"],
  published_at: null,
  first_seen_at: "2026-08-16T12:00:00Z",
  last_seen_at: "2026-08-17T00:00:00Z",
  sources: [
    {
      source_id: "jobicy",
      source_name: "Jobicy",
      listing_url: "https://jobicy.com/jobs/stealth-dev",
    },
  ],
  preferred_application_target: {
    id: "target-1",
    target_url: "https://jobicy.com/jobs/stealth-dev",
    listing_url: "https://jobicy.com/jobs/stealth-dev",
    provider: null,
    desktop_adapter_id: null,
    status: "unresolved",
    resolution_method: null,
    verified_at: null,
    source_posting_id: null,
    assisted_reason: "No verified executable application target is available yet.",
  },
  description: null,
  status: "active",
  closed_at: null,
  source_postings: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      source_id: "jobicy",
      source_posting_id: "jobicy-stealth-1",
      source_name: "Jobicy",
      listing_url: "https://jobicy.com/jobs/stealth-dev",
      title_original: "Software Engineer",
      company_original: "Stealth Corp",
      description: null,
      location_original: null,
      remote_status: "unknown",
      employment_type: "unknown",
      seniority: "unknown",
      seniority_original: null,
      compensation: {
        original_text: null,
        currency: null,
        period: null,
        minimum: null,
        maximum: null,
        annual_usd_minimum: null,
        annual_usd_maximum: null,
      },
      technologies_original_text: null,
      location_eligibility_evidence: null,
      published_at: null,
      source_timestamp: null,
      first_seen_at: "2026-08-16T12:00:00Z",
      last_seen_at: "2026-08-17T00:00:00Z",
      closed_at: null,
      status: "active",
      adapter_version: "1.1.0",
      linked_at: "2026-08-16T12:00:00Z",
    },
  ],
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/v1/test/set-health" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        isDegradedGlobal = !!parsed.degraded;
      } catch {}
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, degraded: isDegradedGlobal }));
    });
    return;
  }

  if (url.pathname === "/api/v1/test/set-live-sync-mode" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        if (typeof parsed.cooldown === "boolean") {
          liveSyncCooldownActive = parsed.cooldown;
        }
        if (typeof parsed.degraded === "boolean") {
          liveSyncDegradedSource = parsed.degraded;
        }
      } catch {}
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          cooldown: liveSyncCooldownActive,
          degraded: liveSyncDegradedSource,
        }),
      );
    });
    return;
  }

  if (url.pathname === "/api/v1/test/set-workspace-mode" && req.method === "POST") {
    void readJsonBody(req).then((parsed) => {
      if (typeof parsed.mode === "string") {
        workspaceMode = parsed.mode;
      }
      workspaceAutomationMode = "semi_auto_pause_before_submit";
      if (parsed.resetOverride) {
        workspaceDuplicateOverride = false;
      }
      workspaceSequence = 1;
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, mode: workspaceMode }));
    });
    return;
  }

  if (url.pathname === "/api/v1/catalog/live-sync") {
    if (liveSyncCooldownActive || url.searchParams.get("cooldown") === "true") {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "15",
      });
      res.end(
        JSON.stringify({
          detail: "Live sync cooldown active. Please wait 15 seconds before syncing again.",
        }),
      );
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const isDegraded = liveSyncDegradedSource || url.searchParams.get("degraded") === "true";

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 1. sync_started
    sendEvent("sync_started", {
      sources: ["himalayas", "jobicy", "remoteok"],
      started_at: new Date().toISOString(),
    });

    // 2. Source progress events
    setTimeout(() => {
      sendEvent("source_progress", {
        source_id: "himalayas",
        stage: "fetching",
        fetched_count: 50,
        accepted_count: 48,
        rejected_count: 2,
      });
      sendEvent("source_progress", {
        source_id: "jobicy",
        stage: "fetching",
        fetched_count: 30,
        accepted_count: 30,
        rejected_count: 0,
      });
      sendEvent("source_progress", {
        source_id: "remoteok",
        stage: "fetching",
        fetched_count: 40,
        accepted_count: 39,
        rejected_count: 1,
      });
    }, 50);

    setTimeout(() => {
      sendEvent("source_progress", {
        source_id: "himalayas",
        stage: "normalizing",
        fetched_count: 50,
        accepted_count: 48,
        rejected_count: 2,
      });
      sendEvent("source_progress", {
        source_id: "remoteok",
        stage: "normalizing",
        fetched_count: 40,
        accepted_count: 39,
        rejected_count: 1,
      });
    }, 100);

    // 3. Source completed events
    setTimeout(() => {
      sendEvent("source_completed", {
        source_id: "himalayas",
        status: "success",
        inserted_count: 5,
        updated_count: 43,
        marked_stale_count: 0,
        error_summaries: [],
      });

      if (isDegraded) {
        sendEvent("source_completed", {
          source_id: "jobicy",
          status: "failure",
          inserted_count: 0,
          updated_count: 0,
          marked_stale_count: 0,
          error_summaries: [
            {
              code: "upstream_timeout",
              message: "Jobicy API connection timed out",
            },
          ],
        });
      } else {
        sendEvent("source_completed", {
          source_id: "jobicy",
          status: "success",
          inserted_count: 3,
          updated_count: 27,
          marked_stale_count: 0,
          error_summaries: [],
        });
      }

      sendEvent("source_completed", {
        source_id: "remoteok",
        status: "success",
        inserted_count: 4,
        updated_count: 35,
        marked_stale_count: 1,
        error_summaries: [],
      });
    }, 150);

    // 4. sync_completed
    setTimeout(() => {
      sendEvent("sync_completed", {
        status: isDegraded ? "partial_success" : "success",
        total_inserted: isDegraded ? 9 : 12,
        total_updated: isDegraded ? 78 : 105,
        total_stale: 1,
        completed_at: new Date().toISOString(),
      });
      res.end();
    }, 200);

    return;
  }

  if (url.pathname === "/api/v1/catalog/filters") {
    res.writeHead(200);
    res.end(JSON.stringify(mockFilters));
    return;
  }

  if (url.pathname === "/api/v1/catalog/health") {
    const isDegraded = isDegradedGlobal || url.searchParams.get("degraded") === "true";
    const health = {
      catalog_last_seen_at: "2026-08-17T00:00:00Z",
      sources: [
        {
          source_id: "himalayas",
          latest_run_status: "success",
          latest_run_started_at: "2026-08-16T23:50:00Z",
          latest_run_completed_at: "2026-08-16T23:55:00Z",
          fetched_count: 85,
          accepted_count: 80,
          rejected_count: 5,
        },
        {
          source_id: "jobicy",
          latest_run_status: isDegraded ? "failure" : "success",
          latest_run_started_at: "2026-08-16T23:50:00Z",
          latest_run_completed_at: "2026-08-16T23:52:00Z",
          fetched_count: isDegraded ? 0 : 40,
          accepted_count: isDegraded ? 0 : 40,
          rejected_count: 0,
        },
        {
          source_id: "remoteok",
          latest_run_status: "success",
          latest_run_started_at: "2026-08-16T23:50:00Z",
          latest_run_completed_at: "2026-08-16T23:54:00Z",
          fetched_count: 60,
          accepted_count: 58,
          rejected_count: 2,
        },
      ],
    };
    res.writeHead(200);
    res.end(JSON.stringify(health));
    return;
  }

  if (url.pathname === "/api/v1/jobs") {
    const q = url.searchParams.get("q");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") || "25", 10);

    if (q === "noresults") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [],
          page: 1,
          page_size: pageSize,
          total: 0,
          total_pages: 0,
        }),
      );
      return;
    }

    const items = [
      {
        ...sampleJobDetail,
        description_excerpt:
          "Apex Global is seeking a Senior Backend Engineer to build high-throughput data processing pipelines...",
      },
      {
        ...sampleUnknownFieldsJob,
        description_excerpt: null,
      },
    ];

    res.writeHead(200);
    res.end(
      JSON.stringify({
        items,
        page,
        page_size: pageSize,
        total: 2,
        total_pages: 1,
      }),
    );
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/v1\/jobs\/(.+)$/);
  if (jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    if (jobId === sampleJobDetail.id) {
      res.writeHead(200);
      res.end(JSON.stringify(sampleJobDetail));
      return;
    }
    if (jobId === sampleUnknownFieldsJob.id) {
      res.writeHead(200);
      res.end(JSON.stringify(sampleUnknownFieldsJob));
      return;
    }
    if (jobId === "error-500" || jobId === "00000000-0000-0000-0000-500000000000") {
      res.writeHead(500);
      res.end(JSON.stringify({ detail: "Database connection failed" }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ detail: "Job group not found" }));
    return;
  }

  if (url.pathname === "/api/v1/applicant-profile") {
    res.writeHead(200);
    res.end(JSON.stringify(applicantProfileFixture()));
    return;
  }

  if (url.pathname === "/api/v1/resumes") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        items: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            resume_id: "res_primary_pdf",
            label: "Primary resume",
            source_markdown_path: "resume.md",
            upload_pdf_path: "resume.pdf",
            sha256: "cc".repeat(32),
            language: "en",
            is_default: true,
            file_size_bytes: 1024,
            version: 1,
          },
        ],
      }),
    );
    return;
  }

  if (url.pathname === "/api/v1/application-runs" && req.method === "POST") {
    void readJsonBody(req).then((parsed) => {
      if (workspaceMode === "conflict" && !workspaceDuplicateOverride) {
        res.writeHead(409);
        res.end(
          JSON.stringify({
            created_runs: [],
            conflicts: [
              {
                job_group_id: sampleJobDetail.id,
                canonical_application_url:
                  sampleJobDetail.preferred_application_target.target_url,
                existing_run_id: EXISTING_RUN_ID,
                existing_status: "queued",
                message: "An active application run already exists for this job.",
              },
            ],
          }),
        );
        return;
      }
      if (
        parsed.automation_mode === "full_auto" ||
        parsed.automation_mode === "semi_auto_pause_before_submit"
      ) {
        workspaceAutomationMode = parsed.automation_mode;
      }
      workspaceMode = workspaceMode === "conflict" ? "armed" : workspaceMode;
      res.writeHead(201);
      res.end(
        JSON.stringify({
          created_runs: [workspaceRunDetail(WORKSPACE_RUN_ID)],
          conflicts: [],
        }),
      );
    });
    return;
  }

  const runMatch = url.pathname.match(
    /^\/api\/v1\/application-runs\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/,
  );
  if (runMatch) {
    const runId = runMatch[1];
    const action = runMatch[2];
    const nested = runMatch[3];

    if (action === "events" && nested === "stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const eventType = workspaceMode === "progress" ? "step_progress" : "status_changed";
      workspaceSequence += 1;
      res.write(
        `id: ${runId}:${workspaceSequence}\nevent: ${eventType}\ndata: ${JSON.stringify({
          id: `evt-${workspaceSequence}`,
          run_id: runId,
          attempt: 1,
          sequence_num: workspaceSequence,
          event_type: eventType,
          created_at: new Date().toISOString(),
        })}\n\n`,
      );
      return;
    }

    if (action === "resolve-answers" && req.method === "POST") {
      void readJsonBody(req).then(() => {
        workspaceMode = "armed";
        res.writeHead(200);
        res.end(JSON.stringify(workspaceRunDetail(runId)));
      });
      return;
    }
    if (action === "resume" && req.method === "POST") {
      workspaceMode = "armed";
      res.writeHead(200);
      res.end(JSON.stringify(workspaceRunDetail(runId)));
      return;
    }
    if (action === "release-submit" && req.method === "POST") {
      workspaceMode = "submitted";
      res.writeHead(200);
      res.end(JSON.stringify(workspaceRunDetail(runId)));
      return;
    }
    if (action === "cancel" && req.method === "POST") {
      workspaceMode = "cancelled";
      res.writeHead(200);
      res.end(JSON.stringify(workspaceRunDetail(runId)));
      return;
    }
    if (action === "duplicate-override" && req.method === "POST") {
      void readJsonBody(req).then(() => {
        workspaceDuplicateOverride = true;
        res.writeHead(200);
        res.end(JSON.stringify(workspaceRunDetail(runId)));
      });
      return;
    }
    if (!action) {
      res.writeHead(200);
      res.end(JSON.stringify(workspaceRunDetail(runId)));
      return;
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ detail: "Endpoint not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock API server running on http://127.0.0.1:${PORT}`);
});
