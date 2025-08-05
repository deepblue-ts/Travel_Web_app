import express from 'express';
import OpenAI from 'openai';
import 'dotenv/config';

console.log("Reading OPENAI_API_KEY from .env file...");
console.log("Loaded API Key starts with:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 6) : 'undefined');

const app = express();
const port = 3001;
app.use(express.json({ limit: '50mb' }));

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60 * 1000, 
});

if (!process.env.OPENAI_API_KEY) {
  console.error("\x1b[31m%s\x1b[0m", "FATAL ERROR: OPENAI_API_KEY is not defined.");
  process.exit(1);
}

// --- シンプルAPI用の共通ハンドラ ---
const createSimpleApiHandler = (systemPrompt) => async (req, res) => {
  try {
    const userInput = req.body;
    const userPrompt = JSON.stringify(userInput);

    console.log(`\x1b[33m[Request to Simple Handler]\x1b[0m Body:`, userInput);

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
    console.error("Backend Server Error (Simple Handler):", error.message);
    res.status(500).json({ error: `AI処理中にサーバーエラーが発生しました: ${error.message}` });
  }
};

// --- 各専門エージェントのプロンプト ---
const diningSystemPrompt = `あなたは食事の専門家です。提示された旅行条件に基づき、おすすめのレストランを3つ提案してください。**各レストランについて、具体的な「概算料金（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"restaurants": [{"name": "店名", "type": "ジャンル", "price": "1,000円〜2,000円", "url": "https://example.com"}]}`;
const accommodationSystemPrompt = `あなたは宿泊施設の専門家です。提示された旅行条件に基づき、おすすめのホテルや旅館を2つ提案してください。**各施設について、具体的な「一泊あたりの概算料金（price）」と「公式サイトや予約サイトのURL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"hotels": [{"name": "施設名", "type": "種別", "price": "15,000円〜", "url": "https://example.com"}]}`;
const activitySystemPrompt = `あなたは観光アクティビティの専門家です。提示された旅行条件に基づき、おすすめのアクティビティを3つ提案してください。**各アクティビティについて、具体的な「入場料や参加費（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"activities": [{"name": "アクティビティ名", "type": "種別", "price": "無料", "url": "https://example.com"}]}`;
const areaSystemPrompt = `
あなたは日本の地理と観光に非常に精通した、正確性を最重視する地理情報のエキスパートです。
# あなたのタスク
ユーザーから提示された目的地（例：{"destination":"奈良"}）に基づき、観光客に人気のある代表的なエリアや地域を最大5つ提案してください。
# 厳守すべきルール
1.  **地理的関連性の徹底**: 提案するエリアは、必ずユーザーが提示した目的地 **の内部にある地域** に限定してください。
2.  **無関係なエリアの排除**: 絶対に、提示された目的地と地理的に全く関係のない都道府県や市のエリアを含めないでください。
    - **悪い例**: ユーザーの目的地が「奈良県」の時に、「名古屋市」や「長崎市」、「沖縄県」のエリアを提案すること。これらは地理的に完全に無関係です。
    - **良い例**: ユーザーの目的地が「奈良県」の時に、「奈良市（奈良公園周辺）」「明日香村」「吉野山」などを提案すること。
# 出力形式
- 各エリアについて、その特徴を表す代表的な観光スポットを2〜3つ挙げてください。
- JSON以外の文字列は一切含めず、必ず以下のJSON形式で出力してください: 
{
  "areas": [
    {
      "name": "エリア名1",
      "spots": ["代表的な観光スポットA", "代表的な観光スポットB"]
    }
  ]
}
`;

// --- APIエンドポイントの定義 ---
app.post('/api/find-dining', createSimpleApiHandler(diningSystemPrompt));
app.post('/api/find-accommodation', createSimpleApiHandler(accommodationSystemPrompt));
app.post('/api/find-activities', createSimpleApiHandler(activitySystemPrompt));
app.post('/api/get-areas', createSimpleApiHandler(areaSystemPrompt));

// --- 1日プラン作成のための専用ハンドラ ---
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

app.post('/api/create-day-plan', async (req, res) => {
  try {
    const dayPlanRequest = req.body;
    console.log(`\x1b[36m[Request to Day-Plan Handler]\x1b[0m Body size: ~${Math.round(JSON.stringify(dayPlanRequest).length / 1024)} KB`);
    const userPrompt = JSON.stringify(dayPlanRequest);

    // ★★★ ここが改善の核心部分 ★★★
    const chatCompletion = await openai.chat.completions.create(
      // 第1引数: APIへのリクエスト内容
      {
        messages: [
          { role: 'system', content: dayPlanSystemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'gpt-4o-mini',
        response_format: { type: "json_object" },
      },
      // 第2引数: リクエストオプション
      {
        // ここにタイムアウト設定を記述するのが正しい
        timeout: 120 * 1000, 
      }
    );
    // ★★★ ここまで ★★★

    const llmResponseContent = chatCompletion.choices[0].message.content;
    const jsonResponse = JSON.parse(llmResponseContent);
    res.status(200).json(jsonResponse);

  } catch (error) {
    console.error("\x1b[31mBackend Server Error (Day-Plan Handler):\x1b[0m", error);
    res.status(500).json({ error: `AIによるプラン作成中にサーバーエラーが発生しました: ${error.message}` });
  }
});


app.listen(port, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `Backend server listening at http://localhost:${port}`);
});