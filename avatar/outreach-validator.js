// Outreach message validation and deterministic fallback generation. The tool
// only produces a draft; it never sends anything.

import { wordCount } from '../utils/text.js';
import { isValueSupported } from './grounding-validator.js';

const MAX_WORDS = 70;

// Phrases that indicate fabricated familiarity / pressure / unsupported claims.
const BANNED_PATTERNS = [
  /\bi(?:'| ha)ve been following you\b/i,
  /\blong[- ]time (?:fan|follower)\b/i,
  /\bi(?:'| a)m impressed\b/i,
  /\bhuge fan\b/i,
  /\bsubject:/i,
  /\bguarantee\b/i,
  /\b\d+% (?:increase|growth|improvement)\b/i
];

// Validate an outreach message against evidence. Returns { ok, message, warnings }.
export function validateOutreach(message, evidence, citedSourceIds = []) {
  const warnings = [];
  if (!message || String(message).trim() === '') {
    return { ok: false, message: null, warnings: ['empty'] };
  }
  const text = String(message).trim();

  if (wordCount(text) > MAX_WORDS) {
    return { ok: false, message: null, warnings: ['too_long'] };
  }
  for (const re of BANNED_PATTERNS) {
    if (re.test(text)) {
      warnings.push(`banned_phrase:${re}`);
      return { ok: false, message: null, warnings };
    }
  }
  // If the message cites sources, they must exist and support the message.
  if (citedSourceIds.length > 0) {
    for (const id of citedSourceIds) {
      if (!evidence.has(id)) return { ok: false, message: null, warnings: [`unknown_source_id:${id}`] };
    }
    const srcText = evidence.normalizedTextFor(citedSourceIds);
    // Require that at least the referenced-topic content is supported; we do a
    // soft check — the message may add neutral connective language.
    if (!hasSomeSupport(text, srcText)) {
      warnings.push('weak_support');
    }
  }
  return { ok: true, message: text, warnings };
}

function hasSomeSupport(message, srcText) {
  // Consider supported if any 3+ char content token of the message appears in
  // the source (topic anchor). Purely connective messages are allowed via the
  // fallback path which cites verified facts directly.
  const tokens = message.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const src = srcText;
  return tokens.some((t) => src.includes(t));
}

// Build a deterministic fallback message from verified facts. Omits clauses
// whose values are unavailable. Returns null when there is no verified anchor.
export function buildFallbackOutreach({ firstName, role, company, postTopic } = {}) {
  const name = firstName && firstName !== 'Not determinable' ? firstName : 'there';
  const clauses = [];
  if (role && role !== 'Not determinable') {
    let roleClause = `I noticed your work as ${role}`;
    if (company && company !== 'Not determinable') roleClause += ` at ${company}`;
    clauses.push(roleClause);
  } else if (company && company !== 'Not determinable') {
    clauses.push(`I noticed your work at ${company}`);
  }
  if (postTopic) clauses.push(`your recent comments about ${postTopic}`);

  if (clauses.length === 0) return null; // no verified anchor -> no message

  const body = clauses.join(' and ');
  const message = `Hello ${name}, ${body}. I'm reaching out because that is relevant to the work I'm exploring. Would a brief exchange be useful?`;
  if (wordCount(message) > MAX_WORDS) {
    // Trim the trailing clause if too long.
    const shorter = `Hello ${name}, ${clauses[0]}. Would a brief exchange be useful?`;
    return shorter;
  }
  return message;
}

export { MAX_WORDS };
