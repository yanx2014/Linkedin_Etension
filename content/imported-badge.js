// Renders a small "Already imported" badge on a supported profile page when the
// contact already exists in the workspace. Purely additive UI; never modifies
// LinkedIn data or reads cookies.

export function showImportedBadge(state) {
  const existing = document.getElementById('prospect-tool-badge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'prospect-tool-badge';
  badge.textContent = state === 'imported' ? '✓ Already imported' : '＋ Not imported';
  Object.assign(badge.style, {
    position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
    padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontFamily: 'system-ui, sans-serif',
    color: '#fff', background: state === 'imported' ? '#0a7d33' : '#555',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none'
  });
  document.body.appendChild(badge);
}
