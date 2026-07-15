// Map an imported record's arbitrary fields onto the canonical input schema
// using configured aliases. Never maps an ambiguous field silently — when two
// aliases target the same canonical field with conflicting values, a warning is
// recorded.

// Alias map. Mirrors data/source-field-aliases.json (kept inline so the module
// loads identically in Node and in Chrome extension contexts without relying on
// JSON module import attributes).
const ALIASES = {
  profile_url: ['url', 'linkedin_url', 'linkedinurl', 'profileurl', 'profile', 'public_profile_url'],
  role: ['job_title', 'title', 'position', 'jobtitle'],
  company: ['organization', 'employer', 'company_name', 'current_company'],
  company_website: ['company_url', 'domain', 'website', 'companywebsite', 'company_domain'],
  full_name: ['name', 'fullname', 'full name'],
  first_name: ['firstname', 'given_name', 'first'],
  last_name: ['lastname', 'surname', 'family_name', 'last'],
  headline: ['title_headline', 'tagline'],
  location: ['city', 'region', 'geo', 'country'],
  email: ['email_address', 'work_email', 'mail'],
  posts: ['activity', 'activities', 'recent_posts'],
  summary: ['about', 'bio', 'description'],
  company_linkedin_url: ['company_linkedin', 'org_linkedin_url']
};

// Build a reverse lookup: lowercased alias -> canonical field.
const REVERSE = (() => {
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    map.set(canonical.toLowerCase(), canonical);
    for (const a of aliases) map.set(a.toLowerCase(), canonical);
  }
  return map;
})();

// Normalize a single raw record into the canonical schema. Returns
// { record, warnings }.
export function normalizeRecord(raw, sourceType = 'import') {
  const record = emptyCanonical(sourceType);
  const warnings = [];
  const assigned = new Map(); // canonical field -> source key

  for (const [key, value] of Object.entries(raw || {})) {
    if (key.startsWith('__')) continue;
    const canonical = REVERSE.get(String(key).trim().toLowerCase());
    if (!canonical) {
      record.custom_fields[key] = value;
      continue;
    }
    const val = coerce(canonical, value);
    if (val == null || val === '') continue;
    if (record[canonical] != null && record[canonical] !== '' && String(record[canonical]) !== String(val)) {
      warnings.push(`alias conflict for ${canonical}: "${assigned.get(canonical)}" vs "${key}"`);
      continue; // keep first, warn on conflict
    }
    record[canonical] = val;
    assigned.set(canonical, key);
  }

  // Derive full_name from parts when missing.
  if (!record.full_name && record.first_name && record.last_name) {
    record.full_name = `${record.first_name} ${record.last_name}`;
  }
  return { record, warnings };
}

function coerce(field, value) {
  if (field === 'posts') {
    if (Array.isArray(value)) return value.map(normalizePost);
    if (typeof value === 'string' && value.trim()) return [normalizePost(value)];
    return [];
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

function normalizePost(p) {
  if (typeof p === 'string') return { id: null, text: p, created_at: null, source_url: null };
  return {
    id: p.id || null,
    text: p.text || p.commentary || '',
    created_at: p.created_at || p.date || null,
    source_url: p.source_url || p.url || null
  };
}

export function emptyCanonical(sourceType = 'import') {
  return {
    source_record_id: null,
    source_type: sourceType,
    source_search: null,
    collected_at: null,
    first_name: '', last_name: '', full_name: '', headline: '', role: '',
    company: '', location: '', profile_url: '', linkedin_person_id: null,
    summary: '', responsibilities: [], experience: [], posts: [],
    company_website: '', company_linkedin_url: '', company_linkedin_id: null,
    company_posts: [], email: '', custom_fields: {}
  };
}
