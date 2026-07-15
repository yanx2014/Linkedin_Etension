// Avatar orchestrator. Combines deterministic identity/experience/hypotheses/
// outreach with (optionally) grounding-validated LLM-structured context, then
// renders the exact avatar cell. Never emits an unsupported fact.

import { buildSourceBundle } from './source-bundle.js';
import { computeExperience } from './experience.js';
import { extractInterests } from './topic-extractor.js';
import { generateHypotheses } from './hypothesis-templates.js';
import { validateOutreach, buildFallbackOutreach } from './outreach-validator.js';
import { validateGrounding } from './grounding-validator.js';
import { computeConfidence } from './confidence.js';
import { renderAvatar } from './renderer.js';
import { truncate, collapseWhitespace, wordCount } from '../utils/text.js';

// Permitted "Observed information sources" labels.
const SOURCE_LABELS = {
  profile: 'LinkedIn profile',
  imported_profile: 'Imported LinkedIn profile data',
  crm: 'Authorized CRM profile',
  activity: 'Person posts/activity',
  website: 'Official company website',
  company_profile: 'LinkedIn company profile',
  company_posts: 'LinkedIn company posts',
  feed: 'Official company newsroom/blog/feed'
};

export async function buildAvatar({ collectedProfile = {}, companyEvidence = {}, llmOutput = null, nowMs = Date.now() } = {}) {
  const { evidence } = await buildSourceBundle(collectedProfile, companyEvidence, { nowMs });
  const warnings = [];

  // --- Grounding-validate the LLM output once (reused for scalars + arrays) ---
  let validated = null;
  if (llmOutput) {
    const gv = validateGrounding(llmOutput, evidence);
    validated = gv.validated;
    warnings.push(...gv.warnings.map((w) => ({ ...w, source: 'grounding' })));
  }

  // --- Identity, role, company ---
  // Deterministic profile/experience fields take precedence; when the page scrape
  // yielded nothing, fall back to the LLM's grounding-validated extraction (which
  // is cited against the collected visible text, e.g. the search preview / raw
  // profile text). This keeps facts evidence-backed while filling the CSV columns
  // even when LinkedIn's obfuscated markup defeats field-level selectors.
  const name = pickName(collectedProfile) || llmScalar(validated, 'real_professional_name');
  const role = pickRole(collectedProfile) || llmScalar(validated, 'current_role');
  const company = pickCompany(collectedProfile) || llmScalar(validated, 'current_company');
  const websiteConfirmed = companyEvidence.website_status === 'confirmed' && companyEvidence.official_website;
  const website = websiteConfirmed ? companyEvidence.official_website : null;

  // --- Deterministic experience ---
  const experience = computeExperience(collectedProfile.experience, nowMs);
  if (experience.note) warnings.push({ field: 'professional_experience', reason: experience.note });

  // --- Interests from posts ---
  const interestTopics = extractInterests(collectedProfile.posts, { max: 5 });

  // --- Context arrays: from validated LLM output when present, else deterministic ---
  const arrays = validated
    ? arraysFromValidated(validated)
    : deterministicArrays(collectedProfile, companyEvidence, interestTopics);

  // --- Hypotheses (always deterministic) ---
  const hyp = generateHypotheses({ role, companyName: company });

  // --- Outreach ---
  const topTopic = interestTopics.length > 0 ? interestTopics[0].topic : null;
  const outreach = resolveOutreach(llmOutput, evidence, {
    firstName: collectedProfile.first_name,
    role, company, postTopic: topTopic
  }, warnings);

  // --- Observed information sources ---
  const sources = observedSources(collectedProfile, companyEvidence);

  // --- Confidence (code-computed) ---
  const conflict = detectConflicts(collectedProfile, warnings);
  const flags = {
    hasName: !!name,
    hasRole: !!role,
    hasCompany: !!company,
    hasLocation: !!collectedProfile.location,
    hasConfirmedWebsite: !!website,
    hasResponsibility: arrays.verified_responsibilities.length > 0,
    hasPersonPostOrInterest: (collectedProfile.posts || []).length > 0 || arrays.verified_professional_interests.length > 0,
    companyFactCount: arrays.company_context.length + arrays.observed_company_facts.length,
    hasCompanyPriorityOrActivity: arrays.verified_company_priorities.length > 0 || (companyEvidence.posts || []).length > 0,
    hasConflict: conflict.any,
    hasSeriousConflict: conflict.serious,
    onlyNameAndUrl: !!name && !role && !company && (collectedProfile.posts || []).length === 0
  };
  const confidence = computeConfidence(flags);

  // --- Render model ---
  const model = {
    real_professional_name: name,
    current_role: role,
    professional_experience: experience.value,
    current_company: company,
    company_website: website,
    company_context: arrays.company_context.slice(0, 3),
    verified_responsibilities: arrays.verified_responsibilities.slice(0, 5),
    verified_professional_interests: arrays.verified_professional_interests.slice(0, 5),
    verified_company_priorities: arrays.verified_company_priorities.slice(0, 3),
    potential_objectives: hyp.objectives.map((o) => o.text),
    potential_challenges: hyp.challenges.map((c) => c.text),
    observed_information_sources: sources.labels,
    outreach_message: outreach.message,
    confidence: confidence.level,
    observed_prospect_facts: arrays.observed_prospect_facts.slice(0, 5),
    observed_company_facts: arrays.observed_company_facts.slice(0, 5),
    hypotheses_to_validate: [...hyp.objectives, ...hyp.challenges].slice(0, 2).map((h) => h.text)
  };

  const avatar_markdown = renderAvatar(model);
  const profile_note = buildProfileNote({ model, flags, warnings, experience, conflict });

  return {
    avatar_markdown,
    confidence: confidence.level,
    coverage: confidence.coverage,
    profile_note,
    warnings,
    model,
    evidence_map: evidence.toJSON(),
    experience,
    hypotheses: hyp,
    sources_used: sources.keys
  };
}

