// server/services/fare.js
export async function estimateFare({ origin, destination, transport = 'public', GOOGLE_MAPS_API_KEY }) {
  const q = (mode) =>
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&mode=${mode}` +
    `&language=ja&region=JP&departure_time=now&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY || '')}`;

  let transitJson = null, drivingJson = null;

  if (transport === 'public' && GOOGLE_MAPS_API_KEY) {
    try { const r = await fetch(q('transit')); transitJson = await r.json(); } catch {}
  }
  if (GOOGLE_MAPS_API_KEY) {
    try { const r2 = await fetch(q('driving')); drivingJson = await r2.json(); } catch {}
  }

  const legDistKm = (j) => j?.routes?.[0]?.legs?.[0]?.distance?.value
    ? j.routes[0].legs[0].distance.value / 1000 : null;

  const transitFare = transitJson?.routes?.[0]?.fare?.value ?? null;
  const distanceKm  = legDistKm(transitJson) ?? legDistKm(drivingJson) ?? null;

  let fareYen = null; let source = 'heuristic';
  if (transport === 'public' && transitFare != null) {
    fareYen = Math.round(transitFare); source = 'gmaps_fare';
  } else if (distanceKm != null) {
    if (transport === 'public') {
      fareYen =
        distanceKm <= 20  ? Math.round(150 + distanceKm * 30) :
        distanceKm <= 100 ? Math.round(500 + distanceKm * 22) :
                            Math.round(4500 + distanceKm * 23);
    } else {
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
