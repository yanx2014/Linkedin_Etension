// Parse a pasted list of profile URLs (newline/comma/space separated) into
// canonical records with just a profile_url. Non-URL tokens are ignored with a
// warning.

import { emptyCanonical } from './source-metadata.js';

export function parseUrlList(text, sourceType = 'url_list') {
  const raw = String(text == null ? '' : text);
  const tokens = raw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
  const records = [];
  const warnings = [];
  const seen = new Set();

  tokens.forEach((tok, i) => {
    let url;
    try {
      url = new URL(tok);
    } catch {
      warnings.push({ index: i, message: `not a URL: ${tok}` });
      return;
    }
    if (url.protocol !== 'https:') {
      warnings.push({ index: i, message: `non-https URL skipped: ${tok}` });
      return;
    }
    if (seen.has(tok)) return;
    seen.add(tok);
    const rec = emptyCanonical(sourceType);
    rec.source_record_id = `${sourceType}-${i}`;
    rec.profile_url = tok;
    rec.source_search = 'pasted url list';
    records.push(rec);
  });

  return { records, warnings };
}
