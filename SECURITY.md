# Security

## Where secrets live

- **API keys** (DeepSeek, Brave Search) live **only** in `backend/.env`, which is
  git-ignored. They are never placed in the extension, never sent to the browser,
  and never logged. All DeepSeek and Brave calls originate from the local backend.
- The **installation token** is a shared secret between the extension and the
  backend. It is stored in `chrome.storage.local` on the extension side and in
  `backend/.env` (`INSTALL_TOKEN`) on the backend side. The Settings panel renders
  the token field as a password input.
- `.env` and `backend/.env` are listed in `.gitignore`. Runtime data stores
  (`backend/data/*.json`, `*.sqlite`) are git-ignored as well, so collected
  profile data is never committed.

## Reporting

This is a private, unpacked-use tool. If you find a vulnerability, do not open a
public issue containing secrets or personal data — remove any keys or profile
text first.

## If a key is leaked

A leaked key committed to git history is **not** removed by deleting the file in a
later commit — the value remains reachable in history. Rotate first, then scrub.

### 1. Rotate the credential immediately

- **DeepSeek:** sign in to the DeepSeek platform, revoke the exposed API key, and
  issue a new one. Put the new value in `backend/.env` (`DEEPSEEK_API_KEY`).
- **Brave Search:** revoke and reissue the key in the Brave API dashboard, then
  update `BRAVE_SEARCH_API_KEY` in `backend/.env`.
- **Installation token:** regenerate with
  `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`,
  update `INSTALL_TOKEN` in `backend/.env`, and paste the new value into the
  extension Settings panel.

Rotation is the only step that actually invalidates the exposed secret. Do the
history scrub for hygiene, but treat the old key as compromised regardless.

### 2. Scrub the value from git history

Using `git filter-repo` (recommended):

```bash
pip install git-filter-repo
# Replace the literal secret everywhere in history:
printf 'OLD_SECRET==>REDACTED\n' > /tmp/replacements.txt
git filter-repo --replace-text /tmp/replacements.txt
```

Or remove an entire file that was committed by mistake:

```bash
git filter-repo --path backend/.env --invert-paths
git filter-repo --path backend/data/enrichment.json --invert-paths
```

Then force-push the rewritten history to every affected branch and tell
collaborators to re-clone (rewritten history diverges from their local copies):

```bash
git push --force-with-lease origin <branch>
```

### 3. Verify

```bash
git log -p | grep -nE 'sk-[a-zA-Z0-9]{20,}|BSA[a-zA-Z0-9_-]{20,}' || echo "clean"
```

## Secret scanning in CI

`.github/workflows/secret-scan.yml` runs a lightweight scan on every push and pull
request. It fails the build if a value matching a DeepSeek (`sk-…`) or Brave
(`BSA…`) key shape appears in tracked files. This is a backstop, not a substitute
for keeping keys in `.env`.
