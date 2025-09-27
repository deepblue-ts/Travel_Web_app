/**
 * server/services/trace.js
 * ------------------------------------------------------------
 * 目的:
 *  - 旅程生成パイプラインの“完全トレース”を、既存 ExcelLogger の logs.json に記録する
 *  - planId が無い場合は no-op（そのまま動作）
 *
 * ログの形:
 *  type: 'trace'
 *  payload: {
 *    ts: ISO8601,
 *    stage: 'create-day-plans:llm:call' | 'budget:normalize' | ...（自由）
 *    tag?: 'start' | 'end' | 'step' | 'error' | 'mark'
 *    input?: any, output?: any, meta?: any, error?: {message, stack}
 *    ms?: number   // 計測時間
 *  }
 *
 * 閲覧:
 *  - /api/plan/state で logs をまとめて取得可能（既存）
 *  - 本PRで追加の /api/plan/trace で trace だけを抽出して返せる
 */

import { ExcelLogger } from '../excelLogger.js';

const nowISO = () => new Date().toISOString();

async function write(planId, payload) {
  if (!planId) return;
  try {
    const logger = new ExcelLogger(planId);
    await logger.log('trace', payload);
  } catch {
    // 失敗は握りつぶし（アプリ動作を止めない）
  }
}

/** マーカー（開始/終了/任意メモ） */
export async function traceMark(planId, stage, tag = 'mark', meta = null) {
  await write(planId, { ts: nowISO(), stage, tag, meta });
}

/** 1ステップの入出力を保存（任意に ms / meta 追加可） */
export async function traceStep(planId, stage, { input = null, output = null, meta = null, ms = null } = {}) {
  await write(planId, { ts: nowISO(), stage, tag: 'step', input, output, meta, ms });
}

/** エラー保存 */
export async function traceError(planId, stage, error, meta = null) {
  const out = {
    ts: nowISO(),
    stage,
    tag: 'error',
    error: {
      message: error?.message || String(error),
      stack: String(error?.stack || ''),
    },
    meta,
  };
  await write(planId, out);
}

/**
 * 計測付きで fn を実行し、入出力/所要時間を trace に残す。
 * stage: ラベル
 * kwa:   { before, after } で任意のメタや入力を残せる
 */
export async function traceTimed(planId, stage, fn, { before = null, afterMeta = null } = {}) {
  const t0 = Date.now();
  try {
    await traceStep(planId, stage + ':start', { input: before, output: null, meta: null, ms: 0 });
    const output = await fn();
    const ms = Date.now() - t0;
    await traceStep(planId, stage + ':end', { input: before, output, meta: afterMeta || null, ms });
    return output;
  } catch (e) {
    const ms = Date.now() - t0;
    await traceError(planId, stage, e, { ms, before });
    throw e;
  }
}

/**
 * 小さなユーティリティ:
 *  - 値のスナップショットを丸ごと保存（大きすぎる場合は meta で要約化を検討）
 */
export async function traceSnapshot(planId, stage, label, value) {
  await write(planId, { ts: nowISO(), stage, tag: label || 'snapshot', output: value });
}
