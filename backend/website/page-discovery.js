// Choose which pages to fetch from a homepage's same-origin links. Priority:
// homepage, about/company, products/services/solutions, news/blog/press, plus
// one extra high-value same-origin link. Max five pages total.

const PRIORITY = [
  { key: 'about', re: /\/(about|company|who-we-are|about-us)(\/|$|\?)/i },
  { key: 'products', re: /\/(products?|services?|solutions?|platform|features)(\/|$|\?)/i },
  { key: 'news', re: /\/(news|press|newsroom|blog|resources|insights)(\/|$|\?)/i },
  { key: 'contact', re: /\/(contact|legal|imprint|impressum)(\/|$|\?)/i }
];

export function discoverPages(homepageUrl, links, max = 5) {
  const origin = originOf(homepageUrl);
  const chosen = [homepageUrl];
  const seen = new Set([normalize(homepageUrl)]);

  const sameOrigin = (links || [])
    .map((l) => l.href)
    .filter((href) => originOf(href) === origin && !normalize(href).endsWith('.pdf'));

  for (const { re } of PRIORITY) {
    if (chosen.length >= max) break;
    const hit = sameOrigin.find((href) => re.test(href) && !seen.has(normalize(href)));
    if (hit) { chosen.push(hit); seen.add(normalize(hit)); }
  }

  // One extra high-value link (shortest path not already chosen).
  if (chosen.length < max) {
    const extra = sameOrigin
      .filter((href) => !seen.has(normalize(href)))
      .sort((a, b) => pathLen(a) - pathLen(b))[0];
    if (extra) { chosen.push(extra); seen.add(normalize(extra)); }
  }

  return chosen.slice(0, max);
}

function originOf(url) { try { return new URL(url).origin; } catch { return ''; } }
function normalize(url) { try { const u = new URL(url); return `${u.origin}${u.pathname.replace(/\/$/, '')}`.toLowerCase(); } catch { return String(url).toLowerCase(); } }
function pathLen(url) { try { return new URL(url).pathname.length; } catch { return 999; } }
