# Privacy & Data Handling

This tool is designed to run locally for a single user. It has no telemetry and
no third-party analytics.

## What data is processed

- **Imported files** (JSON/CSV/URLs) you provide.
- **Data visible on pages you open** in your own authenticated browser session,
  collected only while an import job is running.
- **Company website content** fetched by the local backend for the companies of
  accepted profiles.
- **Selected profile + company evidence** sent to DeepSeek **only when you enable
  enrichment**.

## Where data lives

- Contacts, jobs, audit entries, and enrichment results are stored locally in
  the browser's IndexedDB.
- UI settings and the backend installation token are stored in
  `chrome.storage.local`.
- The backend caches enrichment results in a local file store.
- **No LinkedIn access token, refresh token, or client secret is used or stored**
  — this tool does not use the LinkedIn API.

## What is never collected

- Authentication cookies or session tokens (never read or transmitted).
- Hidden contact details, private messages, or non-visible fields.
- Guessed or inferred email addresses.

## Third parties

- **DeepSeek**: receives the profile/company evidence bundle for a profile when
  enrichment is enabled. The API key is held only by the local backend.
- **Brave Search**: receives company-name search queries (never a person's name)
  when automatic website discovery is enabled. The API key is held only by the
  local backend.

## Your controls

- Disable DeepSeek enrichment in Settings.
- "Delete all data" removes local imports, jobs, avatars, audit data, and asks
  the backend to delete its cached data.
- Configure a retention window for non-LinkedIn website/imported data.

## Your responsibilities

You are responsible for complying with platform terms of service, applicable
privacy law (e.g. GDPR/CCPA lawful basis, data-subject rights), and outreach law
(e.g. anti-spam rules) when using this tool.
