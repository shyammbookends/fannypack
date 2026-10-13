// Vercel serverless function: the whole Express backend (backend/app.js).
// vercel.json sends /api/*, /uploads/*, /sitemap.xml and /robots.txt here; everything else is the static website.
import app from '../backend/app.js';

export default app;
