// Promise-based IndexedDB wrapper. Single shared connection. All large data
// (contacts, jobs, audit, payloads, enrichment) lives here — never in
// chrome.storage.

import { DB_NAME, DB_VERSION, applyMigrations, STORES } from './migrations.js';

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => applyMigrations(req.result, e.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

export async function put(store, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readwrite').put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function del(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store, query = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readonly').getAll(query);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  for (const store of Object.values(STORES)) {
    // eslint-disable-next-line no-await-in-loop
    await clearStore(store);
  }
}

export { STORES };
