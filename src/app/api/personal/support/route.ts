import { NextResponse, type NextRequest } from "next/server";

import { anthropicClient, lightModel, textFrom } from "@/lib/ai";
import { rateLimit, tooMany } from "@/lib/rateLimit";

const SYSTEM_PROMPT =
  "You are a warm, grounded supportive companion for Eduardo. Listen, validate honestly, and help him think clearly and take care of himself. Encourage healthy coping and leaning on real people. Do NOT dwell on or analyze his ex, and do not reinforce rumination or negative self-talk. Keep him oriented toward his own growth and wellbeing. If he ever expresses serious distress or thoughts of self-harm, gently and clearly encourage him to reach out to someone he trusts or a professional, and that support is available.";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const limit = rateLimit("support", 10, 60_000);
  if (!limit.ok) {
    const { body: b, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(b, init);
  }
  const body = await request.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Keep it under 4000 characters." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Support needs ANTHROPIC_API_KEY to be configured." },
      { status: 503 },
    );
  }

  try {
    const client = anthropicClient({ timeoutMs: 45_000 });
    const res = await client.messages.create({
      model: lightModel(),
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    return NextResponse.json({ reply: textFrom(res) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
