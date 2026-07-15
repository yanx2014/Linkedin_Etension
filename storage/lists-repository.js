// Contact lists. Deleting a list does not delete contacts; it only removes the
// list and its membership references.

import { put, get, getAll, del, STORES } from './database.js';
import { allContacts, upsertContact } from './contacts-repository.js';
import { newId } from '../utils/messages.js';

export async function createList(name) {
  const list = { id: newId(), name: String(name || 'Untitled list'), created_at: new Date().toISOString() };
  await put(STORES.LISTS, list);
  return list;
}

export async function renameList(id, name) {
  const list = await get(STORES.LISTS, id);
  if (!list) return null;
  list.name = String(name);
  await put(STORES.LISTS, list);
  return list;
}

export async function deleteList(id) {
  // Remove membership from contacts but keep the contacts themselves.
  const contacts = await allContacts();
  for (const c of contacts) {
    if ((c.list_ids || []).includes(id)) {
      c.list_ids = c.list_ids.filter((x) => x !== id);
      // eslint-disable-next-line no-await-in-loop
      await put(STORES.CONTACTS, c);
    }
  }
  await del(STORES.LISTS, id);
}

export async function allLists() {
  return getAll(STORES.LISTS);
}

export async function assignToList(canonicalUrl, listId, mode = 'copy') {
  const contact = await get(STORES.CONTACTS, canonicalUrl);
  if (!contact) return null;
  const set = new Set(contact.list_ids || []);
  if (mode === 'move') set.clear();
  set.add(listId);
  contact.list_ids = Array.from(set);
  await put(STORES.CONTACTS, contact);
  return contact;
}

export async function addTag(canonicalUrl, tag) {
  const contact = await get(STORES.CONTACTS, canonicalUrl);
  if (!contact) return null;
  const tags = new Set(contact.tags || []);
  tags.add(String(tag));
  contact.tags = Array.from(tags);
  await upsertContact(contact);
  return contact;
}
