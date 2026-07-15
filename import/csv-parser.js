// RFC 4180 CSV parser. Handles UTF-8 BOM, quoted fields, embedded commas,
// embedded newlines, and doubled quotes. Returns an array of row objects keyed
// by the header row.

export function parseCsv(text, delimiterOpt) {
  let input = String(text == null ? '' : text);
  // Strip UTF-8 BOM.
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  // Auto-detect delimiter from the header line (comma or semicolon) unless one
  // is explicitly provided.
  const delimiter = delimiterOpt || detectDelimiter(input);

  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); rows.push(record); record = []; };

  while (i < n) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === delimiter) { endField(); i += 1; continue; }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      endRecord(); i += 1; continue;
    }
    if (ch === '\n') { endRecord(); i += 1; continue; }
    field += ch; i += 1;
  }
  // Flush trailing field/record if any content remains.
  if (field !== '' || record.length > 0) endRecord();

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return finish(rows, header);
}

// Choose delimiter by counting occurrences on the first line (outside quotes is
// approximated by simple counting, which is sufficient for header detection).
function detectDelimiter(input) {
  const firstLine = input.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

function finish(rows, header) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') continue; // skip blank lines
    const obj = {};
    header.forEach((key, c) => { obj[key] = cells[c] != null ? cells[c] : ''; });
    out.push(obj);
  }
  return out;
}
