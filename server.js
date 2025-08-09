// server.js (ESM)
import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// ─────────────────────────────────────────────
// 0) パス解決（どこで実行しても安全に）
// ─────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const AREA_CACHE_FILE = path.join(__dirname, 'cache', 'area-cache.json')

// ─────────────────────────────────────────────
// 1) セットアップ
// ─────────────────────────────────────────────
const app = express()
const port = 3001

app.use(express.json({ limit: '10mb' }))
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─────────────────────────────────────────────
// 2) ユーティリティ
// ─────────────────────────────────────────────
async function ensureAreaCache() {
  await fs.mkdir(path.dirname(AREA_CACHE_FILE), { recursive: true })
  try {
    await fs.access(AREA_CACHE_FILE)
  } catch {
    await fs.writeFile(AREA_CACHE_FILE, '{}\n', 'utf8')
  }
}

async function readAreaCache() {
  await ensureAreaCache()
  const raw = await fs.readFile(AREA_CACHE_FILE, 'utf8')
  try {
    return raw.trim() ? JSON.parse(raw) : {}
  } catch (e) {
    console.error('area-cache.json のJSONパースに失敗:', e.message)
    throw new Error('area-cache.json が壊れています（JSONエラー）')
  }
}

async function writeAreaCache(cacheObj) {
  const text = JSON.stringify(cacheObj, null, 2)
  await fs.writeFile(AREA_CACHE_FILE, text + '\n', 'utf8')
}

function normalizeCandidates(dest) {
  if (!dest) return []
  const raw = String(dest).trim()
  const noSpace = raw.replace(/\s+/g, '')
  const lower = noSpace.toLowerCase()
  const strip1 = noSpace.replace(/[都道府県市区町村]$/u, '')
  const strip1lower = strip1.toLowerCase()
  return Array.from(new Set([raw, noSpace, lower, strip1, strip1lower]))
}

function findCacheKey(cacheObj, dest) {
  const cands = normalizeCandidates(dest)
  for (const key of Object.keys(cacheObj || {})) {
    const kc = normalizeCandidates(key)
    if (kc.some(k => cands.includes(k))) return key
  }
  return null
}

function extractJsonFromString(text = '') {
  const s = text.indexOf('{')
  if (s === -1) return null
  const e = text.lastIndexOf('}')
  if (e === -1 || e < s) return null
  return text.substring(s, e + 1)
}

function isValidAreas(areas) {
  return Array.isArray(areas) && areas.every(
    a => a && typeof a.name === 'string' && Array.isArray(a.spots) && a.spots.every(s => typeof s === 'string')
  )
}

// ─────────────────────────────────────────────
// 3) LLM 共通呼び出し
// ─────────────────────────────────────────────

const areaSystemPrompt = `
あなたは日本の地理と観光に非常に精通した、正確性を最重視する地理情報のエキスパートです。
# あなたのタスク
ユーザーから提示された目的地に基づき、観光客に人気のある代表的なエリアや地域を最大5つ提案してください。
# 厳守すべきルール
1.  **地理的関連性の徹底**: 提案するエリアは、必ずユーザーが提示した目的地 **の内部にある地域** に限定してください。
2.  **無関係なエリアの排除**: 絶対に、提示された目的地と地理的に全く関係のない都道府県や市のエリアを含めないでください。
# 出力形式
- 各エリアについて、その特徴を表す代表的な観光スポットを2〜3つ挙げてください。
- JSON以外の文字列は一切含めず、必ず以下のJSON形式で出力してください: 
{ "areas": [ { "name": "エリア名1", "spots": ["代表的な観光スポットA", "代表的な観光スポットB"] } ] }
`;

const diningSystemPrompt = `あなたは食事の専門家です。提示された旅行条件に基づき、おすすめのレストランを3つ提案してください。**各レストランについて、具体的な「概算料金（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"restaurants": [{"name": "店名", "type": "ジャンル", "price": "1,000円〜2,000円", "url": "https://example.com"}]}`;

const accommodationSystemPrompt = `あなたは宿泊施設の専門家です。提示された旅行条件に基づき、おすすめのホテルや旅館を2つ提案してください。**各施設について、具体的な「一泊あたりの概算料金（price）」と「公式サイトや予約サイトのURL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"hotels": [{"name": "施設名", "type": "種別", "price": "15,000円〜", "url": "https://example.com"}]}`;

