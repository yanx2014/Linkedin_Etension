// Brave Search API provider. Uses the Web Search endpoint. The API key stays in
// the backend. `fetchImpl` and `baseUrl` are injectable for testing.

import { SearchProvider } from './search-provider.js';
import { config } from '../config.js';

export class BraveSearchProvider extends SearchProvider {
  constructor({ apiKey = config.braveApiKey, baseUrl = 'https://api.search.brave.com', fetchImpl = fetch } = {}) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  async searchOfficialCompanyWebsite(query) {
    if (!this.apiKey) throw new Error('BRAVE_SEARCH_API_KEY not configured');
    const url = `${this.baseUrl}/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    const res = await this.fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey }
    });
    if (!res.ok) throw new Error(`brave search ${res.status}`);
    const body = await res.json();
    return parseBraveResults(body);
  }
}

export function parseBraveResults(body) {
  const results = (body && body.web && Array.isArray(body.web.results)) ? body.web.results : [];
  return results.map((r) => ({
    url: r.url,
    title: r.title || '',
    description: r.description || r.snippet || ''
  })).filter((r) => r.url);
}
