/**
 * Cockpit entry — mounts the Preact board into #cockpit-root. The Electron shell
 * loads dist/index.html via loadFile after injecting window.__RECODER_COCKPIT__.
 */
import { render } from 'preact';
import { App } from './App';
import './styles.css';

const root = document.getElementById('cockpit-root');
if (root) {
  render(<App />, root);
}
