import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // API calls go to the Express server (npm run server)
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/robots.txt': 'http://localhost:5000',
      '/sitemap.xml': 'http://localhost:5000',
    },
  },
});
