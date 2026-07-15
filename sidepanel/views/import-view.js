// Sources tab view. Thin wrapper around the source panel component.

import { renderSourcePanel } from '../components/source-panel.js';

export function renderSourcesView(root, api) {
  renderSourcePanel(root, api);
}
