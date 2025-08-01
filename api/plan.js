// api/plan.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { origin, destination, dates, transport, budget } = req.body;

  // 必要に応じてプロンプト整形
  const prompt = `出発地: ${origin}\n目的地: ${destination}\n日程: ${dates.start}〜${dates.end}\n主な移動手段: ${transport}\n予算: ${budget}円\nこれでおすすめの旅行プランを1日ごとに教えて。`;

  const apiKey = process.env.OPENAI_API_KEY; // .env等でAPIキー管理
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o", // 任意のモデル
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });
  const data = await response.json();
  res.status(200).json({ result: data.choices?.[0]?.message?.content || "生成に失敗しました" });
}
