// server/services/llm.js
import { ExcelLogger } from '../excelLogger.js';

function extractJsonFromString(text = '') {
  const s = text.indexOf('{');
  if (s === -1) return null;
  const e = text.lastIndexOf('}');
  if (e === -1 || e < s) return null;
  return text.substring(s, e + 1);
}

export function createLLMHandler(openai, systemPrompt, agent, model, opts = {}) {
  const rawMode = !!opts.raw;

  const handler = async (req, res) => {
    try {
      const json = await __call({ body: req.body, planId: req.body?.planId });
      res.json(json);
    } catch (error) {
      const status = error?.status || error?.response?.status || 500;
      const detail = error?.response?.data || null;
      console.error(`${agent || 'api'} Error:`, error?.message, detail);
      res.status(status).json({ error: error?.message || 'Unknown server error', detail });
    }
  };

  async function __call({ body, planId }) {
    const filtered = { ...(body || {}) };
    delete filtered.planId;

    const userPrompt = `提供された情報: ${JSON.stringify(filtered)}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    if (planId) {
      try {
        const logger = new ExcelLogger(planId);
        await logger.log('llm_input', { agent: agent || 'unknown', model, system_prompt: systemPrompt, user_prompt: userPrompt, variables_json: filtered });
      } catch {}
    }

    const chat = await openai.chat.completions.create({
      messages, model, response_format: { type: 'json_object' },
    });

    const raw = chat?.choices?.[0]?.message?.content ?? '';
    let json;
    try { json = JSON.parse(raw); }
    catch {
      const extracted = extractJsonFromString(raw);
      if (!extracted) throw new Error('AI応答がJSONで返りませんでした');
      json = JSON.parse(extracted);
    }

    if (planId) {
      try {
        const logger = new ExcelLogger(planId);
        await logger.log('llm_output', { agent: agent || 'unknown', model, raw_text: raw, parsed_json: json, usage: chat?.usage ?? null, finish_reason: chat?.choices?.[0]?.finish_reason ?? null });
      } catch {}
    }

    return json;
  }

  handler.__call = __call;
  return handler;
}
