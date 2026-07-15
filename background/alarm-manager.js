// Schedules saved-source auto-imports via chrome.alarms. Alarms only fire while
// Chrome is running; a scheduled job checks login state and stops safely at any
// checkpoint.

import { scheduledSources } from '../storage/sources-repository.js';

const PREFIX = 'source:';

function periodMinutes(schedule) {
  switch (schedule) {
    case 'daily': return 24 * 60;
    case 'weekly': return 7 * 24 * 60;
    case 'monthly': return 30 * 24 * 60;
    default: return null;
  }
}

// Re-create alarms for all scheduled sources (call on startup + on source save).
export async function syncAlarms() {
  const sources = await scheduledSources();
  const wanted = new Map();
  for (const s of sources) {
    const period = periodMinutes(s.schedule);
    if (period) wanted.set(`${PREFIX}${s.id}`, period);
  }
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    if (a.name.startsWith(PREFIX) && !wanted.has(a.name)) await chrome.alarms.clear(a.name);
  }
  for (const [name, period] of wanted) {
    await chrome.alarms.create(name, { periodInMinutes: period, delayInMinutes: period });
  }
}

export function sourceIdFromAlarm(name) {
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : null;
}
