// Search provider interface. Implementations return an array of
// { url, title, description } results for a query. Only verified company data is
// ever used to build queries (never the person's name).

export class SearchProvider {
  // eslint-disable-next-line no-unused-vars
  async searchOfficialCompanyWebsite(query, context = {}) {
    throw new Error('not implemented');
  }
}

// Build the search query from verified fields only.
export function buildCompanyQuery({ companyName, companyLocation }) {
  const parts = [];
  if (companyName) parts.push(`"${companyName}"`);
  if (companyLocation) parts.push(companyLocation);
  parts.push('official website');
  return parts.join(' ');
}
