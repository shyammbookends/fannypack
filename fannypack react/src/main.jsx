import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';

import './assets/css/bootstrap.min.css';
import './assets/css/aos.css';
import './assets/css/all.min.css';
import './assets/css/style.css';
import './assets/css/mobile.css';
import './assets/css/shop.css';

// Bootstrap JS (navbar collapse data-api)
import 'bootstrap';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