const activitySystemPrompt = `あなたは観光アクティビティの専門家です。提示された旅行条件に基づき、おすすめのアクティビティを3つ提案してください。**各アクティビティについて、具体的な「入場料や参加費（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"activities": [{"name": "アクティビティ名", "type": "種別", "price": "無料", "url": "https://example.com"}]}`;

const createMasterPlanSystemPrompt = `
# 命令
あなたは旅行の戦略家です。提示された条件に基づき、旅行全体の骨格となる「エリア分割計画」をJSON形式で出力してください。
# あなたのタスク
1.  旅行日数を考慮し、各日に訪れるべきメインの「エリア」を決定する。
2.  各日のテーマ（例：「食い倒れの1日」「歴史散策」など）を簡潔に設定する。
3.  移動効率と体験の連続性を考慮する。
# 制約条件
- **絶対に指定されたJSON形式で出力してください。**
- JSON以外のテキストは一切含めないでください。
# 出力形式
{ "master_plan": [ { "day": 1, "area": "大阪駅・梅田周辺", "theme": "近代的な都市景観とショッピング" }, { "day": 2, "area": "難波・心斎橋エリア", "theme": "食い倒れとエンターテイメント" } ] }
`;

const createDayPlanSystemPrompt = `
# 命令
あなたは旅程作成のプロです。提供された「特定の日」の情報に基づき、具体的なタイムスケジュールをJSON形式で出力してください。
# 入力情報
- day, date, area, theme: その日の基本情報
- planConditions: 旅行全体の条件
- availableResources: そのエリアで利用可能な「食事」「宿泊」「アクティビティ」の選択肢
# あなたのタスク
1.  **選択と配置**: availableResourcesの中から、その日のテーマと予算に最もふさわしいものを複数選び、タイムスケジュールに賢く配置する。
2.  **現実的な時間配分**: 移動時間や滞在時間を考慮し、無理のないスケジュールを組む。
3.  **費用計算**: スケジュール内の各項目の概算料金を合計し、「total_cost」として円単位の数値で出力する。
4.  **人間味あふれる説明**: AI的ではなく、友人に語りかけるように、なぜそこがおすすめなのかを魅力的に記述する。
# 制約条件
- **絶対に指定されたJSON形式で出力してください。**
- **「total_cost」キーを必ず含めてください。**
# 出力形式
{ "day": 1, "date": "2025-08-20", "area": "大阪駅・梅田周辺", "theme": "近代的な都市景観とショッピング", "schedule": [ { "time": "14:00", "activity_name": "梅田スカイビル 空中庭園展望台", "description": "...", "price": "1500円", "url": "..." } ], "total_cost": 4500 }
`;



async function callLLMForAreas(body) {
  const userPrompt = `提供された情報: ${JSON.stringify(body)}`
  const chat = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: areaSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
  })
  const raw = chat?.choices?.[0]?.message?.content ?? ''
  let json
  try { json = JSON.parse(raw) }
  catch {
    const extracted = extractJsonFromString(raw)
    if (!extracted) throw new Error('AI応答のJSON抽出に失敗')
    json = JSON.parse(extracted)
  }
  const areas = json?.areas
  if (!isValidAreas(areas)) {
    throw new Error('AI応答の形式が不正（areas 配列が不正）')
  }
  return areas
}

// 任意のプロンプト用
const createApiHandler = (systemPrompt) => async (req, res) => {
  try {
    const userPrompt = `提供された情報: ${JSON.stringify(req.body)}`
    const chat = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
    })
    const raw = chat?.choices?.[0]?.message?.content ?? ''
    let out
    try { out = JSON.parse(raw) }
    catch {
      const extracted = extractJsonFromString(raw)
      if (!extracted) throw new Error('AI応答がJSONで返りませんでした')
      out = JSON.parse(extracted)
    }
    res.json(out)
  } catch (error) {
    const status = error?.status || error?.response?.status || 500
    const detail = error?.response?.data || null
    console.error('Backend Server Error:', error?.message, detail)
    res.status(status).json({ error: error?.message || 'Unknown server error', detail })
  }
}

