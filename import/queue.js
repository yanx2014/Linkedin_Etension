// Simple in-memory work queue with per-item state. The authoritative copy lives
// in IndexedDB (storage/jobs-repository.js); this is the runtime view the
// orchestrator drives. Pure and testable.

export const ProfileState = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  PREVIEW_ACCEPTED: 'PREVIEW_ACCEPTED',
  PREVIEW_REJECTED: 'PREVIEW_REJECTED',
  PROFILE_PENDING: 'PROFILE_PENDING',
  PROFILE_COLLECTED: 'PROFILE_COLLECTED',
  ACTIVITY_COLLECTED: 'ACTIVITY_COLLECTED',
  ACTIVITY_UNAVAILABLE: 'ACTIVITY_UNAVAILABLE',
  COMPANY_RESEARCHED: 'COMPANY_RESEARCHED',
  COMPANY_UNCONFIRMED: 'COMPANY_UNCONFIRMED',
  LLM_STRUCTURED: 'LLM_STRUCTURED',
  VALIDATED: 'VALIDATED',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

export class Queue {
  constructor(items = []) {
    this.items = items.map((it, i) => ({ index: i, state: ProfileState.DISCOVERED, data: it, error: null }));
  }

  add(item) {
    this.items.push({ index: this.items.length, state: ProfileState.DISCOVERED, data: item, error: null });
  }

  setState(index, state, error = null) {
    const it = this.items[index];
    if (it) { it.state = state; it.error = error; }
  }

  // Items that still need processing (not complete/failed/rejected).
  pending() {
    return this.items.filter((it) =>
      it.state !== ProfileState.COMPLETE &&
      it.state !== ProfileState.FAILED &&
      it.state !== ProfileState.PREVIEW_REJECTED);
  }

  next(fromStates) {
    return this.items.find((it) => fromStates.includes(it.state)) || null;
  }

  counts() {
    const out = {};
    for (const it of this.items) out[it.state] = (out[it.state] || 0) + 1;
    return out;
  }
}
