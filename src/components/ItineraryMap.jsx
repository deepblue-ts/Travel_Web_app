// src/components/ItineraryMap.jsx  ← 全文置換
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleMap,
  Marker,
  Polyline,
  InfoWindow,
  Circle,
  useJsApiLoader,
} from '@react-google-maps/api';
import { geocodeItinerary, geocodePlace } from '../api/llmService';

// ---- 設定 ----
const DAY_COLORS = ['#1976d2', '#2e7d32', '#ef6c00', '#6a1b9a', '#ad1457', '#00838f'];
const MAP_CONTAINER_STYLE = { height: 640, width: '100%' };
const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 }; // 東京駅

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const makeKey = (day, name) => `${day}||${norm(name)}`;
const makeQuery = (name, area, dest) =>
  [name, area, dest, '日本'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

// ▼ 環境変数名を一本化（旧名 fallback つき）
const GMAPS_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_JS_API_KEY || // 推奨（新）
  import.meta.env.VITE_GMAPS_BROWSER_KEY;        // 旧
const GMAPS_MAP_ID =
  (import.meta.env.VITE_GMAPS_MAP_ID || import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim() || undefined;

export default function ItineraryMap({ destination, itinerary, selected, onSelect }) {
  const [destCenter, setDestCenter] = useState(null);   // 目的地中心
  const [geo, setGeo] = useState(null);                 // バッチジオコード結果
  const [error, setError] = useState(null);
  const [activeKey, setActiveKey] = useState(null);     // InfoWindow用

  const mapRef = useRef(null);
  const markersRef = useRef({}); // key -> {lat,lng,meta}

  // Google Maps JS API の読み込み
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'gmap-script',
    googleMapsApiKey: GMAPS_KEY,
    // AdvancedMarker を使う時に必要（今回は通常 Marker だが future-proof）
    libraries: ['marker'],
    // locale
    language: 'ja',
    region: 'JP',
  });

  // 1) 目的地センター
  useEffect(() => {
    if (!destination) return;
    (async () => {
      try {
        const r = await geocodePlace(destination);
        if (r?.lat && r?.lon) {
          setDestCenter({ lat: Number(r.lat), lng: Number(r.lon) });
        }
      } catch {}
    })();
  }, [destination]);

  // 2) 行程の一括ジオコーディング
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

  // 3) dayごとの線・点・選択ポイント
  const { dayLines, selectedPoint, allPoints } = useMemo(() => {
    if (!geo?.results) return { dayLines: [], selectedPoint: null, allPoints: [] };
    const byQuery = new Map(geo.results.map((r) => [r.query, r]));

    const lines = [];
    const all = [];
    let sel = null;

    for (const day of itinerary || []) {
      const pts = [];
      for (const s of day.schedule || []) {
        const q = makeQuery(s.activity_name, day.area, destination);
        const hit = byQuery.get(q);
        if (hit && Number.isFinite(+hit.lat) && Number.isFinite(+hit.lon)) {
          const key = makeKey(day.day, s.activity_name);
          const meta = {
            day: day.day, area: day.area, name: s.activity_name,
            time: s.time, desc: s.description, url: s.url, key
          };
          const p = { lat: Number(hit.lat), lng: Number(hit.lon), meta };
          pts.push(p);
          all.push(p);
          if (selected && key === makeKey(selected.day, selected.name)) sel = p;
        }
      }
      if (pts.length) {
        lines.push({
          day: day.day,
          color: DAY_COLORS[(day.day - 1) % DAY_COLORS.length],
          points: pts,
        });
      }
    }
    return { dayLines: lines, selectedPoint: sel, allPoints: all };
  }, [geo, itinerary, destination, selected]);

  // 4) マップ初期表示：目的地 or 全ポイントにフィット
  const onMapLoad = (map) => {
    mapRef.current = map;
    if (allPoints.length > 0 && window.google) {
      const b = new window.google.maps.LatLngBounds();
      allPoints.forEach((p) => b.extend(p));
      map.fitBounds(b, 60);
    } else if (destCenter) {
      map.setCenter(destCenter);
      map.setZoom(12);
    } else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(6);
    }
  };

  // 5) 左カラムからの選択に追従
  useEffect(() => {
    if (!mapRef.current || !selectedPoint) return;
    mapRef.current.panTo(selectedPoint);
    mapRef.current.setZoom(Math.max(14, mapRef.current.getZoom()));
    setActiveKey(selectedPoint.meta.key);
  }, [selectedPoint]);

  // --- UI ガード ---
  if (!GMAPS_KEY) {
    return (
      <div style={{ padding: 12, color: '#c62828', background: '#fff3f3', borderRadius: 8 }}>
        Google Maps のブラウザ用 API キーが設定されていません。<br />
        <code>VITE_GOOGLE_MAPS_JS_API_KEY</code> を GitHub Secrets → <code>.env.production</code> に流し込んでください。
      </div>
    );
  }
  if (loadError) {
    return <div style={{ padding: 8, color: '#c62828' }}>Google Mapsの読み込みに失敗しました。</div>;
  }
  if (!isLoaded) return <div style={{ height: 640 }} />;

  return (
    <div style={{ height: 640, borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 24px rgba(0,0,0,.06)' }}>
      <GoogleMap
        onLoad={onMapLoad}
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={destCenter || DEFAULT_CENTER}
        zoom={destCenter ? 12 : 6}
        options={{
          // mapId はキーと同じ GCP プロジェクトで発行したものだけ設定する
          mapId: GMAPS_MAP_ID,
          clickableIcons: false,
          gestureHandling: 'greedy',
        }}
      >
        {/* ルート線とマーカー */}
        {dayLines.map((day) => (
          <React.Fragment key={day.day}>
            <Polyline
              path={day.points}
              options={{ strokeColor: day.color, strokeOpacity: 0.9, strokeWeight: 4 }}
            />
            {day.points.map((p, idx) => {
              const isActive = activeKey === p.meta.key;
              const info = (
                <div style={{ fontSize: 14, lineHeight: 1.4, maxWidth: 240 }}>
                  <div><strong>Day {p.meta.day}</strong>（{p.meta.area}）</div>
                  <div>{p.meta.time ? `${p.meta.time}：` : ''}{p.meta.name}</div>
                  {p.meta.desc && <div style={{ marginTop: 6, color: '#555' }}>{p.meta.desc}</div>}
                  {p.meta.url && (
                    <div style={{ marginTop: 6 }}>
                      <a href={p.meta.url} target="_blank" rel="noreferrer">詳細を見る</a>
                    </div>
                  )}
                </div>
              );

              markersRef.current[p.meta.key] = p;

              return (
                <React.Fragment key={`${day.day}-${idx}`}>
                  {isActive && (
                    <Circle
                      center={p}
                      radius={60}
                      options={{
                        strokeColor: day.color,
                        strokeOpacity: 0.9,
                        strokeWeight: 3,
                        fillOpacity: 0.15,
                      }}
                    />
                  )}
                  <Marker
                    position={p}
                    onClick={() => {
                      setActiveKey(p.meta.key);
                      onSelect?.({ day: p.meta.day, name: p.meta.name });
                    }}
                  />
                  {isActive && (
                    <InfoWindow position={p} onCloseClick={() => setActiveKey(null)}>
                      {info}
                    </InfoWindow>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </GoogleMap>

      {error && <div style={{ padding: 8, color: '#c62828' }}>地図データ取得に失敗: {error}</div>}
    </div>
  );
}
