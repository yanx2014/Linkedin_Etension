// Minimal dependency-free HTML parser + CSS selector engine, sufficient for
// adapter/extractor tests. Implements the small DOM surface adapters use:
// querySelector, querySelectorAll, getAttribute, textContent, children, and
// closest. NOT a general-purpose DOM — supports the selector subset the
// adapters rely on (tag, #id, .class, [attr], [attr=v], [attr*=v], [attr^=v],
// [attr$=v], descendant combinator, comma groups).

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAWTEXT = new Set(['script', 'style']);

class Node {
  constructor(type) {
    this.type = type; // 'element' | 'text'
    this.children = [];
    this.parent = null;
  }
}

class Element extends Node {
  constructor(tagName) {
    super('element');
    this.tagName = tagName.toLowerCase();
    this.attributes = new Map();
  }

  getAttribute(name) {
    const v = this.attributes.get(name.toLowerCase());
    return v == null ? null : v;
  }

  hasAttribute(name) { return this.attributes.has(name.toLowerCase()); }

  get classList() {
    const cls = this.getAttribute('class') || '';
    return cls.split(/\s+/).filter(Boolean);
  }

  get textContent() {
    let out = '';
    for (const c of this.children) {
      if (c.type === 'text') out += c.value;
      else out += c.textContent;
    }
    return out;
  }

  get children_() { return this.children.filter((c) => c.type === 'element'); }

  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    const results = [];
    const all = collectElements(this);
    for (const el of all) {
      if (groups.some((g) => matchesGroup(el, g))) results.push(el);
    }
    return results;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }

  matches(selector) {
    const groups = parseSelector(selector);
    return groups.some((g) => matchesCompound(this, g[g.length - 1]));
  }

  closest(selector) {
    let el = this;
    while (el && el.type === 'element') {
      if (el.matches(selector)) return el;
      el = el.parent;
    }
    return null;
  }
}

class TextNode extends Node {
  constructor(value) { super('text'); this.value = value; }
}

class Document {
  constructor(root) { this.root = root; }
  querySelector(s) { return this.root.querySelector(s); }
  querySelectorAll(s) { return this.root.querySelectorAll(s); }
  get body() { return this.root.querySelector('body') || this.root; }
  get documentElement() { return this.root; }
}

function collectElements(el, acc = []) {
  for (const c of el.children) {
    if (c.type === 'element') { acc.push(c); collectElements(c, acc); }
  }
  return acc;
}

// ---- Parser ----
export function parseHtml(html) {
  const root = new Element('#root');
  let current = root;
  let i = 0;
  const n = html.length;

  while (i < n) {
    if (html[i] === '<') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? n : end + 3;
        continue;
      }
      if (html.startsWith('<!', i)) { // doctype
        const end = html.indexOf('>', i);
        i = end === -1 ? n : end + 1;
        continue;
      }
      if (html[i + 1] === '/') { // closing tag
        const end = html.indexOf('>', i);
        const tag = html.slice(i + 2, end).trim().toLowerCase();
        // pop up to matching open
        let node = current;
        while (node && node !== root && node.tagName !== tag) node = node.parent;
        if (node && node !== root) current = node.parent;
        i = end === -1 ? n : end + 1;
        continue;
      }
      // opening tag
      const end = findTagEnd(html, i);
      const rawTag = html.slice(i + 1, end);
      const { tagName, attributes, selfClosing } = parseTag(rawTag);
      const el = new Element(tagName);
      for (const [k, v] of attributes) el.attributes.set(k, v);
      el.parent = current;
      current.children.push(el);
      i = end + 1;
      if (RAWTEXT.has(el.tagName)) {
        const closeIdx = html.toLowerCase().indexOf(`</${el.tagName}`, i);
        const raw = html.slice(i, closeIdx === -1 ? n : closeIdx);
        el.children.push(attachText(el, raw));
        i = closeIdx === -1 ? n : html.indexOf('>', closeIdx) + 1;
        continue;
      }
      if (!selfClosing && !VOID.has(el.tagName)) current = el;
    } else {
      const next = html.indexOf('<', i);
      const text = html.slice(i, next === -1 ? n : next);
      if (text) current.children.push(attachText(current, decodeEntities(text)));
      i = next === -1 ? n : next;
    }
  }
  return new Document(root);
}

function attachText(parent, value) {
  const t = new TextNode(value);
  t.parent = parent;
  return t;
}

function findTagEnd(html, start) {
  let i = start + 1;
  let inQuote = null;
  while (i < html.length) {
    const ch = html[i];
    if (inQuote) { if (ch === inQuote) inQuote = null; }
    else if (ch === '"' || ch === "'") inQuote = ch;
    else if (ch === '>') return i;
    i += 1;
  }
  return html.length;
}

function parseTag(raw) {
  let selfClosing = false;
  let s = raw.trim();
  if (s.endsWith('/')) { selfClosing = true; s = s.slice(0, -1).trim(); }
  const m = s.match(/^([a-zA-Z0-9:-]+)/);
  const tagName = m ? m[1] : 'div';
  const attributes = new Map();
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let am;
  let rest = s.slice(tagName.length);
  while ((am = attrRe.exec(rest))) {
    const name = am[1].toLowerCase();
    const value = am[3] ?? am[4] ?? am[5] ?? '';
    attributes.set(name, decodeEntities(value));
  }
  return { tagName, attributes, selfClosing };
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// ---- Selector engine ----
function parseSelector(selector) {
  return selector.split(',').map((group) =>
    group.trim().split(/\s+/).filter(Boolean).map(parseCompound)
  );
}

function parseCompound(token) {
  const compound = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([.#]?[\w-]+)|(\[[^\]]+\])/g;
  let m;
  while ((m = re.exec(token))) {
    const part = m[0];
    if (part.startsWith('.')) compound.classes.push(part.slice(1));
    else if (part.startsWith('#')) compound.id = part.slice(1);
    else if (part.startsWith('[')) compound.attrs.push(parseAttr(part.slice(1, -1)));
    else compound.tag = part.toLowerCase();
  }
  return compound;
}

function parseAttr(body) {
  const m = body.match(/^([\w-]+)\s*(\*=|\^=|\$=|=)?\s*(?:"([^"]*)"|'([^']*)'|([^\]]*))?$/);
  if (!m) return { name: body, op: null, value: null };
  return { name: m[1].toLowerCase(), op: m[2] || null, value: m[3] ?? m[4] ?? m[5] ?? null };
}

function matchesCompound(el, c) {
  if (el.type !== 'element') return false;
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  for (const cls of c.classes) if (!el.classList.includes(cls)) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v == null) return false;
    if (a.op === '=' && v !== a.value) return false;
    if (a.op === '*=' && !v.includes(a.value)) return false;
    if (a.op === '^=' && !v.startsWith(a.value)) return false;
    if (a.op === '$=' && !v.endsWith(a.value)) return false;
  }
  return true;
}

function matchesGroup(el, compounds) {
  const last = compounds[compounds.length - 1];
  if (!matchesCompound(el, last)) return false;
  let idx = compounds.length - 2;
  let ancestor = el.parent;
  while (idx >= 0 && ancestor && ancestor.type === 'element') {
    if (matchesCompound(ancestor, compounds[idx])) idx -= 1;
    ancestor = ancestor.parent;
  }
  return idx < 0;
}

export { Element, Document };
