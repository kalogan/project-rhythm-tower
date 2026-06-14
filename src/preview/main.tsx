import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Preview } from './Preview.js';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
