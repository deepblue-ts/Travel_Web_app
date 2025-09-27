import { useEffect, useMemo, useState } from 'react';
import { loadPlan, updatePlan } from '../api/planstore';

/**
 * 汎用プラン閲覧ページ
 * - /p/:readId にマウント
 * - POST /api/plan-saves で保存したプランを読み込み・表示
 * - localStorage に editToken:<readId> がある場合はタイトル編集を許可
 */
export default function PlanViewer({ readId: readIdProp }) {
  const [readId, setReadId] = useState(readIdProp || '');

  // props が来なければ #/p/<readId> から拾う
  useEffect(() => {
    if (readIdProp) { setReadId(readIdProp); return; }

    const parseFromHash = () => {
      const h = (window.location.hash || '').replace(/^#/, '');
      const m = h.match(/^\/p\/([^/?#]+)/);
      setReadId(m?.[1] || '');
    };
    parseFromHash();
    window.addEventListener('hashchange', parseFromHash);
    return () => window.removeEventListener('hashchange', parseFromHash);
  }, [readIdProp]);

  const [data, setData] = useState(null);          // { title, plan, meta, createdAt, updatedAt }
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const hasEditToken = useMemo(
    () => Boolean(readId && localStorage.getItem(`editToken:${readId}`)),
    [readId]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');
    loadPlan(readId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setTitle(res?.title || '');
        setStatus('ok');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [readId]);

  // 共有URL（GitHub Pages でも動くよう BASE_URL を考慮）
  const shareUrl = useMemo(() => {
    const base = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');
    return `${location.origin}${base}/p/${readId}`;
  }, [readId]);

  // ---- 表示用ユーティリティ -------------------------------------------------
  const itinerary = useMemo(() => normalizeToItinerary(data?.plan), [data]);
  const meta = data?.meta || {};

  const onSaveTitle = async () => {
    try {
      setSaving(true);
      await updatePlan(readId, { title });
      setData((prev) => ({ ...(prev || {}), title }));
    } catch (e) {
      alert(`タイトル更新に失敗: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('URL をコピーしました！\n' + shareUrl);
    } catch {
      // フォールバック
      window.prompt('このURLをコピーしてください:', shareUrl);
    }
  };

  if (status === 'loading') {
    return <PageWrap><div className="pv-card">読み込み中...</div></PageWrap>;
  }
  if (status === 'error') {
    return (
      <PageWrap>
        <div className="pv-card pv-error">
          <h2>読み込みエラー</h2>
          <p>{error}</p>
        </div>
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <header className="pv-header">
        <div className="pv-title-row">
          {hasEditToken ? (
            <div className="pv-title-edit">
              <input
                className="pv-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="無題プラン"
              />
              <button className="pv-btn" onClick={onSaveTitle} disabled={saving}>
                {saving ? '保存中…' : 'タイトルを保存'}
              </button>
            </div>
          ) : (
            <h1 className="pv-title">{data?.title || '無題プラン'}</h1>
          )}
        </div>
        <div className="pv-sub">
          <span>ID: <code>{readId}</code></span>
          {data?.updatedAt && <span>更新: {fmtDateTime(data.updatedAt)}</span>}
          {data?.createdAt && <span>作成: {fmtDateTime(data.createdAt)}</span>}
        </div>

        <div className="pv-actions">
          <button className="pv-btn" onClick={onCopy}>共有用URLをコピー</button>
          <a className="pv-link" href={shareUrl} target="_blank" rel="noreferrer">このページを新規タブで開く</a>
        </div>
      </header>

      {/* メタ情報（任意） */}
      {meta && Object.keys(meta).length > 0 && (
        <section className="pv-card">
          <h3>プラン概要</h3>
          <div className="pv-meta-grid">
            {Object.entries(meta).map(([k, v]) => (
              <div key={k} className="pv-meta-row">
                <div className="pv-meta-key">{k}</div>
                <div className="pv-meta-val">{renderValue(v)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 本文：日別スケジュール */}
      {itinerary.length > 0 ? (
        <section className="pv-list">
          {itinerary.map((d, idx) => (
            <article className="pv-card" key={idx}>
              <div className="pv-dayhead">
                <div className="pv-dayleft">
                  <div className="pv-daytitle">
                    {d.title || `Day ${d.day ?? idx + 1}`}
                    {d.date ? <span className="pv-daydate">（{d.date}）</span> : null}
                  </div>
                  {d.area && <div className="pv-area">Area: {d.area}</div>}
                </div>
                <div className="pv-dayright">
                  {isNum(d.budgetPerDay) && (
                    <span className="pv-chip">予算/日: ¥{number(d.budgetPerDay)}</span>
                  )}
                  {isNum(totalJPY(d)) && (
                    <span className="pv-chip pv-chip--sum">合計: ¥{number(totalJPY(d))}</span>
                  )}
                </div>
              </div>

              <ul className="pv-schedule">
                {(d.schedule || []).map((s, i) => {
                  const name = s.activity_name || s.name || '(no title)';
                  const price = s.price_jpy ?? s.cost_jpy ?? s.price ?? s.cost ?? null;
                  const url = s.url || s.link;
                  const time = s.time || s.start_time || '';
                  const loc =
                    s.address || s.display_name ||
                    [s.lat, s.lon].every((x) => x != null) ? `(${s.lat}, ${s.lon})` : '';

                  return (
                    <li className="pv-slot" key={i}>
                      <div className="pv-time">{time}</div>
                      <div className="pv-body">
                        <div className="pv-name">
                          {url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : name}
                        </div>
                        {(price != null || loc) && (
                          <div className="pv-subrow">
                            {price != null && <span>¥{number(price)}</span>}
                            {loc && <span className="pv-dot">·</span>}
                            {loc && <span className="pv-loc">{loc}</span>}
                          </div>
                        )}
                        {s.notes && <div className="pv-notes">{s.notes}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      ) : (
        <section className="pv-card">
          <h3>プラン（JSON）</h3>
          <pre className="pv-pre">{JSON.stringify(data?.plan, null, 2)}</pre>
        </section>
      )}
    </PageWrap>
  );
}

// -------------------- 見た目（軽量CSS in JS） --------------------
function PageWrap({ children }) {
  return (
    <div style={{
      maxWidth: 960, margin: '24px auto', padding: '0 16px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif',
      color: '#23263a'
    }}>
      <style>{`
        .pv-header { margin-bottom: 16px; }
        .pv-title { margin: 0 0 8px; font-size: 24px; }
        .pv-title-row { display:flex; align-items:center; gap:8px; }
        .pv-title-edit { display:flex; gap:8px; align-items:center; width:100%; }
        .pv-input { flex:1; padding:10px 12px; border:1px solid #d0d4e0; border-radius:8px; font-size:16px; }
        .pv-btn { padding:10px 14px; border:0; border-radius:8px; background:#2f6feb; color:#fff; cursor:pointer; }
        .pv-btn:disabled { opacity: .6; cursor: default; }
        .pv-link { margin-left: 12px; font-size: 14px; color:#2f6feb; text-decoration: underline; }
        .pv-sub { display:flex; gap:16px; color:#6b7280; font-size: 12px; margin-bottom: 8px; }
        .pv-actions { display:flex; align-items:center; gap:8px; margin-bottom: 16px; }

        .pv-card { background:#fff; border:1px solid #e6e8f0; border-radius:12px; padding:16px; box-shadow: 0 1px 0 rgba(0,0,0,.02); }
        .pv-error { border-color:#f2c5c5; background:#fff7f7; }
        .pv-list { display: grid; gap: 16px; }
        .pv-dayhead { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom: 8px; }
        .pv-daytitle { font-weight: 700; }
        .pv-daydate { color:#6b7280; font-weight: 400; margin-left: 6px; }
        .pv-area { color:#6b7280; font-size: 14px; }
        .pv-chip { display:inline-block; background:#f1f5ff; color:#2f3a8f; padding:4px 8px; border-radius:999px; font-size:12px; margin-left:8px; }
        .pv-chip--sum { background:#eefcf2; color:#1b8a3a; }
        .pv-schedule { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
        .pv-slot { display:grid; grid-template-columns: 88px 1fr; gap:12px; align-items:start; }
        .pv-time { color:#6b7280; font-variant-numeric: tabular-nums; margin-top: 2px; }
        .pv-name { font-weight:600; }
        .pv-subrow { display:flex; gap:8px; color:#445; font-size: 14px; align-items:center; }
        .pv-dot { opacity:.45; }
        .pv-loc { color:#6b7280; }
        .pv-notes { margin-top:4px; color:#444; font-size: 14px; }
        .pv-meta-grid { display:grid; grid-template-columns: 160px 1fr; gap:8px 12px; }
        .pv-meta-row { display:contents; }
        .pv-meta-key { color:#6b7280; }
        .pv-meta-val { }
        .pv-pre { max-height: 560px; overflow:auto; background:#0b1020; color:#e6f0ff; padding:12px; border-radius:8px; }
      `}</style>
      {children}
    </div>
  );
}

// -------------------- データ整形ヘルパ --------------------
function normalizeToItinerary(plan) {
  if (!plan) return [];
  // 1) { itinerary: [...] }
  if (Array.isArray(plan.itinerary)) return plan.itinerary;

  // 2) そのまま配列（days配列）
  if (Array.isArray(plan)) return plan;

  // 3) { days: [...] }
  if (Array.isArray(plan.days)) return plan.days;

  // 4) その他 → 空
  return [];
}

function totalJPY(day) {
  // schedule[*].price_jpy / cost_jpy / price / cost を合計
  const arr = Array.isArray(day?.schedule) ? day.schedule : [];
  let sum = 0;
  for (const s of arr) {
    const v = [s.price_jpy, s.cost_jpy, s.price, s.cost].find((x) => isNum(x));
    if (isNum(v)) sum += Number(v);
  }
  return sum || null;
}

function fmtDateTime(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s);
    return d.toLocaleString();
  } catch {
    return String(s);
  }
}

function number(v) {
  try {
    return Number(v).toLocaleString('ja-JP');
  } catch {
    return String(v);
  }
}
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function renderValue(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v.toLocaleString('ja-JP');
  if (Array.isArray(v)) return v.map(renderValue).join(', ');
  try { return JSON.stringify(v); } catch { return String(v); }
}
