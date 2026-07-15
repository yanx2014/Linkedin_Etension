// Build company facts from extracted website pages. Distinguishes generic
// context facts from explicit priority statements (via priority markers). Every
// fact carries its source URL and a supporting excerpt.

import { sha256HexSync } from '../security/redaction.js';

const PRIORITY_MARKERS = [
  'our priority', 'we are focused on', 'we are investing in', 'our strategy',
  'we launched', 'we are expanding', 'we aim to', 'we are committed to', 'our mission is', 'our focus'
];

export function buildCompanyFacts(pages) {
  const facts = [];
  let idx = 0;
  for (const page of pages || []) {
    const sentences = splitSentences([page.description, ...(page.headings || []), ...(page.paragraphs || [])].filter(Boolean).join('. '));
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const isPriority = PRIORITY_MARKERS.some((m) => lower.includes(m));
      // Keep meaningful sentences only.
      if (sentence.length < 25 || sentence.length > 400) continue;
      const field = isPriority ? 'company_priority' : 'company_context';
      facts.push({
        fact_id: `fact_${++idx}`,
        entity_type: 'company',
        field,
        value: sentence,
        source_type: 'official_company_website',
        source_url: page.url,
        source_title: page.title || null,
        supporting_excerpt: sentence.slice(0, 240),
        retrieved_at: page.retrieved_at || null,
        content_hash: sha256HexSync(sentence),
        confidence: 1,
        extraction_method: isPriority ? 'explicit_priority_sentence' : 'explicit_sentence'
      });
      if (facts.filter((f) => f.field === 'company_context').length >= 6 && !isPriority) continue;
    }
  }
  // Cap: keep a reasonable number; downstream avatar caps further.
  const context = facts.filter((f) => f.field === 'company_context').slice(0, 6);
  const priority = facts.filter((f) => f.field === 'company_priority').slice(0, 4);
  return [...context, ...priority];
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
