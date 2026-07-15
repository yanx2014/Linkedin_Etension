// Parse imported JSON into canonical records. Accepts either an array of
// records or an object with a `profiles`/`records`/`data` array.

import { normalizeRecord } from './source-metadata.js';

export function parseJsonImport(text, sourceType = 'import_json') {
  let data;
  if (typeof text === 'string') {
    data = JSON.parse(text);
  } else {
    data = text;
  }
  const arr = extractArray(data);
  const records = [];
  const warnings = [];
  arr.forEach((raw, i) => {
    const { record, warnings: w } = normalizeRecord(raw, sourceType);
    if (!record.source_record_id) record.source_record_id = raw.source_record_id || `${sourceType}-${i}`;
    // Preserve already-structured fields that aren't aliased.
    for (const key of ['experience', 'responsibilities', 'posts', 'summary', 'collected_at', 'source_search', 'linkedin_person_id']) {
      if (raw[key] != null && (record[key] == null || record[key] === '' || (Array.isArray(record[key]) && record[key].length === 0))) {
        record[key] = raw[key];
      }
    }
    records.push(record);
    warnings.push(...w.map((msg) => ({ index: i, message: msg })));
  });
  return { records, warnings };
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['profiles', 'records', 'data', 'items']) {
      if (Array.isArray(data[key])) return data[key];
    }
    return [data];
  }
  return [];
}
