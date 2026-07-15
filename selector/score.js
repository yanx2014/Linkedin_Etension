// Deterministic 0-100 scoring. Never uses ML or hidden weighting. The score is
// computed from evidence coverage; DeepSeek never calculates it.
//
// Breakdown (max 100):
//   30 required-group coverage
//   20 required-term coverage
//   10 search-keyword coverage
//   20 core-profile completeness (name, headline/role, company, location, url)
//   10 person-activity evidence (>=1 person-authored item)
//   10 confirmed-company evidence (confirmed website or explicit company profile)

import { tokenize } from './tokenize.js';
import { matchTerm, buildPreviewCorpus } from './match.js';

export function computeScore(record, criteria, matchDetails, evidence = {}) {
  const components = [];
  let total = 0;

  // Required-group coverage (30): proportion of groups matched.
  const groups = criteria.preview_required_groups || [];
  if (groups.length > 0) {
    const matched = Object.keys(matchDetails.matchedGroups || {}).length;
    const pts = Math.round((matched / groups.length) * 30);
    components.push({ key: 'required_group_coverage', points: pts, max: 30, detail: `${matched}/${groups.length}` });
    total += pts;
  } else {
    components.push({ key: 'required_group_coverage', points: 30, max: 30, detail: 'no_groups_defined' });
    total += 30;
  }

  // Required-term coverage (20).
  const reqTerms = criteria.preview_required_terms || [];
  if (reqTerms.length > 0) {
    const matched = (matchDetails.matchedRequiredTerms || []).length;
    const pts = Math.round((matched / reqTerms.length) * 20);
    components.push({ key: 'required_term_coverage', points: pts, max: 20, detail: `${matched}/${reqTerms.length}` });
    total += pts;
  } else {
    components.push({ key: 'required_term_coverage', points: 20, max: 20, detail: 'no_required_terms' });
    total += 20;
  }

  // Search-keyword coverage (10): fraction of keyword tokens present in preview.
  const kwTokens = tokenize(criteria.search_keywords || '');
  if (kwTokens.length > 0) {
    const corpusTokens = matchDetails.corpusTokens || tokenize(buildPreviewCorpus(record));
    const present = kwTokens.filter((t) => corpusTokens.includes(t)).length;
    const pts = Math.round((present / kwTokens.length) * 10);
    components.push({ key: 'search_keyword_coverage', points: pts, max: 10, detail: `${present}/${kwTokens.length}` });
    total += pts;
  } else {
    components.push({ key: 'search_keyword_coverage', points: 0, max: 10, detail: 'no_keywords' });
  }

  // Core-profile completeness (20): 4 points each for name, headline/role,
  // company, location, canonical url.
  const coreChecks = [
    !!(record.full_name || (record.first_name && record.last_name)),
    !!(record.headline || record.role),
    !!(record.company || record.current_company),
    !!record.location,
    !!(record.canonical_url || record.canonical_profile_url)
  ];
  const coreHits = coreChecks.filter(Boolean).length;
  const corePts = coreHits * 4;
  components.push({ key: 'core_profile_completeness', points: corePts, max: 20, detail: `${coreHits}/5` });
  total += corePts;

  // Person-activity evidence (10).
  const hasActivity = !!(evidence.hasPersonPosts || (Array.isArray(record.posts) && record.posts.length > 0));
  const actPts = hasActivity ? 10 : 0;
  components.push({ key: 'person_activity_evidence', points: actPts, max: 10, detail: hasActivity ? 'present' : 'absent' });
  total += actPts;

  // Confirmed-company evidence (10).
  const hasCompany = !!(evidence.hasConfirmedWebsite || evidence.hasCompanyProfile);
  const compPts = hasCompany ? 10 : 0;
  components.push({ key: 'confirmed_company_evidence', points: compPts, max: 10, detail: hasCompany ? 'present' : 'absent' });
  total += compPts;

  total = Math.max(0, Math.min(100, total));
  return { score: total, breakdown: components };
}
