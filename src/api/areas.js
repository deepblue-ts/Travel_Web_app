// src/api/areas.js
const API_BASE = import.meta.env.VITE_API_BASE;
const LS_KEY = 'areasCache_v1';
const TTL = 1000 * 60 * 60 * 24 * 30; // 30日

function canon(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKC').trim().toLowerCase();
  s = s.replace(/\s+/g, '').replace(/[都道府県市区町村郡]$/u, '');
  const map = {
    tokyo: '東京', kyoto: '京都', osaka: '大阪',
    hokkaido: '北海道', okinawa: '沖縄'
  };
  if (map[s]) s = map[s];
  return s;
}

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function save(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
}

export async function fetchAreas(destination) {
  const key = canon(destination);
  const store = load();
  const now = Date.now();
  const entry = store[key];
  if (entry && entry.expiresAt > now) return entry.areas;

  const url = `${API_BASE}/api/get-areas?destination=${encodeURIComponent(destination)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error('get-areas failed');
  const data = await res.json();
  const areas = data.areas || [];

  store[key] = { areas, expiresAt: now + TTL };
  save(store);
  return areas;
}
