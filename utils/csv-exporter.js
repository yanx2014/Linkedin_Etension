// RFC 4180 CSV export with UTF-8 BOM, CRLF rows, and spreadsheet
// formula-injection protection. Column set and order are fixed and must not
// change.

export const CSV_COLUMNS = Object.freeze([
  'full_name', 'headline', 'company', 'location', 'profile_url', 'source_search',
  'collected_at', 'last_name', 'first_name', 'role', 'email', 'website', 'score',
  'avatar_profile', 'profile_note'
]);

const BOM = '﻿';
const CRLF = '\r\n';
// Default field delimiter. Semicolon opens natively in European/French Excel
// (which treats comma-CSV as a single column). Override per call if needed.
export const DEFAULT_DELIMITER = ';';
const DANGEROUS_LEADING = new Set(['=', '+', '-', '@']);
const LEADING_CONTROLS = new Set(['\t', '\r', '\n']);

// Guard a single cell against formula injection. Returns { value, escaped }.
// The original value is preserved; only a single leading apostrophe is added.
export function formulaGuard(input) {
  const s = input == null ? '' : String(input);
  if (s === '') return { value: '', escaped: false };

  // Leading control characters (tab / CR / LF) are dangerous on their own.
  if (LEADING_CONTROLS.has(s[0])) {
    return { value: `'${s}`, escaped: true };
  }
  // After skipping leading spaces, a dangerous formula character triggers guard.
  const stripped = s.replace(/^ +/, '');
  if (stripped && DANGEROUS_LEADING.has(stripped[0])) {
    return { value: `'${s}`, escaped: true };
  }
  return { value: s, escaped: false };
}

// RFC 4180 field quoting: quote when the field contains the delimiter, a quote,
// CR, or LF; embedded quotes are doubled.
export function csvQuoteField(value, delimiter = DEFAULT_DELIMITER) {
  const s = value == null ? '' : String(value);
  if (s.includes(delimiter) || /["\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Convert one record object into an ordered array of guarded, quoted cells.
function serializeRecord(record, escapedAudit, rowIndex, delimiter) {
  return CSV_COLUMNS.map((col) => {
    const raw = record[col];
    const flat = flattenValue(raw);
    const guarded = formulaGuard(flat);
    if (guarded.escaped) escapedAudit.push({ row: rowIndex, column: col });
    return csvQuoteField(guarded.value, delimiter);
  });
}

// Never stringify objects/arrays as "[object Object]". Arrays join with "; ",
// objects are JSON-encoded (should not normally reach the CSV layer).
function flattenValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => flattenValue(v)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Export an array of enriched records to a CSV string.
// Returns { content, escaped } where `escaped` lists guarded cells for the audit.
export function exportProfilesCsv(records, { delimiter = DEFAULT_DELIMITER } = {}) {
  const escaped = [];
  const headerLine = CSV_COLUMNS.map((c) => csvQuoteField(c, delimiter)).join(delimiter);
  const lines = [headerLine];
  records.forEach((rec, i) => {
    lines.push(serializeRecord(rec, escaped, i, delimiter).join(delimiter));
  });
  const content = BOM + lines.join(CRLF) + CRLF;
  return { content, escaped };
}

// Export rejected rows to a minimal CSV (subset of columns + reason).
export function exportRejectedCsv(rejectedRecords, { delimiter = DEFAULT_DELIMITER } = {}) {
  const cols = ['full_name', 'profile_url', 'source_search', '__reason'];
  const escaped = [];
  const header = cols.map((c) => csvQuoteField(c === '__reason' ? 'reason' : c, delimiter)).join(delimiter);
  const lines = [header];
  rejectedRecords.forEach((rec) => {
    const cells = cols.map((c) => {
      const g = formulaGuard(flattenValue(rec[c]));
      if (g.escaped) escaped.push({ column: c });
      return csvQuoteField(g.value, delimiter);
    });
    lines.push(cells.join(delimiter));
  });
  return { content: BOM + lines.join(CRLF) + CRLF, escaped };
}
