/* ============================================================
   Entry point — mount <App> and load the global stylesheet.
   ============================================================ */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';

import '@/styles/app.css';
import '@/styles/layout-fix.css';
import '@/styles/contrast.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
