// Renders a single contact's avatar preview and badges. Avatar markdown is
// inserted with textContent to avoid any markup injection.

export function renderProfileDetail(container, contact) {
  container.innerHTML = `
    <div class="card">
      <div class="contact-name"></div>
      <div class="badges"></div>
      <details open>
        <summary>Avatar preview</summary>
        <pre class="avatar-preview"></pre>
      </details>
      <div class="note muted"></div>
    </div>
  `;
  container.querySelector('.contact-name').textContent = contact.full_name || contact.canonical_url || 'Unknown';
  container.querySelector('.avatar-preview').textContent = contact.avatar_profile || '(no avatar generated)';
  const note = contact.profile_note || '';
  container.querySelector('.note').textContent = note;

  const badges = container.querySelector('.badges');
  if (contact.score != null) badges.appendChild(pill(`score ${contact.score}`, ''));
  if (contact.confidence) badges.appendChild(pill(contact.confidence, confClass(contact.confidence)));
  if (contact.source_type) badges.appendChild(pill(contact.source_type, ''));
}

function pill(text, cls) {
  const s = document.createElement('span');
  s.className = `pill ${cls}`;
  s.textContent = text;
  return s;
}

function confClass(c) {
  return c === 'high' ? 'pill-ok' : c === 'medium' ? 'pill-warn' : 'pill-unavailable';
}
