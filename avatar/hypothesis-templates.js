// Deterministic hypothesis templates. Hypotheses are generated in code (never by
// the LLM) from broad, verified role/company context. Every hypothesis uses
// tentative language (may/might/could) and records its template id and the
// verified fields it relied on.

import { normalizeText } from '../selector/normalize.js';

export const TEMPLATES = [
  {
    template_id: 'sales_leader_pipeline',
    role_patterns: ['sales director', 'head of sales', 'vp sales', 'vice president sales', 'chief revenue officer', 'cro', 'head of revenue', 'revenue leader'],
    required_verified_fields: ['role'],
    objectives: ['May be evaluating ways to improve the consistency of the sales pipeline.'],
    challenges: ['May need to balance pipeline growth with process consistency.']
  },
  {
    template_id: 'founder_growth',
    role_patterns: ['founder', 'co founder', 'ceo', 'chief executive officer', 'managing director'],
    required_verified_fields: ['role'],
    objectives: ['May be looking for repeatable ways to grow the business predictably.'],
    challenges: ['May need to prioritise where to invest limited resources for growth.']
  },
  {
    template_id: 'recruiter_sourcing',
    role_patterns: ['recruiter', 'talent acquisition', 'head of talent', 'recruiting lead', 'talent partner'],
    required_verified_fields: ['role'],
    objectives: ['May be evaluating ways to improve candidate sourcing efficiency.'],
    challenges: ['May need to shorten time-to-hire while keeping candidate quality high.']
  },
  {
    template_id: 'operations_process',
    role_patterns: ['operations', 'coo', 'head of operations', 'chief operating officer', 'ops lead', 'revenue operations', 'revops'],
    required_verified_fields: ['role'],
    objectives: ['May be looking to standardise and streamline internal processes.'],
    challenges: ['May need to maintain process consistency as the organisation scales.']
  },
  {
    template_id: 'marketing_demand',
    role_patterns: ['marketing', 'cmo', 'head of marketing', 'demand generation', 'growth marketing'],
    required_verified_fields: ['role'],
    objectives: ['May be evaluating ways to generate more qualified demand.'],
    challenges: ['May need to connect marketing activity to measurable pipeline.']
  },
  {
    template_id: 'engineering_delivery',
    role_patterns: ['engineering', 'cto', 'head of engineering', 'vp engineering', 'engineering manager', 'technical lead'],
    required_verified_fields: ['role'],
    objectives: ['May be looking to improve delivery speed without sacrificing quality.'],
    challenges: ['May need to balance new feature work with technical maintenance.']
  }
];

function roleMatches(normalizedRole, patterns) {
  return patterns.some((p) => normalizedRole.includes(normalizeText(p)));
}

// Generate hypotheses from a verified role. Returns
// { objectives: [{text, template_id, verified_fields}], challenges: [...] }.
// No hypotheses are produced when role is absent/unverified.
export function generateHypotheses({ role, companyName } = {}) {
  const result = { objectives: [], challenges: [] };
  if (!role || String(role).trim() === '' || role === 'Not determinable') return result;

  const normalizedRole = normalizeText(role);
  const verifiedFields = ['role'];
  if (companyName && companyName !== 'Not determinable') verifiedFields.push('company');

  for (const tpl of TEMPLATES) {
    if (!roleMatches(normalizedRole, tpl.role_patterns)) continue;
    for (const obj of tpl.objectives) {
      if (result.objectives.length < 2) {
        result.objectives.push({ text: obj, template_id: tpl.template_id, verified_fields: verifiedFields.slice() });
      }
    }
    for (const ch of tpl.challenges) {
      if (result.challenges.length < 2) {
        result.challenges.push({ text: ch, template_id: tpl.template_id, verified_fields: verifiedFields.slice() });
      }
    }
    if (result.objectives.length >= 2 && result.challenges.length >= 2) break;
  }
  return result;
}
