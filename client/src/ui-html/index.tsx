import { render } from 'preact';
import { App } from './App';
import './app.css';

export function mountUI(): void {
  let root = document.getElementById('ui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui-root';
    document.body.appendChild(root);
  }
  render(<App />, root);
}
