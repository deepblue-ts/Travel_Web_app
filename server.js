// server.js

import express from 'express';
import OpenAI from 'openai';
import 'dotenv/config';

console.log("Reading OPENAI_API_KEY from .env file...");
// 重要：以下の行でAPIキーの一部が表示されます。第三者には見せないでください。
// 'sk-...' のように表示されればOK、'undefined' と表示されたらNGです。
console.log("Loaded API Key starts with:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 6) : 'undefined');


const app = express();
const port = 3001;
app.use(express.json());

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 5 * 1000, // 30秒
 });
if (!process.env.OPENAI_API_KEY) {
  console.error("\x1b[31m%s\x1b[0m", "FATAL ERROR: OPENAI_API_KEY is not defined.");
  process.exit(1);
}

// 共通リクエストハンドラ
const createApiHandler = (systemPrompt) => async (req, res) => {
  try {
    const planData = req.body;
    // ユーザーからの情報はシンプルにJSON文字列で渡す
    const userPrompt = `旅行の条件: ${JSON.stringify(planData)}`;

    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'gpt-4o-mini', 
      response_format: { type: "json_object" },
    });

    const llmResponseContent = chatCompletion.choices[0].message.content;
    console.log("\x1b[36m%s\x1b[0m", "--- LLM Raw Response (from createApiHandler) ---"); // 色付きで出力
    console.log(llmResponseContent);
    console.log("\x1b[36m%s\x1b[0m", "------------------------------------------------");

    const jsonResponse = JSON.parse(chatCompletion.choices[0].message.content);
    res.status(200).json(jsonResponse);

  } catch (error) {
    console.error("Backend Server Error:", error.message);
    res.status(500).json({ error: "AIによる処理中にサーバー側でエラーが発生しました。" });
  }
};

// --- 各専門エージェントのプロンプトを強化 ---

const diningSystemPrompt = `あなたは食事の専門家です。提示された旅行条件に基づき、おすすめのレストランを3つ提案してください。**各レストランについて、具体的な「概算料金（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"restaurants": [{"name": "店名", "type": "ジャンル", "price": "1,000円〜2,000円", "url": "https://example.com"}]}`;
app.post('/api/find-dining', createApiHandler(diningSystemPrompt));

const accommodationSystemPrompt = `あなたは宿泊施設の専門家です。提示された旅行条件に基づき、おすすめのホテルや旅館を2つ提案してください。**各施設について、具体的な「一泊あたりの概算料金（price）」と「公式サイトや予約サイトのURL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"hotels": [{"name": "施設名", "type": "種別", "price": "15,000円〜", "url": "https://example.com"}]}`;
app.post('/api/find-accommodation', createApiHandler(accommodationSystemPrompt));

const activitySystemPrompt = `あなたは観光アクティビティの専門家です。提示された旅行条件に基づき、おすすめのアクティビティを3つ提案してください。**各アクティビティについて、具体的な「入場料や参加費（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"activities": [{"name": "アクティビティ名", "type": "種別", "price": "無料", "url": "https://example.com"}]}`;
app.post('/api/find-activities', createApiHandler(activitySystemPrompt));

// ★★★ 1日プラン作成専門エージェント ★★★
const dayPlanSystemPrompt = `
あなたは、旅慣れた親しみやすいカリスマツアーコンダクターです。
あなたの仕事は、指定された「特定の日」の、具体的で実行可能なタイムスケジュールを作成することです。

# 入力情報
- **day**: 何日目のプランを作成するか (例: 2)
- **planConditions**: 旅行全体の条件 (目的地、予算など)
- **availableResources**: この旅で利用可能な「食事」「宿泊」「アクティビティ」の選択肢リスト
- **previousItinerary**: (もしあれば)前日までの旅程。これを参考に、移動の連続性を考慮してください。

# あなたのタスク
1.  **選択と配置**: availableResourcesの中から、指定された日のプランに最もふさわしいものを、予算と移動効率を考慮して選び、タイムスケジュールに配置する。
2.  **人間味あふれる説明**: AI的ではなく、友人に語りかけるように、なぜその場所や行動がおすすめなのかを魅力的に記述する。
3.  **厳密なJSON出力**: 必ず以下のJSON形式で、その日のプランのみを出力する。

{
  "day": 2,
  "theme": "2日目のテーマ（例：歴史とグルメに浸る一日）",
  "schedule": [
    { "time": "10:00", "activity_name": "大阪城 天守閣見学", "description": "...", "price": "600円", "url": "..." },
    { "time": "12:30", "activity_name": "昼食：〇〇", "description": "...", "price": "約1,500円", "url": "..." }
  ]
}
`;
app.post('/api/create-day-plan', createApiHandler(dayPlanSystemPrompt));


app.listen(port, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `Backend server listening at http://localhost:${port}`);
});


// ★★★ エリア候補取得エージェント ★★★
const areaSystemPrompt = `あなたは日本の地理と観光に精通した旅行プランナーです。ユーザーから提示された目的地（都道府県や市など）に基づき、観光客に人気のある代表的なエリアや地域を最大5つ提案してください。JSON以外の文字列は不要。出力は必ず以下のJSON形式にしてください: {"areas": ["エリア名1", "エリア名2", "エリア名3"]}`;

app.post('/api/get-areas', async (req, res) => {
  try {
    // フロントからは { destination: "京都" } のような形式で送信されることを想定
    const { destination } = req.body;
    if (!destination) {
      return res.status(400).json({ error: "目的地が指定されていません。" });
    }

    // ユーザーからの入力として、目的地の文字列をそのまま渡す
    const userPrompt = destination;

    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: areaSystemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'gpt-4o-mini',
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(chatCompletion.choices[0].message.content);
    res.status(200).json(jsonResponse);

  } catch (error) {
    console.error("Backend Server Error (get-areas):", error.message);
    res.status(500).json({ error: "AIによるエリア候補の取得中にエラーが発生しました。" });
  }
});