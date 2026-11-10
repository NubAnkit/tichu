import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { registerDigitFont } from './ui/fonts/registerDigitFont';
import { initSfx } from './ui/sfx';
import './ui/themes/base.css';
import './ui/themes/arcade.css';

registerDigitFont();
initSfx();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
