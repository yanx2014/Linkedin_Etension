// Bounded scrolling controller. Tracks scroll attempts and item growth to avoid
// unbounded loops. Deterministic; the actual scroll is performed by the content
// script (tab-controller injects a scroll step).

export class BoundedScroller {
  constructor({ maxAttempts = 20, maxNoGrowth = 3 } = {}) {
    this.maxAttempts = maxAttempts;
    this.maxNoGrowth = maxNoGrowth;
    this.attempts = 0;
    this.noGrowth = 0;
    this.lastCount = 0;
  }

  // Record the item count after a scroll step; returns whether to continue.
  record(count) {
    this.attempts += 1;
    if (count > this.lastCount) {
      this.noGrowth = 0;
    } else {
      this.noGrowth += 1;
    }
    this.lastCount = count;
    return this.shouldContinue();
  }

  shouldContinue() {
    if (this.attempts >= this.maxAttempts) return false;
    if (this.noGrowth >= this.maxNoGrowth) return false;
    return true;
  }
}
