import Anthropic from '@anthropic-ai/sdk';
import { templateAnalysis } from '@/lib/aiFallback';

export const runtime = 'nodejs';

// =============================================================================
// POST /api/analyze — AI performance review
// -----------------------------------------------------------------------------
// Receives the already-computed analytics (KPIs, menu classifications, top waste,
// advisor findings) and returns a short plain-English review:
//   { headline, goingWell[], biggestProblem, actions[3], source, model }
//
// Uses the Anthropic API (model from LLM_MODEL, default claude-opus-4-8) with the
// server-only LLM_API_KEY. If the key is missing OR the call fails, it falls back
// to a fluent templated summary built from the SAME numbers — so the feature
// always works. The key is read server-side only and never sent to the browser.
// =============================================================================

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description: 'One warm, plain-English sentence summarising the month.',
    },
    goingWell: {
      type: 'array',
      description: '2-3 short bullet points on what is going well.',
      items: { type: 'string' },
    },
    biggestProblem: {
      type: 'string',
      description: 'One short paragraph naming the single biggest problem.',
    },
    actions: {
      type: 'array',
      description: 'Exactly 3 concrete actions to take this week.',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'goingWell', 'biggestProblem', 'actions'],
  additionalProperties: false,
};

function buildPrompt(p) {
  return [
    `Here are this café's numbers for the last ~30 days. Currency: ${p.currency || "so'm"}.`,
    '',
    `Revenue: ${p.revenue}`,
    `Profit margin: ${p.grossMarginPct}%`,
    `Gross profit kept: ${p.totalGrossProfit}`,
    `Waste ratio: ${p.wasteRatioPct}% (target ${p.targetWastePct}%), total waste cost ${p.totalWasteCost}`,
    `Items sold: ${p.unitsSold}`,
    `Menu mix — Stars: ${p.categories?.Star || 0}, Plowhorses: ${p.categories?.Plowhorse || 0}, Puzzles: ${p.categories?.Puzzle || 0}, Dogs: ${p.categories?.Dog || 0}`,
    '',
    'Top dishes by revenue:',
    ...(p.topDishesByRevenue || []).map(
      (d) =>
        `- ${d.name} (${d.category}): ${d.unitsSold} sold, ${d.marginPct}% margin, ${d.grossProfit}/plate profit, ${d.sharePct}% of sales`
    ),
    '',
    'Biggest waste by ingredient:',
    ...(p.topWaste || []).map((w) => `- ${w.name}: ${w.cost} (${w.sharePct}% of waste)`),
    '',
    'Rule-based advisor already flagged:',
    ...(p.advisor || []).slice(0, 6).map((a) => `- [${a.severity}] ${a.message}`),
    '',
    'Write a short performance review for the owner (who is NOT technical): a warm one-line headline, 2-3 things going well, the SINGLE biggest problem, and exactly 3 concrete actions for THIS week. Plain English, no jargon, specific to these numbers.',
  ].join('\n');
}

export async function POST(req) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object') {
    return Response.json({ error: 'Missing analytics payload.' }, { status: 400 });
  }

  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'claude-opus-4-8';

  // No key → templated fallback.
  if (!apiKey) {
    return Response.json({
      ...templateAnalysis(payload),
      source: 'template',
      model: null,
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system:
        'You are a friendly restaurant-performance analyst writing for a non-technical café owner. Be concrete, warm and plain-spoken. No jargon, no markdown. Base everything strictly on the numbers given.',
      messages: [{ role: 'user', content: buildPrompt(payload) }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    });

    const textBlock = (message.content || []).find((b) => b.type === 'text');
    const parsed = JSON.parse(textBlock.text);
    return Response.json({ ...parsed, source: 'ai', model });
  } catch (e) {
    // Any failure (bad key, rate limit, network, parse) → graceful fallback.
    return Response.json({
      ...templateAnalysis(payload),
      source: 'template',
      model: null,
      note: 'AI unavailable (' + (e?.message || 'error') + ') — showing a generated summary.',
    });
  }
}
