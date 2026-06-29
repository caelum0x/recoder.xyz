/**
 * Cockpit entry — mounts the Preact board into #cockpit-root. The Electron shell
 * loads dist/index.html via loadFile after injecting window.__RECODER_COCKPIT__.
 */
import { render } from 'preact';
import { App } from './App';
import { applyDesignTokens } from './lib/design-tokens';
import './styles.css';

// Consume the shared @recoder/design-tokens set in-process: rebind the cockpit's
// semantic CSS custom properties to the canonical token values before first paint.
// Degrade-safe — falls back to the styles.css defaults if tokens are unavailable.
applyDesignTokens(document.documentElement);

const root = document.getElementById('cockpit-root');
if (root) {
  render(<App />, root);
}
