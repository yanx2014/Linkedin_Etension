// Jobs repository. Jobs and their per-profile states persist here so a job can
// resume after browser/service-worker/backend restarts.

import { put, get, getAll, del, STORES } from './database.js';
import { newId } from '../utils/messages.js';

export const JobState = Object.freeze({
  CREATED: 'CREATED', DISCOVERING: 'DISCOVERING', SELECTING: 'SELECTING',
  COLLECTING_PROFILES: 'COLLECTING_PROFILES', COLLECTING_ACTIVITY: 'COLLECTING_ACTIVITY',
  RESEARCHING_COMPANIES: 'RESEARCHING_COMPANIES', STRUCTURING: 'STRUCTURING',
  VALIDATING: 'VALIDATING', EXPORTING: 'EXPORTING', COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED', BLOCKED: 'BLOCKED', CANCELLED: 'CANCELLED', PARTIAL: 'PARTIAL', FAILED: 'FAILED'
});

export async function createJob(partial = {}) {
  const job = {
    id: newId(),
    state: JobState.CREATED,
    source_type: partial.source_type || null,
    source_url: partial.source_url || null,
    criteria: partial.criteria || null,
    profiles: [], // per-profile state entries
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    selector_version: '1',
    prompt_version: '1',
    ...partial
  };
  await put(STORES.JOBS, job);
  return job;
}

export async function saveJob(job) {
  await put(STORES.JOBS, job);
  return job;
}

export async function getJob(id) {
  return get(STORES.JOBS, id);
}

export async function allJobs() {
  return getAll(STORES.JOBS);
}

export async function deleteJob(id) {
  return del(STORES.JOBS, id);
}

export async function activeJob() {
  const jobs = await allJobs();
  const running = jobs.filter((j) => ![JobState.COMPLETED, JobState.CANCELLED, JobState.FAILED, JobState.PARTIAL].includes(j.state));
  running.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return running[0] || null;
}
