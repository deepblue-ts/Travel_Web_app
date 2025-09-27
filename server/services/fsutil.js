// server/services/fsutil.js
import fs from 'fs/promises';
import path from 'path';

export async function ensureFile(p, init = '{}\n') {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    try { await fs.access(p); } catch { await fs.writeFile(p, init, 'utf8'); }
  } catch (e) { console.warn('ensureFile failed:', p, e.message); }
}

export async function readJsonFile(p) {
  try {
    await ensureFile(p);
    const raw = await fs.readFile(p, 'utf8').catch(async (e) => {
      if (e.code === 'ENOENT') { await fs.writeFile(p, '{}\n'); return '{}\n'; }
      throw e;
    });
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('readJsonFile failed, fallback to {}:', p, e.message);
    return {};
  }
}

export async function writeJsonFile(p, obj) {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  } catch (e) { console.warn('writeJsonFile failed (ignored):', p, e.message); }
}
