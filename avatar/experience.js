// Deterministic professional-experience calculation from dated positions only.
// Never derives experience from education. Never rounds up. Returns
// { value, derived, note } where value is a "X.Y" year string or "Not
// determinable".

import { parseYearMonth, toMonthIndex, currentYearMonth, totalUniqueMonths, monthsToYears } from '../utils/dates.js';

export function computeExperience(experience, nowMs = Date.now()) {
  const entries = Array.isArray(experience) ? experience : [];
  const intervals = [];
  let incomplete = false;
  let validCount = 0;

  for (const e of entries) {
    const start = parseYearMonth(e.start_date);
    if (!start) {
      if (e.start_date || e.end_date) incomplete = true;
      continue; // ignore positions without a valid start date
    }
    let end;
    if (e.is_current === true) {
      end = currentYearMonth(nowMs);
    } else {
      end = parseYearMonth(e.end_date);
      if (!end) { incomplete = true; continue; }
    }
    const startIdx = toMonthIndex(start);
    const endIdx = toMonthIndex(end) + 1; // inclusive of end month
    if (endIdx <= startIdx) { incomplete = true; continue; }
    intervals.push({ start: startIdx, end: endIdx });
    validCount += 1;
  }

  if (validCount === 0) {
    return { value: 'Not determinable', derived: false, note: intervals.length === 0 ? 'no dated positions' : null };
  }

  const months = totalUniqueMonths(intervals);
  const years = monthsToYears(months);
  return {
    value: years,
    derived: true,
    months,
    note: incomplete ? 'timeline may be incomplete' : null
  };
}
