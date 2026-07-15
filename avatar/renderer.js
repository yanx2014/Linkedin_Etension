// Deterministic avatar renderer. Produces the exact Markdown cell structure.
// Section headings are always present; unavailable bullets are omitted; missing
// scalar facts use the required placeholders.

const ND = 'Not determinable';
const NC = 'Not confirmed';

function scalar(value, placeholder = ND) {
  if (value == null || value === '') return placeholder;
  return String(value);
}

function bulletBlock(items) {
  if (!items || items.length === 0) return '';
  return items.map((i) => `* ${i}`).join('\n');
}

// Render the avatar markdown from a normalized avatar model.
export function renderAvatar(m) {
  const lines = [];
  lines.push('# LinkedIn Prospect Avatar');
  lines.push('');
  lines.push(`**Real professional name:** ${scalar(m.real_professional_name)}`);
  lines.push(`**Current role:** ${scalar(m.current_role)}`);
  lines.push(`**Professional experience:** ${scalar(m.professional_experience)}`);
  lines.push(`**Current company:** ${scalar(m.current_company)}`);
  lines.push(`**Company website:** ${scalar(m.company_website, NC)}`);
  lines.push('');

  pushSection(lines, 'Company context:', m.company_context);
  pushSection(lines, 'Verified responsibilities:', m.verified_responsibilities);
  pushSection(lines, 'Verified professional interests:', m.verified_professional_interests);
  pushSection(lines, 'Verified company priorities:', m.verified_company_priorities);
  pushSection(lines, 'Potential business objectives to validate:', m.potential_objectives);
  pushSection(lines, 'Potential business challenges to validate:', m.potential_challenges);
  pushSection(lines, 'Observed information sources:', m.observed_information_sources);

  lines.push('**Suggested outreach message:**');
  if (m.outreach_message && m.outreach_message !== '') {
    lines.push(`> ${m.outreach_message}`);
  } else {
    lines.push(`> ${ND}`);
  }
  lines.push('');

  lines.push(`**Confidence level:** ${scalar(m.confidence, 'low')}`);

  pushSection(lines, 'Observed prospect facts:', m.observed_prospect_facts);
  pushSection(lines, 'Observed company facts:', m.observed_company_facts);
  pushSection(lines, 'Hypotheses to validate:', m.hypotheses_to_validate);

  // Trim a single trailing blank line for a stable output.
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function pushSection(lines, heading, items) {
  lines.push(`**${heading}**`);
  const block = bulletBlock(items);
  if (block) lines.push(block);
  lines.push('');
}

export { ND, NC };
