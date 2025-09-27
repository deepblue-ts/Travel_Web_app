// server/services/areas.js
import { readJsonFile, writeJsonFile } from './fsutil.js';
import { createLLMHandler } from './llm.js';
import { areaSystemPrompt } from '../prompts.js';

export function normalizeCandidates(dest) {
  if (!dest) return [];
  const raw = String(dest).trim();
  const noSpace = raw.replace(/\s+/g, '');
  const lower = noSpace.toLowerCase();
  const strip1 = noSpace.replace(/[都道府県市区町村郡]$/u, '');
  const strip1lower = strip1.toLowerCase();
  return Array.from(new Set([raw, noSpace, lower, strip1, strip1lower]));
}
export function findCacheKey(cacheObj, dest) {
  const cands = normalizeCandidates(dest);
  for (const key of Object.keys(cacheObj || {})) {
    const kc = normalizeCandidates(key);
    if (kc.some((k) => cands.includes(k))) return key;
  }
  return null;
}
export function canonicalizeDestination(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKC').trim().toLowerCase();
  s = s.replace(/\s+/g, '');
  s = s.replace(/[都道府県市区町村郡]$/u, '');
  const romaji2ja = { tokyo:'東京', kyoto:'京都', osaka:'大阪', hokkaido:'北海道', okinawa:'沖縄', fukuoka:'福岡', nagoya:'名古屋', sapporo:'札幌', nara:'奈良', kobe:'神戸', yokohama:'横浜', chiba:'千葉', saitama:'埼玉', hiroshima:'広島', sendai:'仙台' };
  if (romaji2ja[s]) s = romaji2ja[s];
  return s;
}
export function isValidAreas(areas) {
  return Array.isArray(areas) &&
    areas.every(a => a && typeof a.name === 'string' &&
      Array.isArray(a.spots) && a.spots.every((s) => typeof s === 'string'));
}

export async function getAreasWithCache({ destination, openai, AREA_CACHE_FILE }) {
  if (!destination || typeof destination !== 'string') throw new Error('destination は必須です（string）');

  const ckey = canonicalizeDestination(destination);
  const disk = await readJsonFile(AREA_CACHE_FILE);
  const hitKeyByFn    = findCacheKey(disk, destination);
  const hitKeyByCanon = Object.keys(disk).find(k => canonicalizeDestination(k) === ckey);
  const hitKey = hitKeyByFn || hitKeyByCanon;

  if (hitKey && disk[hitKey]?.areas) {
    const payload = disk[hitKey];
    return {
      payload: { areas: payload.areas, source: 'cache', cache_key: hitKey, updatedAt: payload.updatedAt || null },
      cache: 'HIT-DISK',
      cacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
    };
  }

  const llm = createLLMHandler(openai, areaSystemPrompt, 'areas', 'gpt-4o-mini', { raw: true });
  const json = await llm.__call({ body: { destination }, planId: null });
  const areas = json?.areas;
  if (!isValidAreas(areas)) throw new Error('AI応答の形式が不正（areas 配列が不正）');

  const entry = { areas, updatedAt: new Date().toISOString() };
  const updated = { ...(disk || {}), [String(destination).trim()]: entry, [ckey]: entry };
  await writeJsonFile(AREA_CACHE_FILE, updated);

  return {
    payload: { areas, source: 'ai', cache_key: String(destination).trim(), updatedAt: entry.updatedAt },
    cache: 'MISS',
    cacheControl: 'public, max-age=60',
  };
}
