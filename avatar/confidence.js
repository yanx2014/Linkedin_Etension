// Evidence-based confidence. Computed in code after grounding validation; an
// LLM-provided confidence value is never trusted.
//
// Coverage inputs feed both a coverage score and the high/medium/low bands.

export function computeConfidence(v) {
  // v: {
  //   hasName, hasRole, hasCompany, hasConfirmedWebsite,
  //   hasResponsibility, hasPersonPostOrInterest,
  //   companyFactCount, hasCompanyPriorityOrActivity,
  //   hasConflict
  // }
  let coverage = 0;
  if (v.hasName) coverage += 10;
  if (v.hasRole) coverage += 15;
  if (v.hasCompany) coverage += 15;
  if (v.hasConfirmedWebsite) coverage += 15;
  if (v.hasResponsibility) coverage += 10;
  if (v.hasPersonPostOrInterest) coverage += 15;
  if ((v.companyFactCount || 0) >= 2) coverage += 10;
  if (v.hasCompanyPriorityOrActivity) coverage += 10;

  const baselineComplete = v.hasName && v.hasRole && v.hasCompany && v.hasConfirmedWebsite;

  let level;
  if (baselineComplete && coverage >= 75 && !v.hasConflict) {
    level = 'high';
  } else if (
    v.hasName &&
    countTrue([v.hasRole, v.hasCompany, v.hasLocation]) >= 2 &&
    (v.hasPersonPostOrInterest || (v.companyFactCount || 0) >= 1) &&
    !v.hasSeriousConflict &&
    coverage >= 40
  ) {
    level = 'medium';
  } else if (coverage >= 40 && !v.hasSeriousConflict) {
    level = 'medium';
  } else {
    level = 'low';
  }

  // Guard rails from the spec.
  if (!v.hasName || (!v.hasRole && !v.hasCompany)) level = 'low';
  if (v.onlyNameAndUrl) level = 'low';

  return { level, coverage };
}

function countTrue(arr) {
  return arr.filter(Boolean).length;
}
