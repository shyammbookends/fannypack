import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';

// Fonts served from this site (no render-blocking Google Fonts request); only the needed subsets download
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/dancing-script/700.css';
import './assets/css/bootstrap.min.css';
import './assets/css/aos.css';
import './assets/css/icons.css'; // Font Awesome subset (npm run icons)
import './assets/css/style.css';
import './assets/css/mobile.css';
import './assets/css/shop.css';


import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
