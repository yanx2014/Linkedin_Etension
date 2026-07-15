// Parse experience list items into structured positions. Dates are parsed into
// YYYY-MM where possible; "Present"/"current" marks is_current. Only explicitly
// visible fields are used.

import { text, attr, queryOne } from '../selectors/common.js';
import { parseYearMonth } from '../../utils/dates.js';

const SEL = {
  title: ['.exp-title', '[data-testid="exp-title"]', '.t-bold span[aria-hidden="true"]', 'h3'],
  company: ['.exp-company', '[data-testid="exp-company"]', '.t-normal span[aria-hidden="true"]'],
  dates: ['.exp-dates', '[data-testid="exp-dates"]', '.pvs-entity__caption-wrapper', '.t-black--light span[aria-hidden="true"]'],
  description: ['.exp-description', '[data-testid="exp-description"]', '.inline-show-more-text'],
  companyLink: ['a[href*="/company/"]']
};

export function extractExperienceItem(itemEl) {
  const title = text(queryOne(itemEl, SEL.title));
  const company = text(queryOne(itemEl, SEL.company));
  const datesText = text(queryOne(itemEl, SEL.dates));
  const description = text(queryOne(itemEl, SEL.description));
  const companyLink = queryOne(itemEl, SEL.companyLink);
  const { start_date, end_date, is_current } = parseDateRange(datesText);
  return {
    title: title || '',
    company: company || '',
    start_date,
    end_date,
    is_current,
    description: description || '',
    company_linkedin_url: companyLink ? attr(companyLink, 'href') : null
  };
}

// Parse "Mar 2021 - Present", "Jan 2017 - Feb 2021", "2019 - 2021".
export function parseDateRange(str) {
  const s = String(str || '').replace(/–|—/g, '-');
  const parts = s.split(/\s*-\s*|\s+to\s+/i);
  if (parts.length < 1 || !parts[0]) return { start_date: null, end_date: null, is_current: null };
  const startYm = parseYearMonth(parts[0]);
  const start_date = startYm ? fmt(startYm) : null;

  let end_date = null;
  let is_current = null;
  if (parts.length >= 2) {
    const rhs = parts[1].trim().toLowerCase();
    if (/present|current|now/.test(rhs)) {
      is_current = true;
    } else {
      const endYm = parseYearMonth(parts[1]);
      end_date = endYm ? fmt(endYm) : null;
      is_current = false;
    }
  }
  return { start_date, end_date, is_current };
}

function fmt(ym) {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}
