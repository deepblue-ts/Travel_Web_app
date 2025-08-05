// server.js

import express from 'express';
import OpenAI from 'openai';
import 'dotenv/config';

const app = express();
const port = 3001;
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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