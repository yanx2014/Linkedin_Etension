// Deterministic date helpers. All calculations avoid locale ambiguity and never
// round experience durations upward (per the avatar spec).

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

// Parse a "YYYY-MM", "YYYY/MM", "YYYY", "Mon YYYY", or ISO-8601 string into
// { year, month } (month 1-12), or null when it cannot be determined.
export function parseYearMonth(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;

  // ISO-8601 or YYYY-MM / YYYY/MM
  let m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year, month };
    return null;
  }

  // "Mon YYYY" (e.g. "jan 2020", "january 2020")
  m = s.match(/^([a-z]{3,})\.?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3)];
    if (month) return { year: Number(m[2]), month };
    return null;
  }

  // Bare year
  m = s.match(/^(\d{4})$/);
  if (m) return { year: Number(m[1]), month: 1 };

  return null;
}

// Convert { year, month } into an absolute month index for interval math.
export function toMonthIndex(ym) {
  return ym.year * 12 + (ym.month - 1);
}

// The current { year, month } in UTC, given a reference timestamp (ms).
export function currentYearMonth(nowMs = Date.now()) {
  const d = new Date(nowMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// Merge overlapping/adjacent [start,end] month-index intervals and return the
// total count of unique months covered. Intervals are inclusive of start,
// exclusive of end (end = last month index + 1).
export function totalUniqueMonths(intervals) {
  const valid = intervals
    .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  if (valid.length === 0) return 0;

  let total = 0;
  let curStart = valid[0].start;
  let curEnd = valid[0].end;
  for (let i = 1; i < valid.length; i++) {
    const iv = valid[i];
    if (iv.start <= curEnd) {
      curEnd = Math.max(curEnd, iv.end);
    } else {
      total += curEnd - curStart;
      curStart = iv.start;
      curEnd = iv.end;
    }
  }
  total += curEnd - curStart;
  return total;
}

// Format a month count as years with one decimal place, truncated (never
// rounded up), e.g. 30 months => "2.5".
export function monthsToYears(months) {
  const years = Math.floor((months / 12) * 10) / 10;
  return years.toFixed(1);
}

// Current ISO-8601 timestamp (UTC).
export function isoNow(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}
