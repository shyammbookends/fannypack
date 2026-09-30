import crypto from 'node:crypto';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { Router } from 'express';
import { audit } from '../lib/audit.js';
import { HttpError } from './util.js';

// Media library: images, videos and 3D models, stored in /uploads and served at /uploads/...
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

// extension -> [allowed mime types, max bytes, magic-byte check]
const TYPES = {
  jpg: [['image/jpeg'], 8e6, (b) => b[0] === 0xff && b[1] === 0xd8],
  jpeg: [['image/jpeg'], 8e6, (b) => b[0] === 0xff && b[1] === 0xd8],
  png: [['image/png'], 8e6, (b) => b.subarray(0, 4).toString('hex') === '89504e47'],
  webp: [['image/webp'], 8e6, (b) => b.subarray(8, 12).toString() === 'WEBP'],
  gif: [['image/gif'], 8e6, (b) => b.subarray(0, 3).toString() === 'GIF'],
  mp4: [['video/mp4'], 60e6, (b) => b.subarray(4, 8).toString() === 'ftyp'],
  webm: [['video/webm'], 60e6, (b) => b.subarray(0, 4).toString('hex') === '1a45dfa3'],
  glb: [['model/gltf-binary', 'application/octet-stream'], 40e6, (b) => b.subarray(0, 4).toString() === 'glTF'],
  ico: [['image/x-icon', 'image/vnd.microsoft.icon'], 1e6, (b) => b[0] === 0 && b[1] === 0 && b[2] === 1],
};

export const uploads = Router();

// Body is the raw file; name comes in the X-Filename header
uploads.post('/uploads', express.raw({ type: '*/*', limit: '60mb' }), async (req, res) => {
  const original = String(req.get('x-filename') || '').slice(0, 200);
  const ext = path.extname(original).slice(1).toLowerCase();
  const rule = TYPES[ext];
  if (!rule) throw new HttpError(400, 'Allowed files: JPG, PNG, WEBP, GIF, ICO, MP4, WEBM, GLB.');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw new HttpError(400, 'The file is empty.');
  if (buf.length > rule[1]) throw new HttpError(413, `That file is too large (max ${Math.round(rule[1] / 1e6)} MB).`);
  if (!rule[2](buf)) throw new HttpError(400, 'The file contents do not match its type.');
  const folder = ext === 'glb' ? 'models' : ['mp4', 'webm'].includes(ext) ? 'videos' : 'images';
  const base = path.basename(original, path.extname(original)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
  const name = `${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  await mkdir(path.join(UPLOAD_DIR, folder), { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, folder, name), buf);
  const url = `/uploads/${folder}/${name}`;
  await audit(req, 'media.upload', 'media', url, null, { size: buf.length });
  res.status(201).json({ url, size: buf.length, type: folder });
});

uploads.get('/uploads', async (_req, res) => {
  const out = [];
  for (const folder of ['images', 'videos', 'models']) {
    let files = [];
    try {
      files = await readdir(path.join(UPLOAD_DIR, folder));
    } catch {
      continue;
    }
    for (const f of files) {
      const s = await stat(path.join(UPLOAD_DIR, folder, f));
      out.push({ url: `/uploads/${folder}/${f}`, type: folder, size: s.size, modified: s.mtime });
    }
  }
  out.sort((a, b) => b.modified - a.modified);
  res.json(out.slice(0, 300));
});
