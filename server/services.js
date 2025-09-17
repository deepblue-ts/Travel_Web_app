/**
 * server/services.js — ビジネスロジック層（LLM / Geocode / URL補完 / Fare）
 * ------------------------------------------------------------
 * 役割:
 *  - LLM呼び出し（OpenAI）と ExcelLogger を使った入出力ログ
 *  - Google Maps / Nominatim を使ったジオコーディング＋キャッシュ
 *  - Places Details API で website/url/place_id を取得し、URLを“必ず開ける形”に補完
 *  - 運賃見積り（Directions API の fare or 距離ヒューリスティック）
 *  - /api/get-areas 用のキャッシュ付き取得ロジック
 *
 * ルータからは関数を呼ぶだけでOK。公開APIの形は routes.js で定義。
 */

import fs from 'fs/promises';
import path from 'path';
import { ExcelLogger } from './excelLogger.js';
import { areaSystemPrompt } from './prompts.js';

// ---------------------------
// 汎用ファイルユーティリティ
// ---------------------------
async function ensureFile(p, init = '{}\n') {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    try { await fs.access(p); } catch { await fs.writeFile(p, init, 'utf8'); }
  } catch (e) {
    console.warn('ensureFile failed:', p, e.message);
  }
}
async function readJsonFile(p) {
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
async function writeJsonFile(p, obj) {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('writeJsonFile failed (ignored):', p, e.message);
  }
}

// ---------------------------
// エリアキャッシュ用の正規化
// ---------------------------
function normalizeCandidates(dest) {
  if (!dest) return [];
  const raw = String(dest).trim();
  const noSpace = raw.replace(/\s+/g, '');
  const lower = noSpace.toLowerCase();
  const strip1 = noSpace.replace(/[都道府県市区町村郡]$/u, '');
  const strip1lower = strip1.toLowerCase();
  return Array.from(new Set([raw, noSpace, lower, strip1, strip1lower]));
}
function findCacheKey(cacheObj, dest) {
  const cands = normalizeCandidates(dest);
  for (const key of Object.keys(cacheObj || {})) {
    const kc = normalizeCandidates(key);
    if (kc.some((k) => cands.includes(k))) return key;
  }
  return null;
}
function canonicalizeDestination(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKC').trim().toLowerCase();
  s = s.replace(/\s+/g, '');
  s = s.replace(/[都道府県市区町村郡]$/u, '');
  const romaji2ja = {
    tokyo: '東京', kyoto: '京都', osaka: '大阪',
    hokkaido: '北海道', okinawa: '沖縄', fukuoka: '福岡',
    nagoya: '名古屋', sapporo: '札幌', nara: '奈良',
    kobe: '神戸', yokohama: '横浜', chiba: '千葉',
    saitama: '埼玉', hiroshima: '広島', sendai: '仙台',
  };
  if (romaji2ja[s]) s = romaji2ja[s];
  return s;
}

