// src/api/planstore.js

const BASE =
  (import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/+$/, '') || '/api';

export async function savePlan({ title, plan, meta }) {
  const r = await fetch(`${BASE}/plan-saves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, plan, meta })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'save failed');

  // 1) 編集トークンを保管（同端末での編集用）
  localStorage.setItem(`editToken:${j.readId}`, j.editToken);

  // 2) Topページ用のローカル目次を更新（最大50件）
  try {
    const idx = JSON.parse(localStorage.getItem('myPlans') || '[]');
    idx.unshift({
      readId: j.readId,
      title: title || '無題プラン',
      savedAt: new Date().toISOString()
    });
    localStorage.setItem('myPlans', JSON.stringify(idx.slice(0, 50)));
  } catch {}

  return j; // { readId, readUrl, editToken }
}

export async function loadPlan(readId) {
  const r = await fetch(`${BASE}/plan-saves/${readId}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'load failed');
  return j;
}

export async function updatePlan(readId, payload) {
  const token = localStorage.getItem(`editToken:${readId}`);
  if (!token) throw new Error('編集トークンが見つかりません');
  const r = await fetch(`${BASE}/plan-saves/${readId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Edit-Token': token },
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'update failed');
  return j;
}

/* ---------------------- Topページ用ユーティリティ ---------------------- */

// 一覧を取得
export function listMyPlans() {
  try {
    const idx = JSON.parse(localStorage.getItem('myPlans') || '[]');
    return Array.isArray(idx) ? idx : [];
  } catch {
    return [];
  }
}

// 1件をローカルから削除（※サーバ側は削除しない）
export function removeMyPlan(readId) {
  try {
    const idx = listMyPlans().filter((p) => p.readId !== readId);
    localStorage.setItem('myPlans', JSON.stringify(idx));
    localStorage.removeItem(`editToken:${readId}`); // トークンも消しておく
    return idx;
  } catch {
    return listMyPlans();
  }
}

// 共有URL（Hashルーター対応）
export function makePlanUrl(readId) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${location.origin}${base}/#/p/${readId}`;
}
