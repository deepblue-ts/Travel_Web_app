// server/services/geocode.js
import { readJsonFile, writeJsonFile } from './fsutil.js';
import { isHttpUrl, buildMapsPlaceUrl, buildMapsSearchUrl } from './urlutil.js';
import { ExcelLogger } from '../excelLogger.js';

const L1_GEOCODE = new Map();
const GEOCODE_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildGeocodeQuery(it, destination) {
  return [
    it?.name || it?.activity_name || '',
    it?.area || it?.areaName || '',
    destination || '',
    '日本',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export async function geocodeViaGoogle(
  query,
  { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LANG = 'ja', GOOGLE_MAPS_REGION = 'JP' } = {}
) {
  if (!GOOGLE_MAPS_API_KEY) return null;

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
      let website = ''; let gmapsUrl = '';

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
          display_name: top?.formatted_address || top?.name || query,
          source: 'gmaps_places',
        };
      }
    }
  } catch {}

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

      let website = ''; let gmapsUrl = '';
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
  } catch {}
  return null;
}

export async function geocodeViaNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&accept-language=ja&q=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'webapp-travel/1.0 (contact: you@example.com)' } });
    const arr = await resp.json().catch(() => []);
    if (Array.isArray(arr) && arr.length > 0) {
      const top = arr[0];
      return { lat: Number(top.lat), lon: Number(top.lon), display_name: top.display_name, source: 'nominatim' };
    }
  } catch {}
  return null;
}

export async function geocodeBatchInternal({
  destination, items, planId,
  GEOCODE_CACHE_FILE,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LANG = 'ja',
  GOOGLE_MAPS_REGION = 'JP',
}) {
  const diskCache = await readJsonFile(GEOCODE_CACHE_FILE);
  const results = [];
  const now = Date.now();

  for (const it of items || []) {
    const query = buildGeocodeQuery(it, destination);
    if (!query) continue;

    const l1 = L1_GEOCODE.get(query);
    if (l1 && l1.expiresAt > now) { results.push({ query, ...l1, source: 'cache:l1' }); continue; }

    const disk = diskCache[query];
    if (disk) {
      results.push({ query, ...disk, source: disk?.source?.startsWith('gmaps') ? disk.source : 'cache:disk' });
      L1_GEOCODE.set(query, { ...disk, expiresAt: now + GEOCODE_TTL_MS });
      continue;
    }

    let hit = await geocodeViaGoogle(query, { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LANG, GOOGLE_MAPS_REGION });
    if (!hit) {
      hit = await geocodeViaNominatim(query);
      if (!hit) { results.push({ query, lat: null, lon: null, error: 'not_found' }); continue; }
      await sleep(1100);
    }

    diskCache[query] = {
      lat: hit.lat, lon: hit.lon, display_name: hit.display_name, source: hit.source,
      place_id: hit.place_id || '', website: hit.website || '', gmaps_url: hit.gmaps_url || '',
    };
    await writeJsonFile(GEOCODE_CACHE_FILE, diskCache).catch(() => {});
    L1_GEOCODE.set(query, { ...diskCache[query], expiresAt: now + GEOCODE_TTL_MS });

    results.push({ query, ...diskCache[query], source: hit.source });
  }

  if (planId) {
    try {
      const logger = new ExcelLogger(planId);
      for (const r of results) await logger.log('geocode', r);
    } catch {}
  }
  return results;
}

export function mergeGeocodesIntoItinerary(destination, itinerary, geocodeResults) {
  const map = new Map((geocodeResults || []).map(r => [r.query, r]));
  for (const day of itinerary || []) {
    for (const s of (day.schedule || [])) {
      const q = [
        s.activity_name || s.name || '',
        day.area || '',
        destination || '',
        '日本',
      ].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();

      const hit = map.get(q);
      if (hit && hit.lat != null && hit.lon != null) {
        if (s.lat == null) s.lat = hit.lat;
        if (s.lon == null) s.lon = hit.lon;
      }
      const hasValidUrl = s.url && isHttpUrl(s.url);
      if (!hasValidUrl) {
        if (hit?.website && isHttpUrl(hit.website)) s.url = hit.website;
        else if (hit?.gmaps_url && isHttpUrl(hit.gmaps_url)) s.url = hit.gmaps_url;
        else if (hit?.place_id) s.url = buildMapsPlaceUrl(hit.place_id);
        else s.url = buildMapsSearchUrl(s.activity_name || s.name || '', day.area || '', destination || '');
      }
    }
  }
  return itinerary;
}
