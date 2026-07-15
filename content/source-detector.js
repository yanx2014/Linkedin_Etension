// Registry of page adapters + detection. Given a URL (and optionally a document)
// returns the first adapter whose canHandle() matches. Order is most-specific
// first so single-profile and product-specific pages win over generic searches.

import standardSearch from './adapters/standard-search.js';
import connections from './adapters/connections.js';
import singleProfile from './adapters/single-profile.js';
import feed from './adapters/feed.js';
import postReactions from './adapters/post-reactions.js';
import postComments from './adapters/post-comments.js';
import groupMembers from './adapters/group-members.js';
import eventAttendees from './adapters/event-attendees.js';
import salesSearch from './adapters/sales-search.js';
import salesSavedSearch from './adapters/sales-saved-search.js';
import salesList from './adapters/sales-list.js';
import salesProfile from './adapters/sales-profile.js';
import recruiterSearch from './adapters/recruiter-search.js';
import recruiterProject from './adapters/recruiter-project.js';
import recruiterProfile from './adapters/recruiter-profile.js';

// Order: specific single-profile + product pages before generic searches.
export const ADAPTERS = [
  salesProfile,
  recruiterProfile,
  singleProfile,
  salesSavedSearch,
  salesSearch,
  salesList,
  recruiterProject,
  recruiterSearch,
  postReactions,
  postComments,
  groupMembers,
  eventAttendees,
  connections,
  standardSearch,
  feed
];

export function detectAdapter({ url, document }) {
  for (const adapter of ADAPTERS) {
    try {
      if (adapter.canHandle({ url, document })) return adapter;
    } catch {
      // adapter detection must never throw; skip on error
    }
  }
  return null;
}

export function getAdapterById(id) {
  return ADAPTERS.find((a) => a.id === id) || null;
}
