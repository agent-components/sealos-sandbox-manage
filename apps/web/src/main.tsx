import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setupZhCNLocale } from 'listpage-components';
import '../node_modules/listpage-components/dist/index.css';
import { App } from './app/App';
import './styles/global.css';

setupZhCNLocale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);