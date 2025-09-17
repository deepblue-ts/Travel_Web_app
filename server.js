/**
 * server.js — サーバーのエントリーポイント
 * ------------------------------------------------------------
 * 役割:
 *  - Express の起動・基本ミドルウェア設定（CORS / JSON ボディ）
 *  - 環境変数の読み込みと基礎設定（PORT / CACHE_DIR / Google Maps など）
 *  - OpenAI クライアントの初期化
 *  - ルーティング登録関数 registerRoutes() を呼び出し、全エンドポイントを有効化
 *  - サーバーのリッスン開始（起動ログ・エラーハンドリング）
 *
 * このファイルでは「URLパスやAPIの仕様を変更しない」ことが原則。
 * 公開APIの追加・変更は server/routes.js 側で行う。
 *
 * 主な環境変数:
 *  - PORT, OPENAI_API_KEY
 *  - GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_REGION, GOOGLE_MAPS_LANG
 *  - CACHE_DIR, RENDER / RENDER_EXTERNAL_URL, ALLOWED_ORIGINS
 *
 * 依存:
 *  - ./server/routes.js（ルーティング一括登録）
 */

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerRoutes } from './server/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config -------------------------------------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Render 等の本番で /tmp を使う。CACHE_DIR 環境変数があれば最優先。
const IS_RENDER = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const CACHE_DIR =
  process.env.CACHE_DIR ||
  (IS_RENDER ? '/tmp/travel-cache'
             : (process.env.NODE_ENV === 'production'
                ? '/tmp/travel-cache'
                : path.join(__dirname, 'cache')));

const AREA_CACHE_FILE    = path.join(CACHE_DIR, 'area-cache.json');
const GEOCODE_CACHE_FILE = path.join(CACHE_DIR, 'geocode-cache.json');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_REGION  = process.env.GOOGLE_MAPS_REGION || 'jp';
const GOOGLE_MAPS_LANG    = process.env.GOOGLE_MAPS_LANG   || 'ja';

// ---- Express ------------------------------------------------
const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS: dev/Pages/追加オリジン（ALLOWED_ORIGINS で拡張可）
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://deepblue-ts.github.io',
  'https://deepblue-ts.github.io/Travel_Web_app/',
];
const allowList = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const origins = [...new Set([...defaultOrigins, ...allowList])];
app.use(cors({ origin: origins }));

// ヘルスチェック
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- OpenAI -------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Routes (public APIは従来通り) --------------------------
await registerRoutes(app, {
  openai,
  CACHE_DIR,
  AREA_CACHE_FILE,
  GEOCODE_CACHE_FILE,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_REGION,
  GOOGLE_MAPS_LANG,
});

// ---- Start --------------------------------------------------
app
  .listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', `Backend listening at http://localhost:${PORT}`);
    console.log('OPENAI key exists?', !!process.env.OPENAI_API_KEY);
    console.log('GOOGLE_MAPS_API_KEY exists?', !!GOOGLE_MAPS_API_KEY);
    console.log('CACHE_DIR:', CACHE_DIR);
    console.log('CORS origins:', origins.join(', '));
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\x1b[31m%s\x1b[0m', `FATAL: Port ${PORT} is already in use.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
