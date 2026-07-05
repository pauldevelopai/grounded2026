import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { applyBrandHead } from './beaiready/brand.js';
import './index.css';

// Host-aware title/OG (item 7): on the beaiready.* door, swap the static
// "Grounded" head for "Be AI Ready" before the app renders. No-op on grounded.*.
applyBrandHead();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
