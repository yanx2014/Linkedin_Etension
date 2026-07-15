// Validate the DeepSeek JSON response against the expected structure, then
// (optionally) run grounding validation against the evidence map. Structural
// failures and unknown source ids are surfaced; the client also re-grounds.

import { validateGrounding } from '../../avatar/grounding-validator.js';

// Parse a raw model string into JSON. Tolerant of thinking-mode output that may
// wrap the JSON in prose or code fences: tries a direct parse, then extracts the
// outermost {...} object. Returns { ok, value, error }.
export function parseModelJson(raw) {
  if (raw && typeof raw === 'object') return { ok: true, value: raw };
  const s = String(raw == null ? '' : raw).trim();
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    // Strip code fences and extract the first balanced { ... } block.
    const stripped = s.replace(/```(?:json)?/gi, '');
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(stripped.slice(start, end + 1)) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    return { ok: false, error: 'no JSON object found in model output' };
  }
}

// Structural schema check.
export function validateStructure(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['not an object'] };
  if (!obj.person || typeof obj.person !== 'object') errors.push('missing person');
  if (!obj.company || typeof obj.company !== 'object') errors.push('missing company');
  const arrays = [
    ['person', 'verified_responsibilities'], ['person', 'verified_professional_interests'],
    ['person', 'observed_prospect_facts'], ['company', 'company_context'],
    ['company', 'verified_company_priorities'], ['company', 'observed_company_facts']
  ];
  for (const [a, b] of arrays) {
    const v = obj[a] && obj[a][b];
    if (v != null && !Array.isArray(v)) errors.push(`${a}.${b} must be an array`);
    for (const item of v || []) {
      if (item && typeof item === 'object' && !('value' in item)) errors.push(`${a}.${b} item missing value`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Full validation: structure + grounding. evidence is an EvidenceMap.
export function validateResponse(obj, evidence) {
  const structure = validateStructure(obj);
  if (!structure.valid) return { valid: false, errors: structure.errors, validated: null, warnings: [] };
  const { validated, warnings } = validateGrounding(obj, evidence);
  return { valid: true, errors: [], validated, warnings };
}
