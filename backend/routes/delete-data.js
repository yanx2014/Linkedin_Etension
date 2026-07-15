// DELETE /v1/data — clear all cached enrichment data from the backend store.

import { getStore } from '../db/database.js';

export function deleteDataRoute() {
  const store = getStore();
  store.clearAll();
  return { deleted: true, at: new Date().toISOString() };
}
