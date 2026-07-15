// Central handling for blocked/checkpoint states. The tool never attempts to
// bypass a block; it stops safely and surfaces an actionable status.

import { JobState } from '../storage/jobs-repository.js';

export function markJobBlocked(job, details = {}) {
  job.state = JobState.BLOCKED;
  job.blocked = { at: new Date().toISOString(), ...details };
  return job;
}

export function isBlockedError(err) {
  return err && (err.code === 'BLOCKED_CHECKPOINT' || err.name === 'BlockedStateError');
}
