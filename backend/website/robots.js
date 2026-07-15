// Minimal robots.txt fetch + evaluation. Conservative: on any fetch error it
// allows (fail-open) but records the reason; explicit Disallow rules for our
// user-agent (or *) are respected.

const USER_AGENT = 'ProspectToolBot/1.0 (+respectful research; contact via extension settings)';

export function getUserAgent() { return USER_AGENT; }

// Parse robots.txt content into rule groups.
export function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (current && current.rules.length === 0) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], rules: [] };
        groups.push(current);
      }
    } else if ((field === 'disallow' || field === 'allow') && current) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

// Is `path` allowed for our agent?
export function isAllowed(groups, path, agent = 'prospecttoolbot') {
  const applicable = pickGroup(groups, agent);
  if (!applicable) return true;
  let decision = true;
  let longest = -1;
  for (const rule of applicable.rules) {
    if (rule.path === '') continue;
    if (path.startsWith(rule.path) && rule.path.length > longest) {
      longest = rule.path.length;
      decision = rule.type === 'allow';
    }
  }
  return decision;
}

function pickGroup(groups, agent) {
  let star = null;
  for (const g of groups) {
    if (g.agents.includes(agent)) return g;
    if (g.agents.includes('*')) star = g;
  }
  return star;
}