// --- helpers ---

// Read a grounding-validated scalar field value from the LLM output.
function llmScalar(validated, field) {
  const v = validated && validated.person && validated.person[field] && validated.person[field].value;
  return v && v !== '' ? v : null;
}

function pickName(p) {
  if (p.first_name && p.last_name) return collapseWhitespace(`${p.first_name} ${p.last_name}`);
  if (p.full_name && wordCount(p.full_name) >= 2) return collapseWhitespace(p.full_name);
  return null;
}

function pickRole(p) {
  const current = (p.experience || []).find((e) => e.is_current === true && e.title);
  if (current) return collapseWhitespace(current.title);
  if (p.role) return collapseWhitespace(p.role);
  return null;
}

function pickCompany(p) {
  const current = (p.experience || []).find((e) => e.is_current === true && e.company);
  if (current) return collapseWhitespace(current.company);
  if (p.company) return collapseWhitespace(p.company);
  if (p.current_company) return collapseWhitespace(p.current_company);
  return null;
}

function arraysFromValidated(v) {
  const vals = (arr) => (Array.isArray(arr) ? arr.map((i) => i.value).filter(Boolean) : []);
  return {
    company_context: vals(v.company?.company_context),
    verified_responsibilities: vals(v.person?.verified_responsibilities),
    verified_professional_interests: vals(v.person?.verified_professional_interests),
    verified_company_priorities: vals(v.company?.verified_company_priorities),
    observed_prospect_facts: vals(v.person?.observed_prospect_facts),
    observed_company_facts: vals(v.company?.observed_company_facts)
  };
}

