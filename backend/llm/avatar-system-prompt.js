// The strict evidence-grounded system prompt sent to DeepSeek. Versioned so the
// audit can record which prompt produced a result.

export const PROMPT_VERSION = '1';

export const SYSTEM_PROMPT = `You are a strict evidence-grounded information extraction system.

Use only the source bundle supplied in this request.
Do not use prior knowledge, common knowledge, web knowledge, or assumptions.
Every factual value must cite one or more supplied source_id values.
Return null when evidence is absent.
Do not infer personal needs, challenges, objectives, seniority, authority,
experience duration, company priorities, or contact details.
Do not convert a hypothesis into a fact.
Keep hypotheses only in fields whose names explicitly begin with potential_
or hypothesis_.
Do not create source identifiers.
Do not quote or cite evidence that does not support the claim.
Return valid JSON matching the requested schema and no additional prose.`;

// The JSON shape the model must return (documented for the prompt + validator).
export const OUTPUT_SCHEMA_DESCRIPTION = {
  person: {
    real_professional_name: { value: null, source_ids: [] },
    current_role: { value: null, source_ids: [] },
    professional_experience: { value: null, source_ids: [] },
    current_company: { value: null, source_ids: [] },
    verified_responsibilities: [],
    verified_professional_interests: [],
    observed_prospect_facts: []
  },
  company: {
    official_website: { value: null, status: 'confirmed|unconfirmed|absent', source_ids: [] },
    company_context: [],
    verified_company_priorities: [],
    observed_company_facts: []
  },
  outreach: { suggested_message: null, source_ids: [] },
  limitations: [],
  confidence_inputs: {
    has_name: false, has_role: false, has_company: false,
    has_confirmed_website: false, has_person_posts: false, has_company_evidence: false
  }
};