// ─────────────────────────────────────────────
// 4) ルーティング（/api/get-areas はキャッシュ対応版）
// ─────────────────────────────────────────────
app.post('/api/get-areas', async (req, res) => {
  try {
    const { destination } = req.body || {}
    if (!destination || typeof destination !== 'string') {
      return res.status(400).json({ error: 'destination は必須です（string）' })
    }

    // A) キャッシュを毎回ディスクから読む → 手動編集も即反映
    const cacheObj = await readAreaCache()
    const hitKey = findCacheKey(cacheObj, destination)

    if (hitKey && cacheObj[hitKey]?.areas) {
      return res.json({
        areas: cacheObj[hitKey].areas,
        source: 'cache',
        cache_key: hitKey,
        updatedAt: cacheObj[hitKey].updatedAt || null,
      })
    }

    // B) 未キャッシュ → LLM で生成 → ディスクに保存
    const areas = await callLLMForAreas(req.body)
    const saveKey = String(destination).trim()
    const updated = {
      ...(cacheObj || {}),
      [saveKey]: { areas, updatedAt: new Date().toISOString() },
    }
    await writeAreaCache(updated)

    return res.json({
      areas,
      source: 'ai',
      cache_key: saveKey,
      updatedAt: updated[saveKey].updatedAt,
    })
  } catch (error) {
    const status = error?.status || error?.response?.status || 500
    const detail = error?.response?.data || null
    console.error('get-areas Error:', error?.message, detail)
    res.status(status).json({ error: error?.message || 'Unknown server error', detail })
  }
})

// 既存エンドポイントはそのまま
app.post('/api/find-dining', createApiHandler(diningSystemPrompt))
app.post('/api/find-accommodation', createApiHandler(accommodationSystemPrompt))
app.post('/api/find-activities', createApiHandler(activitySystemPrompt))
app.post('/api/create-master-plan', createApiHandler(createMasterPlanSystemPrompt))

app.post('/api/create-day-plans', async (req, res) => {
  const { days } = req.body
  if (!Array.isArray(days)) return res.status(400).json({ error: 'daysは配列である必要があります' })

  const createSingleDayPlan = async (dayData) => {
    const userPrompt = `提供された情報: ${JSON.stringify(dayData)}`
    const chat = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: createDayPlanSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
    })
    const raw = chat?.choices?.[0]?.message?.content ?? ''
    try { return JSON.parse(raw) }
    catch {
      const extracted = extractJsonFromString(raw)
      if (extracted) return JSON.parse(extracted)
      throw new Error('AIの応答JSONのパースに失敗')
    }
  }

  try {
    const settled = await Promise.allSettled(days.map(d => createSingleDayPlan(d)))
    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { ok: true, plan: r.value }
        : { ok: false, day: days[i]?.day, error: r.reason?.message }
    )
    res.json({ results })
  } catch (error) {
    res.status(500).json({ error: `複数日プラン作成中にエラー: ${error?.message}` })
  }
})

// ─────────────────────────────────────────────
// 5) 手動編集用の管理API（任意）
// フロントからも上書きできるようにしておくと便利
// ─────────────────────────────────────────────

// GET: 目的地のキャッシュ取得（生データ）
app.get('/api/areas', async (req, res) => {
  try {
    const { destination } = req.query
    const cache = await readAreaCache()
    if (!destination) return res.json(cache)
    const hit = findCacheKey(cache, String(destination))
    if (hit) return res.json({ key: hit, ...cache[hit] })
    return res.status(404).json({ error: 'not found' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT: upsert（手動編集・上書き）
app.put('/api/areas', async (req, res) => {
  try {
    const { destination, areas } = req.body || {}
    if (!destination || !isValidAreas(areas)) {
      return res.status(400).json({ error: 'destination と 正しい areas 配列が必要です' })
    }
    const cache = await readAreaCache()
    const saveKey = String(destination).trim()
    cache[saveKey] = { areas, updatedAt: new Date().toISOString() }
    await writeAreaCache(cache)
    res.json({ ok: true, key: saveKey })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE: 削除
app.delete('/api/areas', async (req, res) => {
  try {
    const { destination } = req.body || {}
    if (!destination) return res.status(400).json({ error: 'destination が必要です' })
    const cache = await readAreaCache()
    const hit = findCacheKey(cache, String(destination))
    if (!hit) return res.status(404).json({ error: 'not found' })
    delete cache[hit]
    await writeAreaCache(cache)
    res.json({ ok: true, deleted: hit })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────
// 6) 起動（開発は常に起動でOK）
// ─────────────────────────────────────────────
app
  .listen(port, () => {
    console.log('\x1b[32m%s\x1b[0m', `Backend server listening at http://localhost:${port}`)
    console.log('OPENAI key exists?', !!process.env.OPENAI_API_KEY)
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\x1b[31m%s\x1b[0m', `FATAL ERROR: Port ${port} is already in use.`)
    } else {
      console.error(err)
    }
    process.exit(1)
  })