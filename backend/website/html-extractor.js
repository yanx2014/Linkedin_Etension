// Dependency-free HTML fact extractor. Pulls title, meta description, Open Graph
// site name, canonical URL, Organization JSON-LD, headings, visible paragraph
// text, links, and sameAs references. Regex-based — sufficient for the specific
// fields we extract; never executes page scripts.

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

export function extractHtml(html, baseUrl = 'https://example.com') {
  const out = { title: '', description: '', ogSiteName: '', canonical: '', jsonld: [], headings: [], paragraphs: [], text: '', links: [], sameAs: [] };

  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) out.title = stripTags(titleM[1]);

  for (const metaM of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = metaM[0];
    const name = (attrOf(tag, 'name') || '').toLowerCase();
    const prop = (attrOf(tag, 'property') || '').toLowerCase();
    const content = attrOf(tag, 'content');
    if (name === 'description' && content) out.description = stripTags(content);
    if (prop === 'og:site_name' && content) out.ogSiteName = stripTags(content);
  }

  const canonM = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  if (canonM) out.canonical = attrOf(canonM[0], 'href') || '';

  for (const s of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(s[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        out.jsonld.push(item);
        if (item && item.sameAs) {
          const arr = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
          out.sameAs.push(...arr);
        }
      }
    } catch { /* ignore malformed json-ld */ }
  }

  for (const h of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = stripTags(h[1]);
    if (t) out.headings.push(t);
  }

  for (const p of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(p[1]);
    if (t) out.paragraphs.push(t);
  }

  for (const a of html.matchAll(/<a\b[^>]*href=("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = a[2] ?? a[3] ?? a[4] ?? '';
    let abs = href;
    try { abs = new URL(href, baseUrl).toString(); } catch { /* keep raw */ }
    out.links.push({ href: abs, text: stripTags(a[5]) });
    if (/linkedin\.com\/company\//i.test(abs)) out.sameAs.push(abs);
  }

  out.text = [out.description, ...out.headings, ...out.paragraphs].filter(Boolean).join('\n');
  out.sameAs = Array.from(new Set(out.sameAs));
  return out;
}

export { stripTags };
