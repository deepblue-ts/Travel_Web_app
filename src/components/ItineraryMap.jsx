// src/components/ItineraryMap.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeItinerary, geocodePlace } from '../api/llmService';

// Leaflet のデフォルトアイコン（Viteのアセット解決対策）
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const DAY_COLORS = ['#1976d2', '#2e7d32', '#ef6c00', '#6a1b9a', '#ad1457', '#00838f'];

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const makeKey = (day, name) => `${day}||${norm(name)}`;
const makeQuery = (name, area, dest) =>
  [name, area, dest, '日本'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export default function ItineraryMap({ destination, itinerary, selected, onSelect }) {
  const [map, setMap] = useState(null);                 // Leaflet Map インスタンス
  const [geo, setGeo] = useState(null);                 // スケジュール座標
  const [destCenter, setDestCenter] = useState(null);   // 目的地中心座標
  const markerRefs = useRef({});                        // key -> Marker インスタンス
  const [error, setError] = useState(null);

  // 1) 目的地をジオコーディング → 初期はここにフォーカス
  useEffect(() => {
    if (!destination) return;
    (async () => {
      try {
        const r = await geocodePlace(destination);
        if (r?.lat && r?.lon) {
          setDestCenter({ lat: Number(r.lat), lon: Number(r.lon) });
          if (map) map.setView([Number(r.lat), Number(r.lon)], 12, { animate: false });
        }
      } catch {
        // 失敗時はデフォルト中心のまま
      }
    })();
  }, [destination, map]);

  // 2) 行程を一括ジオコーディング（キャッシュ利用）
  useEffect(() => {
    if (!destination || !itinerary?.length) return;
    (async () => {
      try {
        const data = await geocodeItinerary(destination, itinerary);
        setGeo(data);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [destination, itinerary]);

  // 3) dayごとのライン・マーカー・選択ポイント
  const { dayLines, selectedPoint } = useMemo(() => {
    if (!geo?.results) return { dayLines: [], selectedPoint: null };

    const byQuery = new Map(geo.results.map((r) => [r.query, r]));
    const lines = [];
    let sel = null;

    for (const day of itinerary) {
      const pts = [];
      for (const s of day.schedule || []) {
        const q = makeQuery(s.activity_name, day.area, destination);
        const hit = byQuery.get(q);
        if (hit && Number.isFinite(+hit.lat) && Number.isFinite(+hit.lon)) {
          const key = makeKey(day.day, s.activity_name);
          const meta = { day: day.day, area: day.area, name: s.activity_name, time: s.time, desc: s.description, url: s.url, key };
          const p = { lat: Number(hit.lat), lon: Number(hit.lon), meta };
          pts.push(p);
          if (selected && key === makeKey(selected.day, selected.name)) sel = p;
        }
      }
      if (pts.length) lines.push({ day: day.day, color: DAY_COLORS[(day.day - 1) % DAY_COLORS.length], points: pts });
    }

    return { dayLines: lines, selectedPoint: sel };
  }, [geo, itinerary, destination, selected]);

  // 4) 左のクリックで地図を動かす（flyTo & 該当マーカーのPopupを開く）
  useEffect(() => {
    if (!map || !selectedPoint) return;
    map.flyTo([selectedPoint.lat, selectedPoint.lon], Math.max(14, map.getZoom()), { duration: 0.6 });
    const m = markerRefs.current[selectedPoint.meta.key];
    if (m) m.openPopup();
  }, [selectedPoint, map]);

  return (
    <div style={{ height: 640, borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 24px rgba(0,0,0,.06)' }}>
      <MapContainer
        whenCreated={setMap}
        center={destCenter ? [destCenter.lat, destCenter.lon] : [35.681236, 139.767125]}
        zoom={destCenter ? 12 : 6}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {dayLines.map((day) => (
          <React.Fragment key={day.day}>
            <Polyline
              positions={day.points.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: day.color, weight: 4, opacity: 0.9 }}
            />
            {day.points.map((p, idx) => {
              const isSelected = selectedPoint && selectedPoint.meta.key === p.meta.key;
              return (
                <React.Fragment key={`${day.day}-${idx}`}>
                  {isSelected && (
                    <CircleMarker center={[p.lat, p.lon]} radius={10} pathOptions={{ color: day.color, weight: 3, fillOpacity: 0.3 }} />
                  )}
                  <Marker
                    position={[p.lat, p.lon]}
                    ref={(el) => { if (el) markerRefs.current[p.meta.key] = el; }}
                    eventHandlers={{
                      click: () => onSelect?.({ day: p.meta.day, name: p.meta.name }),
                    }}
                  >
                    <Popup>
                      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                        <div><strong>Day {p.meta.day}</strong>（{p.meta.area}）</div>
                        <div>{p.meta.time ? `${p.meta.time}：` : ''}{p.meta.name}</div>
                        {p.meta.desc && <div style={{ marginTop: 6, color: '#555' }}>{p.meta.desc}</div>}
                        {p.meta.url && (
                          <div style={{ marginTop: 6 }}>
                            <a href={p.meta.url} target="_blank" rel="noreferrer">詳細を見る</a>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </MapContainer>

      {error && <div style={{ padding: 8, color: '#c62828' }}>地図データ取得に失敗: {error}</div>}
    </div>
  );
}