function deterministicArrays(p, companyEvidence, interestTopics) {
  const facts = Array.isArray(companyEvidence.facts) ? companyEvidence.facts : [];
  const contextFacts = facts.filter((f) => ['company_context', 'description', 'product', 'service', 'positioning'].includes(f.field));
  const priorityFacts = facts.filter((f) => ['company_priority', 'priority', 'announcement', 'launch'].includes(f.field));

  const responsibilities = (Array.isArray(p.responsibilities) ? p.responsibilities : [])
    .map((r) => collapseWhitespace(r)).filter(Boolean);

  const observedCompany = [];
  for (const f of facts.filter((x) => x.field === 'observed' || x.field === 'company_fact')) {
    observedCompany.push(collapseWhitespace(f.value));
  }
  for (const post of (companyEvidence.posts || []).slice(0, 3)) {
    observedCompany.push(truncate(collapseWhitespace(post.text), 160));
  }

  const observedProspect = (Array.isArray(p.posts) ? p.posts.slice(0, 3) : [])
    .map((post) => truncate(collapseWhitespace(post.text), 160)).filter(Boolean);

  return {
    company_context: contextFacts.map((f) => collapseWhitespace(f.value)),
    verified_responsibilities: responsibilities,
    verified_professional_interests: interestTopics.map((t) => t.topic),
    verified_company_priorities: priorityFacts.map((f) => collapseWhitespace(f.value)),
    observed_prospect_facts: observedProspect,
    observed_company_facts: observedCompany
  };
}

function resolveOutreach(llmOutput, evidence, fallbackCtx, warnings) {
  if (llmOutput && llmOutput.outreach && llmOutput.outreach.suggested_message) {
    const res = validateOutreach(llmOutput.outreach.suggested_message, evidence, llmOutput.outreach.source_ids || []);
    if (res.ok) return res;
    warnings.push({ field: 'outreach', reason: res.warnings.join(',') });
  }
  const fallback = buildFallbackOutreach(fallbackCtx);
  if (!fallback) return { message: null, warnings: ['no_verified_anchor'] };
  const res = validateOutreach(fallback, evidence, []);
  return res.ok ? res : { message: null, warnings: res.warnings };
}

function observedSources(p, companyEvidence) {
  const keys = [];
  const labels = [];
  const add = (key) => { if (!keys.includes(key)) { keys.push(key); labels.push(SOURCE_LABELS[key]); } };

  if (p.full_name || p.headline || p.role) add(p.source_type === 'crm' ? 'crm' : 'profile');
  if (Array.isArray(p.posts) && p.posts.length > 0) add('activity');
  if (companyEvidence.website_status === 'confirmed' && (companyEvidence.website_pages || []).length > 0) add('website');
  if ((companyEvidence.profile_fields || []).length > 0) add('company_profile');
  if ((companyEvidence.posts || []).length > 0) add('company_posts');
  if ((companyEvidence.facts || []).some((f) => f.source_type === 'official_website_feed')) add('feed');

  return { keys, labels };
}

function detectConflicts(p, warnings) {
  let any = false;
  let serious = false;
  // Conflict: current-experience company differs from the flat company field.
  const current = (p.experience || []).find((e) => e.is_current === true && e.company);
  if (current && p.company && collapseWhitespace(current.company).toLowerCase() !== collapseWhitespace(p.company).toLowerCase()) {
    any = true;
    warnings.push({ field: 'current_company', reason: 'conflict_between_experience_and_company_field' });
  }
  return { any, serious };
}

function buildProfileNote({ model, flags, warnings, experience, conflict }) {
  const notes = [];
  const missing = [];
  if (!flags.hasRole) missing.push('role');
  if (!flags.hasCompany) missing.push('company');
  if (!flags.hasConfirmedWebsite) missing.push('confirmed company website');
  if (!flags.hasPersonPostOrInterest) missing.push('person activity');

  if (missing.length >= 3) {
    notes.push(`Limited source coverage: missing ${missing.join(', ')}.`);
  } else if (missing.length > 0) {
    notes.push(`Missing: ${missing.join(', ')}.`);
  }
  if (experience.note) notes.push(`Experience note: ${experience.note}.`);
  if (conflict.any) notes.push('Source conflict detected; confidence reduced.');
  const grounding = warnings.filter((w) => w.source === 'grounding');
  if (grounding.length > 0) notes.push(`${grounding.length} unsupported claim(s) removed during grounding.`);
  return notes.join(' ');
}