// ---------------------------
// JSON抽出/妥当性チェック
// ---------------------------
function extractJsonFromString(text = '') {
  const s = text.indexOf('{');
  if (s === -1) return null;
  const e = text.lastIndexOf('}');
  if (e === -1 || e < s) return null;
  return text.substring(s, e + 1);
}
function isValidAreas(areas) {
  return (
    Array.isArray(areas) &&
    areas.every(
      (a) =>
        a &&
        typeof a.name === 'string' &&
        Array.isArray(a.spots) &&
        a.spots.every((s) => typeof s === 'string')
    )
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------
// URL ユーティリティ
// ---------------------------
function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch { return false; }
}
function buildMapsPlaceUrl(placeId) {
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}` : '';
}
function buildMapsSearchUrl(name, area, dest) {
  const q = [name, area, dest, '日本'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// ---------------------------
// Excel 保存
// ---------------------------
export async function persistItineraryAndExport(planId, itinerary, extra = {}) {
  if (!planId || !Array.isArray(itinerary)) return null;
  try {
    const logger = new ExcelLogger(planId);
    const finalPlan = { itinerary, ...extra };
    const xlsxPath = await logger.exportXlsx(finalPlan);
    return { finalPlan, xlsxPath };
  } catch (e) {
    console.warn('persistItineraryAndExport failed (ignored):', e.message);
    return null;
  }
}

// ---------------------------
// Geocoding 共通
// ---------------------------
export function buildGeocodeQuery(it, destination) {
  return [
    it?.name || it?.activity_name || '',
    it?.area || it?.areaName || '',
    destination || '',
    '日本',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// L1メモリキャッシュ
const L1_GEOCODE = new Map(); // key(query) => { lat, lon, display_name, website, gmaps_url, place_id, source, expiresAt }
const GEOCODE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180日

// Google Maps（Place Detailsで website/url/place_id を取る）
export async function geocodeViaGoogle(
  query,
  { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LANG = 'ja', GOOGLE_MAPS_REGION = 'JP' } = {}
) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  // 1) Places Text Search
  const placesUrl =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}` +
    `&language=${encodeURIComponent(GOOGLE_MAPS_LANG)}` +
    `&region=${encodeURIComponent(GOOGLE_MAPS_REGION)}` +
    `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;

  try {
    const r = await fetch(placesUrl);
    const j = await r.json();
    if (j?.status === 'OK' && Array.isArray(j.results) && j.results.length > 0) {
      const top = j.results[0];
      const lat = top?.geometry?.location?.lat;
      const lon = top?.geometry?.location?.lng;
      const placeId = top?.place_id || null;

      let website = '';
      let gmapsUrl = '';

      if (placeId) {
        const detailsUrl =
          `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${encodeURIComponent(placeId)}` +
          `&fields=website,url` +
          `&language=${encodeURIComponent(GOOGLE_MAPS_LANG)}` +
          `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
        try {
          const dr = await fetch(detailsUrl);
          const dj = await dr.json();
          website = dj?.result?.website || '';
          gmapsUrl = dj?.result?.url || '';
        } catch (e) {
          console.warn('place details error:', e.message);
        }
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          lat, lon,
          place_id: placeId,
          website: website || '',
          gmaps_url: gmapsUrl || '',
          display_name: top?.formatted_address || top?.name || query,
          source: 'gmaps_places',
        };
      }
    }
  } catch (e) {
    console.warn('geocodeViaGoogle(places) error:', e.message);
  }

  // 2) Geocoding API
  const geocodeUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}` +
    `&language=${encodeURIComponent(GOOGLE_MAPS_LANG)}` +
    `&region=${encodeURIComponent(GOOGLE_MAPS_REGION)}` +
    `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
  try {
    const r = await fetch(geocodeUrl);
    const j = await r.json();
    if (j?.status === 'OK' && Array.isArray(j.results) && j.results.length > 0) {
      const top = j.results[0];
      const lat = top?.geometry?.location?.lat;
      const lon = top?.geometry?.location?.lng;
      const placeId = top?.place_id || null;

      let website = '';
      let gmapsUrl = '';
      if (placeId) {
        const detailsUrl =
          `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${encodeURIComponent(placeId)}` +
          `&fields=website,url` +
          `&language=${encodeURIComponent(GOOGLE_MAPS_LANG)}` +
          `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
        try {
          const dr = await fetch(detailsUrl);
          const dj = await dr.json();
          website = dj?.result?.website || '';
          gmapsUrl = dj?.result?.url || '';
        } catch {}
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          lat, lon,
          place_id: placeId,
          website: website || '',
          gmaps_url: gmapsUrl || '',
          display_name: top?.formatted_address || query,
          source: 'gmaps_geocode',
        };
      }
    }
  } catch (e) {
    console.warn('geocodeViaGoogle(geocode) error:', e.message);
  }

  return null;
}

export async function geocodeViaNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&accept-language=ja&q=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'webapp-travel/1.0 (contact: you@example.com)' },
    });
    const arr = await resp.json().catch(() => []);
    if (Array.isArray(arr) && arr.length > 0) {
      const top = arr[0];
      return {
        lat: Number(top.lat),
        lon: Number(top.lon),
        display_name: top.display_name,
        source: 'nominatim',
      };
    }
  } catch (e) {
    console.warn('geocodeViaNominatim error:', e.message);
  }
  return null;
}

export async function geocodeBatchInternal({
  destination, items, planId,
  GEOCODE_CACHE_FILE,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LANG = 'ja',
  GOOGLE_MAPS_REGION = 'JP',
}) {
  try { await fs.mkdir(path.dirname(GEOCODE_CACHE_FILE), { recursive: true }); } catch (e) { console.warn('mkdir cache failed:', e.message); }

  const diskCache = await readJsonFile(GEOCODE_CACHE_FILE);
  const results = [];
  const now = Date.now();

  for (const it of items || []) {
    const query = buildGeocodeQuery(it, destination);
    if (!query) continue;

    // 1) L1
    const l1 = L1_GEOCODE.get(query);
    if (l1 && l1.expiresAt > now) {
      results.push({ query, ...l1, source: 'cache:l1' });
      continue;
    }

    // 2) Disk
    const disk = diskCache[query];
    if (disk) {
      results.push({ query, ...disk, source: disk?.source?.startsWith('gmaps') ? disk.source : 'cache:disk' });
      L1_GEOCODE.set(query, { ...disk, expiresAt: now + GEOCODE_TTL_MS });
      continue;
    }

    // 3) Google → 4) Fallback OSM
    let hit = await geocodeViaGoogle(query, { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LANG, GOOGLE_MAPS_REGION });
    if (!hit) {
      hit = await geocodeViaNominatim(query);
      if (!hit) {
        results.push({ query, lat: null, lon: null, error: 'not_found' });
        continue;
      }
      // Nominatim は丁寧に間隔を空ける
      await sleep(1100);
    }

    // 永続化（website/gmaps_url/place_id も保存）
    diskCache[query] = {
      lat: hit.lat,
      lon: hit.lon,
      display_name: hit.display_name,
      source: hit.source,
      place_id: hit.place_id || '',
      website: hit.website || '',
      gmaps_url: hit.gmaps_url || '',
    };
    await writeJsonFile(GEOCODE_CACHE_FILE, diskCache).catch(() => {});
    L1_GEOCODE.set(query, { ...diskCache[query], expiresAt: now + GEOCODE_TTL_MS });

    results.push({ query, ...diskCache[query], source: hit.source });
  }

  // Excel ログ（失敗は無視）
  if (planId) {
    try {
      const logger = new ExcelLogger(planId);
      for (const r of results) await logger.log('geocode', r);
    } catch (e) {
      console.warn('ExcelLogger log geocode failed (ignored):', e.message);
    }
  }

  return results;
}

export function mergeGeocodesIntoItinerary(destination, itinerary, geocodeResults) {
  const map = new Map((geocodeResults || []).map(r => [r.query, r]));

  for (const day of itinerary || []) {
    for (const s of (day.schedule || [])) {
      const q = buildGeocodeQuery({ name: s.activity_name || s.name, area: day.area }, destination);
      const hit = map.get(q);

      // 座標の付与
      if (hit && hit.lat != null && hit.lon != null) {
        if (s.lat == null) s.lat = hit.lat;
        if (s.lon == null) s.lon = hit.lon;
      }

      // URL 補完（LLMのURLがダメでもここで直す）
      const hasValidUrl = s.url && isHttpUrl(s.url);
      if (!hasValidUrl) {
        if (hit?.website && isHttpUrl(hit.website)) {
          s.url = hit.website;
        } else if (hit?.gmaps_url && isHttpUrl(hit.gmaps_url)) {
          s.url = hit.gmaps_url;
        } else if (hit?.place_id) {
          s.url = buildMapsPlaceUrl(hit.place_id);
        } else {
          s.url = buildMapsSearchUrl(s.activity_name || s.name || '', day.area || '', destination || '');
        }
      }
    }
  }
  return itinerary;
}

// ---------------------------
// LLM 呼び出し（ExcelLogger ログ込）
// ---------------------------
export function createLLMHandler(openai, systemPrompt, agent, model, opts = {}) {
  const rawMode = !!opts.raw;

  const handler = async (req, res) => {
    try {
      const json = await __call({ body: req.body, planId: req.body?.planId });
      res.json(json);
    } catch (error) {
      const status = error?.status || error?.response?.status || 500;
      const detail = error?.response?.data || null;
      console.error(`${agent || 'api'} Error:`, error?.message, detail);
      res.status(status).json({ error: error?.message || 'Unknown server error', detail });
    }
  };

  async function __call({ body, planId }) {
    const filtered = { ...(body || {}) };
    delete filtered.planId;

    const userPrompt = `提供された情報: ${JSON.stringify(filtered)}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    if (planId) {
      try {
        const logger = new ExcelLogger(planId);
        await logger.log('llm_input', {
          agent: agent || 'unknown',
          model,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          variables_json: filtered,
        });
      } catch (e) {
        console.warn('ExcelLogger log llm_input failed (ignored):', e.message);
      }
    }

    const chat = await openai.chat.completions.create({
      messages,
      model,
      response_format: { type: 'json_object' },
    });

    const raw = chat?.choices?.[0]?.message?.content ?? '';
    let json;
    if (rawMode) {
      // routes 側でそのまま使いたい
      try { json = JSON.parse(raw); }
      catch {
        const extracted = extractJsonFromString(raw);
        if (!extracted) throw new Error('AI応答がJSONで返りませんでした');
        json = JSON.parse(extracted);
      }
    } else {
      // area など形式バリデーションが必要な用途
      try { json = JSON.parse(raw); }
      catch {
        const extracted = extractJsonFromString(raw);
        if (!extracted) throw new Error('AI応答がJSONで返りませんでした');
        json = JSON.parse(extracted);
      }
    }

    if (planId) {
      try {
        const logger = new ExcelLogger(planId);
        await logger.log('llm_output', {
          agent: agent || 'unknown',
          model,
          raw_text: raw,
          parsed_json: json,
          usage: chat?.usage ?? null,
          finish_reason: chat?.choices?.[0]?.finish_reason ?? null,
        });
      } catch (e) {
        console.warn('ExcelLogger log llm_output failed (ignored):', e.message);
      }
    }

    return json;
  }

  handler.__call = __call;
  return handler;
}

// ---------------------------
// /api/get-areas 向け: キャッシュ付き取得
// ---------------------------
export async function getAreasWithCache({ destination, openai, AREA_CACHE_FILE }) {
  if (!destination || typeof destination !== 'string') {
    throw new Error('destination は必須です（string）');
  }

  const ckey = canonicalizeDestination(destination);
  const now = Date.now();

  // L1（簡易: Map ではなくディスクのみで十分だが、ここではヘッダー制御のみ実装）
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

  // MISS → LLM
  const llm = createLLMHandler(openai, areaSystemPrompt, 'areas', 'gpt-4o-mini', { raw: true });
  const json = await llm.__call({ body: { destination }, planId: null });

  const areas = json?.areas;
  if (!isValidAreas(areas)) throw new Error('AI応答の形式が不正（areas 配列が不正）');

  const entry = { areas, updatedAt: new Date().toISOString() };
  const updated = {
    ...(disk || {}),
    [String(destination).trim()]: entry,
    [ckey]: entry,
  };
  await writeJsonFile(AREA_CACHE_FILE, updated);

  return {
    payload: { areas, source: 'ai', cache_key: String(destination).trim(), updatedAt: entry.updatedAt },
    cache: 'MISS',
    cacheControl: 'public, max-age=60',
  };
}

// ---------------------------
// /api/estimate-fare ロジック
// ---------------------------
export async function estimateFare({ origin, destination, transport = 'public', GOOGLE_MAPS_API_KEY }) {
  const q = (mode) =>
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&mode=${mode}` +
    `&language=ja&region=JP&departure_time=now&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY || '')}`;

  let transitJson = null, drivingJson = null;

  // 1) transit を試す（fare が返ることがある）
  if (transport === 'public' && GOOGLE_MAPS_API_KEY) {
    try {
      const r = await fetch(q('transit'));
      transitJson = await r.json();
    } catch {}
  }

  // 2) driving で距離だけは確保（フォールバック）
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const r2 = await fetch(q('driving'));
      drivingJson = await r2.json();
    } catch {}
  }

  const legDistKm = (j) => j?.routes?.[0]?.legs?.[0]?.distance?.value
    ? j.routes[0].legs[0].distance.value / 1000
    : null;

  const transitFare = transitJson?.routes?.[0]?.fare?.value ?? null;
  const distanceKm  = legDistKm(transitJson) ?? legDistKm(drivingJson) ?? null;

  let fareYen = null;
  let source  = 'heuristic';

  if (transport === 'public' && transitFare != null) {
    fareYen = Math.round(transitFare);
    source  = 'gmaps_fare';
  } else if (distanceKm != null) {
    if (transport === 'public') {
      // 距離ベース超概算
      fareYen =
        distanceKm <= 20  ? Math.round(150 + distanceKm * 30) :
        distanceKm <= 100 ? Math.round(500 + distanceKm * 22) :
                            Math.round(4500 + distanceKm * 23); // 新幹線相当ざっくり
    } else {
      // 自動車（燃料費のみ／高速別途）
      const FUEL_PRICE = Number(process.env.FUEL_PRICE_YEN_PER_L || 170);
      const FUEL_ECON  = Number(process.env.FUEL_ECONOMY_KM_PER_L || 13);
      fareYen = Math.round((distanceKm / FUEL_ECON) * FUEL_PRICE);
    }
  }

  return {
    ok: true,
    mode: transport === 'public' ? 'transit' : 'driving',
    distanceKm,
    fareYen: fareYen ?? 0,
    currency: 'JPY',
    source,
    statusTransit: transitJson?.status || null,
    statusDriving: drivingJson?.status || null,
  };
}

// ---------------------------
// exports（ルータから使うやつ）
// ---------------------------
export {
  ensureFile,
  readJsonFile,
  writeJsonFile,
  normalizeCandidates,
  findCacheKey,
  canonicalizeDestination,
  extractJsonFromString,
  isValidAreas,
  isHttpUrl,
  buildMapsPlaceUrl,
  buildMapsSearchUrl,
};
