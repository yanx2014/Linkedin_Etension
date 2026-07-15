# Prospect Import & Grounded Avatar Tool

A Manifest V3 Chrome extension plus a local Node.js enrichment backend that
imports professional contacts from user‑visible pages, filters and deduplicates
them deterministically, researches each company's official website, and builds
**evidence‑grounded prospect avatars** — with strict provenance so the software
never invents data.

> **Not affiliated with, approved by, or endorsed by LinkedIn, Waalaxy, or
> Lemlist.** Those products are referenced only as workflow inspiration. This
> tool copies none of their code, branding, or selectors.

---

## What this is (and is not)

- It **operates only on pages you can already see** in your own authenticated
  browser session, using content scripts and ordinary navigation.
- It **does not use an official LinkedIn data API**, and it **does not bypass any
  access control**. Page layouts can change and imports may stop at a security
  checkpoint — the tool stops safely and never tries to get around it.
- It **never reads or transmits authentication cookies**, never uses
  `webRequest`/`debugger`/cookie APIs, and never rotates user agents/proxies or
  simulates human behavior to avoid detection.
- Unavailable data is **marked unavailable, never scraped from an alternative
  hidden endpoint and never invented**.

**Scraping profile data from LinkedIn may violate its User Agreement and can put
your account at risk, even without any evasion mechanism.** This build is
intended for private, unpacked use. You are responsible for platform terms,
privacy law, outreach law, and lawful‑basis requirements.

---

## Architecture

Two cooperating applications:

1. **Chrome extension (MV3)** — page detection, visible‑data collection, job
   orchestration, local contact lists, deterministic selection, avatar
   rendering, and exports.
2. **Local Node.js backend** — company web search, SSRF‑safe website retrieval,
   DeepSeek structuring, grounding validation, and enrichment caching. **All API
   keys live here; the extension never sees them.**

```
extension  ──typed messages──▶ service worker ──▶ content scripts (visible pages)
    │                               │
    │                               └──HTTP (loopback, token)──▶ local backend
    │                                                              ├─ Brave Search
    │                                                              ├─ website fetch (SSRF-safe)
    └─ IndexedDB / chrome.storage.local                           └─ DeepSeek (deepseek-v4-pro)
```

---

## Requirements

- **Node.js 20+** (developed/tested on Node 22).
- **Google Chrome 116+** (Side Panel API).
- Optional: a **DeepSeek** API key (enrichment) and a **Brave Search** API key
  (automatic website discovery). Without them, the tool runs in a fully
  deterministic import‑only mode.

---

## Install & run

### 1. Backend

```bash
cd backend
cp .env.example .env       # fill in keys + a local INSTALL_TOKEN
npm install                # no dependencies; creates package-lock
npm start                  # http://127.0.0.1:8787
```

Generate a local install token (shared secret between the extension and its
own backend):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Put it in `backend/.env` as `INSTALL_TOKEN=...` and paste the same value into the
extension's **Settings → Backend installation token**.

### 2. Extension (load unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select this repository's root folder.
3. Confirm the extension requests only: `activeTab`, `alarms`, `downloads`,
   `sidePanel`, `scripting`, `storage`, `tabs`, and host permissions for
   `https://www.linkedin.com/*` and `http://127.0.0.1:8787/*`.
4. Open the side panel (toolbar click) → **Settings** → set the backend URL and
   token, give consent, then save.

### 3. Package a zip

```bash
npm run package    # writes dist/extension.zip (extension files only)
```

---

## Environment variables (backend/.env)

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port (default 8787) |
| `DEEPSEEK_API_KEY` | DeepSeek key (blank = deterministic only) |
| `BRAVE_SEARCH_API_KEY` | Brave Web Search key (blank = no auto website discovery) |
| `DATABASE_PATH` | Local store path |
| `ALLOWED_EXTENSION_IDS` | Comma‑separated extension IDs allowed via CORS |
| `INSTALL_TOKEN` | Local shared secret for `Authorization: Bearer` |
| `DATA_RETENTION_DAYS` | Retention for cached website/imported data |
| `DEEPSEEK_MODEL` | Defaults to `deepseek-v4-pro` |
| `DEEPSEEK_REASONING_EFFORT` | Defaults to `max` |

---

## Supported sources

| # | Source | Adapter |
| --- | --- | --- |
| 1 | People search | `standard_search` |
| 2 | First‑degree connections | `connections` |
| 3 | Single profile | `single_profile` |
| 4 | Feed authors | `feed` |
| 5 | Post reactions | `post_reactions` |
| 6 | Post commenters | `post_comments` |
| 7 | Group members | `group_members` |
| 8 | Event attendees | `event_attendees` |
| 9–12 | Sales Navigator search / saved search / list / lead | `sales_*` |
| 13–15 | Recruiter Lite search / project / candidate | `recruiter_*` |
| 16 | CSV import | file |
| 17 | JSON import | file |
| 18 | Pasted profile URLs | file |

