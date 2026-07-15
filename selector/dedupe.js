// Deduplication keyed on canonical profile URL. First occurrence is the primary
// record. Later occurrences are recorded as duplicates; non-conflicting empty
// fields may be merged into the primary, but existing non-empty values are never
// overwritten (conflicts are recorded as warnings).

// A Deduper accumulates records across a job (and, when seeded, across previous
// jobs/sources) and reports whether each new record is a duplicate.
export class Deduper {
  // seenKeys: optional iterable of canonical URLs already present in the
  // workspace, so duplicates are prevented across jobs and saved sources.
  constructor(seenKeys = []) {
    this.primaryByKey = new Map(); // key -> primary record
    this.crossJobKeys = new Set(seenKeys);
  }

  // Determine the dedupe key for a record: canonical_profile_url when present,
  // else a source-native stable id.
  static keyFor(record) {
    if (record.canonical_url) return `url:${record.canonical_url}`;
    if (record.canonical_profile_url) return `url:${record.canonical_profile_url}`;
    if (record.source_record_id) return `src:${record.source_record_id}`;
    return null;
  }

  // Returns { isDuplicate, key, duplicateOf, warnings, crossJob }.
  consider(record) {
    const key = Deduper.keyFor(record);
    const warnings = [];
    if (!key) {
      return { isDuplicate: false, key: null, duplicateOf: null, warnings, crossJob: false };
    }

    if (this.primaryByKey.has(key)) {
      const primary = this.primaryByKey.get(key);
      const mergeWarnings = mergeInto(primary, record);
      return {
        isDuplicate: true,
        key,
        duplicateOf: primary.__dedupe_index ?? null,
        warnings: mergeWarnings,
        crossJob: false
      };
    }

    const crossJob = this.crossJobKeys.has(key.startsWith('url:') ? key.slice(4) : key);
    if (crossJob) {
      return { isDuplicate: true, key, duplicateOf: null, warnings, crossJob: true };
    }

    return { isDuplicate: false, key, duplicateOf: null, warnings, crossJob: false };
  }

  // Register a record as the primary for its key.
  register(record, index) {
    const key = Deduper.keyFor(record);
    if (!key) return;
    record.__dedupe_index = index;
    if (!this.primaryByKey.has(key)) this.primaryByKey.set(key, record);
  }
}

// Merge non-conflicting explicit fields from `incoming` into empty fields of
// `primary`. Never overwrite a non-empty primary value. Returns warnings for
// conflicting non-empty values.
export function mergeInto(primary, incoming) {
  const warnings = [];
  const scalarFields = [
    'full_name', 'first_name', 'last_name', 'headline', 'role', 'company',
    'location', 'email', 'company_website', 'summary'
  ];
  for (const field of scalarFields) {
    const inVal = incoming[field];
    if (inVal == null || inVal === '') continue;
    const curVal = primary[field];
    if (curVal == null || curVal === '') {
      primary[field] = inVal;
    } else if (String(curVal).trim() !== String(inVal).trim()) {
      warnings.push(`conflict:${field}`);
    }
  }
  // Preserve all source-list memberships.
  if (incoming.list_ids) {
    primary.list_ids = Array.from(new Set([...(primary.list_ids || []), ...incoming.list_ids]));
  }
  if (incoming.source_url && Array.isArray(primary.source_urls)) {
    if (!primary.source_urls.includes(incoming.source_url)) primary.source_urls.push(incoming.source_url);
  }
  return warnings;
}
