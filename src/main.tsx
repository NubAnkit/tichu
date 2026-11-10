import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { registerDigitFont } from './ui/fonts/registerDigitFont';
import './ui/themes/base.css';
import './ui/themes/arcade.css';

registerDigitFont();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
