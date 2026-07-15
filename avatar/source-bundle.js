// Build the versioned source bundle sent to DeepSeek, plus an EvidenceMap that
// backs grounding validation. Person and company posts are capped at seven and
// sorted newest-first. Content hashes are sha256 of the item text.

import { EvidenceMap } from './evidence-map.js';
import { sha256Hex } from '../utils/hash.js';
import { isoNow } from '../utils/dates.js';

const PERSON_POST_LIMIT = 7;
const COMPANY_POST_LIMIT = 7;

// Sort posts newest-first; undated posts sort after dated ones (stable).
export function sortPostsNewestFirst(posts) {
  const withDate = [];
  const withoutDate = [];
  for (const p of posts || []) {
    const t = p.created_at ? Date.parse(p.created_at) : NaN;
    if (Number.isFinite(t)) withDate.push({ p, t });
    else withoutDate.push(p);
  }
  withDate.sort((a, b) => b.t - a.t);
  return [...withDate.map((x) => x.p), ...withoutDate];
}

// Build the bundle + evidence map. Async because content hashes are sha256.
export async function buildSourceBundle(collectedProfile, companyEvidence = {}, options = {}) {
  const retrievedAt = options.retrievedAt || collectedProfile.collected_at || isoNow(options.nowMs);
  const evidence = new EvidenceMap();

  const bundle = {
    profile_id: collectedProfile.profile_id || collectedProfile.source_record_id || null,
    collected_at: retrievedAt,
    person: { profile_fields: [], posts: [] },
    company: {
      name: companyEvidence.name || collectedProfile.company || collectedProfile.current_company || null,
      website_status: companyEvidence.website_status || 'absent',
      website_pages: [],
      profile_fields: [],
      posts: []
    },
    constraints: {
      person_post_limit: PERSON_POST_LIMIT,
      company_post_limit: COMPANY_POST_LIMIT,
      facts_require_evidence: true,
      use_external_knowledge: false
    }
  };

  const addItem = async (list, id, type, url, text) => {
    if (text == null || String(text).trim() === '') return;
    const item = {
      source_id: id,
      source_type: type,
      source_url: url || null,
      retrieved_at: retrievedAt,
      text: String(text),
      content_hash: await sha256Hex(String(text))
    };
    evidence.add(item);
    list.push(item);
  };

  // Person profile fields.
  const p = collectedProfile;
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_NAME', 'person_profile', p.profile_url, p.full_name);
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_HEADLINE', 'person_profile', p.profile_url, p.headline);
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_ROLE', 'person_profile', p.profile_url, p.role);
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_COMPANY', 'person_profile', p.profile_url, p.company || p.current_company);
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_LOCATION', 'person_profile', p.profile_url, p.location);
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_ABOUT', 'person_profile', p.profile_url, p.summary || p.about);
  // Resilient full-text source: the visible profile / search-preview text. Lets
  // the LLM extract grounded role/company/name when field-level selectors miss.
  await addItem(bundle.person.profile_fields, 'PERSON_PROFILE_RAWTEXT', 'person_profile', p.profile_url, p.raw_text || p.preview_text);

  const experience = Array.isArray(p.experience) ? p.experience : [];
  for (let i = 0; i < experience.length; i++) {
    const e = experience[i];
    const text = [e.title, e.company, e.start_date, e.end_date, e.description].filter(Boolean).join(' | ');
    await addItem(bundle.person.profile_fields, `PERSON_PROFILE_EXPERIENCE_${i + 1}`, 'person_profile', p.profile_url, text);
  }
  const responsibilities = Array.isArray(p.responsibilities) ? p.responsibilities : [];
  for (let i = 0; i < responsibilities.length; i++) {
    await addItem(bundle.person.profile_fields, `PERSON_PROFILE_RESPONSIBILITY_${i + 1}`, 'person_profile', p.profile_url, responsibilities[i]);
  }

  // Person posts (cap 7, newest first).
  const personPosts = sortPostsNewestFirst(p.posts).slice(0, PERSON_POST_LIMIT);
  for (let i = 0; i < personPosts.length; i++) {
    await addItem(bundle.person.posts, `PERSON_POST_${i + 1}`, 'person_activity', personPosts[i].source_url, personPosts[i].text);
  }

  // Company website pages + extracted facts.
  const pages = Array.isArray(companyEvidence.website_pages) ? companyEvidence.website_pages : [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const text = [page.title, page.description, ...(page.headings || []), page.text].filter(Boolean).join('\n');
    await addItem(bundle.company.website_pages, `COMPANY_WEBSITE_${i + 1}`, 'official_company_website', page.url, text);
  }
  const facts = Array.isArray(companyEvidence.facts) ? companyEvidence.facts : [];
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    await addItem(bundle.company.website_pages, `COMPANY_WEBSITE_FACT_${i + 1}`, 'official_company_website', f.source_url, f.value || f.supporting_excerpt);
  }

  // Company profile fields (LinkedIn org profile).
  const cProfile = Array.isArray(companyEvidence.profile_fields) ? companyEvidence.profile_fields : [];
  for (let i = 0; i < cProfile.length; i++) {
    const cf = cProfile[i];
    await addItem(bundle.company.profile_fields, `COMPANY_PROFILE_${i + 1}`, 'linkedin_company_profile', cf.source_url, cf.value || cf.text);
  }

  // Company posts (cap 7, newest first).
  const companyPosts = sortPostsNewestFirst(companyEvidence.posts).slice(0, COMPANY_POST_LIMIT);
  for (let i = 0; i < companyPosts.length; i++) {
    await addItem(bundle.company.posts, `COMPANY_POST_${i + 1}`, 'linkedin_company_posts', companyPosts[i].source_url, companyPosts[i].text);
  }

  return { bundle, evidence };
}

export { PERSON_POST_LIMIT, COMPANY_POST_LIMIT };
