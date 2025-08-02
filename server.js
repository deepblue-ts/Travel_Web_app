// server.js

import express from 'express';
import OpenAI from 'openai';
import 'dotenv/config'; // .env.local を読み込むために必要

const app = express();
const port = 3001; // フロントエンド(5173)とは別のポート番号

// JSONリクエストボディをパースするために必要
app.use(express.json());

// OpenAIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// APIキーの存在チェック
if (!process.env.OPENAI_API_KEY) {
  console.error("\x1b[31m%s\x1b[0m", "FATAL ERROR: OPENAI_API_KEY is not defined in .env or .env.local");
  process.exit(1); // サーバーを停止
}

// POST /generate-plan というエンドポイントを作成
app.post('/generate-plan', async (req, res) => {
  try {
    const planData = req.body;
    const systemPrompt = `あなたはプロの旅行プランナーです。読んだ人がワクワクするような、具体的で魅力的な旅行プランを作成してください。各日のタイムスケジュール、観光スポットの紹介、食事のおすすめ、移動手段などを詳細に記述してください。特に、なぜその場所や食事がおすすめなのか、その魅力を伝えてください。出力はMarkdown形式で、見出しやリストを効果的に使って見やすくしてください。`;
    const userPrompt = `
      以下の条件で旅行プランを作成してください。
      # 旅行の条件
      - 出発地: ${planData.origin || '指定なし'}
      - 目的地: ${planData.destination}
      - 訪れたいエリア: ${planData.areas.join("、") || 'おまかせ'}
      - 旅行期間: ${planData.dates.start ? `${planData.dates.start} から ${planData.dates.end} まで` : '指定なし'}
      - 予算（1人あたり）: ${planData.budget.toLocaleString()}円
      - 主な交通手段: ${planData.transport}
    `;

    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'gpt-4o-mini',
    });

    const planText = chatCompletion.choices[0].message.content;
    res.status(200).json({ plan: planText });

  } catch (error) {
    console.error("Backend Server Error:", error);
    res.status(500).json({ error: "AIによるプランの生成中にサーバー側でエラーが発生しました。" });
  }
});

app.listen(port, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `Backend server listening at http://localhost:${port}`);
});