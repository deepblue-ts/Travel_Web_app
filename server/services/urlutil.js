// server/services/urlutil.js
export function isHttpUrl(u) {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; }
  catch { return false; }
}
export function buildMapsPlaceUrl(placeId) {
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}` : '';
}
export function buildMapsSearchUrl(name, area, dest) {
  const q = [name, area, dest, '日本'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