Standard search and single‑profile adapters are covered by fixtures/tests. The
paid‑product (Sales Navigator / Recruiter) adapters ship with documented selector
maps, multiple semantic fallbacks, and **explicit unsupported‑layout errors** —
they never fabricate a successful extraction.

---

## Import workflow

1. Open a supported page (or import a file / paste URLs).
2. **Sources** tab → **Start import** (or import file). A job is created and
   persisted.
3. Discovery collects preview rows with bounded pagination/scrolling.
4. The **Profile Selector** normalizes, matches, canonicalizes, deduplicates,
   scores, and audits every row.
5. Accepted profiles are collected one at a time; the backend researches each
   company (website‑first) and, if enabled, structures evidence with DeepSeek.
6. Avatars are rendered from **validated evidence only**.
7. **Export** downloads `profiles_selected.csv`, `profiles_rejected.csv`,
   `audit.json`, `avatar_evidence.json`, and `job_summary.json`.

Jobs persist in IndexedDB and resume after browser/service‑worker/backend
restarts. Pause, resume, cancel, and retry are available.

---

## Collection modes

`collection.mode` controls how result pages are read:

- **`current_page_only`** (default, recommended). Reads only the result cards
  currently rendered in the **active tab you are viewing**. It never opens a
  worker tab (`chrome.tabs.create`), never navigates, and never visits profile
  pages. It can scroll within the page while the URL is unchanged, and enriches
  from the search‑card evidence plus confirmed public company websites. This is
  the least intrusive mode and the safest with respect to LinkedIn's Terms.
- **`background_search_pages`** (opt‑in, disclosed in the UI). Opens **one
  inactive worker tab** and navigates search‑result pages only. Profile pages
  (`/in/…`) are visited **only** when `collection.profile_visit` is `true`.
  Automated navigation carries more platform‑contract risk — use with care.

`profile_visit` is forced off in `current_page_only` mode (there is no
navigation to visit a profile).

### Get profile URLs (URLs only)

The **Get profile URLs** button collects profile URLs only — no profile visits,
no enrichment, no auto-download (export the CSV yourself when ready). It honors
the collection mode:

- **Current page only:** reads the URLs on the page you are viewing.
- **Background search pages:** walks pages **1, 2, 3 … X** until it reaches the
  **Max profile URLs (Y)** you set (or runs out of pages / hits a checkpoint).

**Deduplication** is enforced at two levels so the same URL is never collected
twice: within a run, every canonical `/in/` URL is remembered across pages; and
across runs, URLs already in the contact store are skipped (recorded in the audit
as duplicates, not re-exported). Each collected URL is stamped with the exact
search page it came from in the CSV `source_search` column.

## Criteria schema

See `data/criteria.example.json` and `schemas/criteria.schema.json`.

- `preview_required_groups`: **AND across groups, OR within a group**.
- `preview_required_terms`: **AND**. `preview_excluded_terms`: **NOT**.
- `max_profiles`: 1–999 (default 500). Post limits: 0–7.
- `collection.mode`: `current_page_only` (default) or `background_search_pages`.
- `collection.profile_visit`: visit `/in/` pages (background mode only).
- Matching is phrase/token‑aware and Unicode‑normalized (`ceo` ≠ `ocean`,
  `sales` ≠ `wholesales`, `c++` matches `C++ Engineer`).

## Input schema

See `schemas/collected-profile.schema.json`. Imported fields are mapped onto a
canonical schema via `data/source-field-aliases.json`; conflicting aliases raise
a warning rather than mapping silently.

---

## Company website validation

Deterministic and website‑first:

- Candidate domains are scored (+30 JSON‑LD name, +20 name in title/heading, +20
  LinkedIn company link, +15 imported‑domain match, +10 location, +5 About page;
  −40 social/directory/job board; −30 different company same name).
- A site is accepted only at **score ≥ 60** with no disqualifier; otherwise the
  website is **"Not confirmed"** and candidates + reasons are stored in evidence.
- Fetching is SSRF‑safe: HTTPS‑only (one initial HTTP→HTTPS hop), DNS resolved
  and private/loopback/link‑local/metadata ranges rejected (re‑checked after
  each redirect), ≤3 redirects, 10s timeout, 1MB cap, content‑type allowlist,
  `robots.txt` respected, ≤5 pages per company.

---

## Avatar evidence rules

- **Real data only.** Every fact traces to one or more evidence IDs, or is a
  clearly labelled hypothesis, or is a standard placeholder (`Not determinable`
  / `Not confirmed`).
- Person facts come only from the person's profile/activity; **company website
  content is never converted into a person fact**.
- Person/company posts are capped at **seven**, newest first.
- Experience is derived only from explicit dated positions (never rounded up,
  never from education).
