// Evidence map: a keyed store of source items that back every avatar fact. Each
// item has a stable source_id used by the grounding validator and recorded in
// audit.json (never shown in the avatar cell).

import { normalizeText } from '../selector/normalize.js';

export class EvidenceMap {
  constructor() {
    this.items = new Map(); // source_id -> item
  }

  add(item) {
    if (!item || !item.source_id) throw new Error('evidence item requires source_id');
    this.items.set(item.source_id, item);
    return item.source_id;
  }

  has(id) { return this.items.has(id); }
  get(id) { return this.items.get(id) || null; }

  // Concatenated normalized text of the referenced source ids.
  normalizedTextFor(ids) {
    const parts = [];
    for (const id of ids) {
      const item = this.items.get(id);
      if (item && item.text) parts.push(normalizeText(item.text));
    }
    return parts.join(' \n ');
  }

  list() { return Array.from(this.items.values()); }

  toJSON() {
    // Include full item metadata for audit.json.
    return this.list().map((it) => ({
      source_id: it.source_id,
      source_type: it.source_type,
      source_url: it.source_url || null,
      retrieved_at: it.retrieved_at || null,
      content_hash: it.content_hash || null
    }));
  }
}
