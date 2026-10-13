// Loads backend/.env no matter which folder the server or a script is started from.
// Values already set in the real environment (e.g. on Cloud Run) always win.
import path from 'node:path';
import dotenv from 'dotenv';

export const BACKEND_DIR = import.meta.dirname;
dotenv.config({ path: path.join(BACKEND_DIR, '.env'), quiet: true });

// Resolve a folder setting (UPLOAD_DIR, BACKUP_DIR, FRONTEND_DIST) relative to the backend folder
export const backendPath = (value, fallback) => path.resolve(BACKEND_DIR, value || fallback);