- Hypotheses use tentative language and appear only in the labelled hypothesis
  sections.
- Grounding validation (deterministic, no second LLM) removes any unsupported
  LLM claim; confidence is computed in code, never taken from the LLM.
- The complete evidence map lives in `avatar_evidence.json`.

---

## Exports

Fixed CSV columns (exact order):

```
full_name,headline,company,location,profile_url,source_search,collected_at,last_name,first_name,role,email,website,score,avatar_profile,profile_note
```

UTF‑8 **with BOM**, CRLF rows, RFC 4180 quoting, multi‑line avatar in one quoted
cell, and **formula‑injection protection** (`=`, `+`, `-`, `@`, tab, CR prefixed
with `'`). Also exported: `audit.json` (every input row), `avatar_evidence.json`
(provenance), `profiles_rejected.csv`, and `job_summary.json`.

---

## CRM / webhook synchronization

Accepted contacts are stored locally and can be organized into lists and tagged.
Saved sources support scheduled auto‑imports (daily/weekly/monthly via
`chrome.alarms`) with auto‑enrich and auto‑export. Automatic LinkedIn outreach is
**not** included in this version.

---

## Data deletion

- **Settings → Delete all data** clears local imports, jobs, avatars, and audit
  data, and calls the backend `DELETE /v1/data`.
- The backend enforces a retention window (`DATA_RETENTION_DAYS`).

---

## Security model

- LinkedIn tokens/client secrets: **not used** (no LinkedIn API).
- Backend binds to `127.0.0.1`, requires the install token, restricts CORS to
  configured extension IDs, limits body size (2MB), rate‑limits enrichment, and
  redacts names/posts/emails/URLs from normal logs.
- No remotely hosted extension code (MV3 requirement); strict CSP.
- SSRF protections on all website fetching.
- The token field in **Settings** is a password input. **Settings → Test backend
  connection** calls `GET /v1/auth/check` and shows four independent statuses:
  backend reachable, token valid, DeepSeek configured, Brave configured — so a
  setup problem is diagnosable without reading logs.
- API keys live only in `backend/.env` (git‑ignored). See **[SECURITY.md](SECURITY.md)**
  for credential rotation and git‑history‑scrubbing steps if a key ever leaks.

---

## Test commands

```bash
# Extension-independent selector/avatar/adapter/backend tests:
node tests/run.js

# Backend tests (mocked network / local servers):
cd backend && npm test

# Manifest validation, smoke test, and packaging:
npm run validate:manifest
npm run smoke
npm run package
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Backend "offline" in popup | Backend not running, wrong URL, or missing/incorrect install token |
| `401` from backend | Install token mismatch between extension Settings and `backend/.env` |
| `403` CORS | Your extension ID is not in `ALLOWED_EXTENSION_IDS` |
| Import stops as **BLOCKED** | LinkedIn checkpoint/verification — complete it in the tab, then retry. The tool does not bypass it. |
| `426`/version errors (LinkedIn API) | N/A — this tool uses no LinkedIn API |
| DeepSeek `429` | Rate limited; the client backs off and retries transient errors up to twice |
| Enrichment fails on every profile | Check the `profile_note` column — it now carries a classified reason, e.g. `deepseek/LLM_UNAUTHORIZED http 401` (revoked key), `LLM_PAYMENT_REQUIRED http 402` (no balance), `LLM_RATE_LIMITED http 429`, or `LLM_TIMEOUT`. Fix the key/balance in `backend/.env` and use **Test backend connection**. |
| "unsupported layout" on a page | The page's structure changed; see the selector‑maintenance guide below |

---

## Selector maintenance guide

Page selectors live in `content/selectors/*.js` as ordered fallback lists. When a
page layout changes:

1. Open the page, inspect the new structure.
2. Add a new, more‑specific selector to the **front** of the relevant list in
   `standard.js` / `sales-navigator.js` / `recruiter-lite.js`.
3. Add or update an HTML fixture under `tests/fixtures/` and a case in
   `tests/adapters/` so the change is covered.

Adapters throw an explicit `UnsupportedLayoutError` rather than guessing, so a
broken selector fails loudly instead of producing fabricated rows.

---

## Chrome Web Store / LinkedIn app‑review notes

Public Chrome Web Store publication is **not** an acceptance goal for this build,
and this tool is **not** submitted for LinkedIn app review (it uses no LinkedIn
API). If you adapt it for distribution, review the Web Store program policies and
LinkedIn's User Agreement first; scraping restrictions may make distribution
inappropriate.

## Known LinkedIn limitations

Layouts change without notice, paid‑product pages are especially volatile,
imports can stop at security checkpoints, and some data is simply not visible.
When data is unavailable, this tool marks it unavailable — it does not scrape a
hidden endpoint and does not invent a value.
