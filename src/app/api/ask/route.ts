import { NextResponse, type NextRequest } from "next/server";

import { anthropicClient, lightModel, textFrom } from "@/lib/ai";
import { searchMemory } from "@/lib/memory";
import { fullKnowledgeContext } from "@/lib/knowledgeBase";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { asObject, reqStr, ValidationError } from "@/lib/validate";
import type { AskResponseDTO, AskSourceDTO } from "@/lib/types";

const SYSTEM_PROMPT =
  "You are Eduardo's Personal OS assistant, answering his own private questions. Answer using the provided knowledge base and memory context. Cite memory sources by their [label] in brackets; the knowledge base is background about him and needs no citation. Some knowledge is marked PRIVATE (advisor-only): you may use it to help him directly here, but NEVER reproduce its specifics in anything meant to be public, shared, or put in a résumé/CV, and give no medical or dosing advice. If you don't have enough context, say so.";

const NO_CONTEXT =
  "I don't have enough context to answer that yet. Capture more notes, tasks, or journal entries and ask again.";

export async function POST(request: NextRequest) {
  const limit = rateLimit("ask", 10, 60_000);
  if (!limit.ok) {
    const { body: b, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(b, init);
  }

  let question: string;
  try {
    const body = asObject(await request.json().catch(() => null));
    question = reqStr(body.question, "question", 2000);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const [hits, knowledge] = await Promise.all([
      searchMemory(question, 6),
      fullKnowledgeContext(),
    ]);

    const sources: AskSourceDTO[] = hits.map((h) => ({
      label: h.sourceLabel,
      sourceType: h.sourceType,
      sourceId: h.sourceId,
      text: h.text,
    }));

    // Nothing to ground on at all (no memories AND no knowledge) → say so.
    if (hits.length === 0 && !knowledge) {
      return NextResponse.json({ answer: NO_CONTEXT, sources: [] } satisfies AskResponseDTO);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Ask needs ANTHROPIC_API_KEY to be configured." },
        { status: 503 },
      );
    }

    const memoryContext = hits.map((h) => `[${h.sourceLabel}] ${h.text}`).join("\n\n");
    const context = [knowledge, memoryContext].filter(Boolean).join("\n\n---\n\n");

    const client = anthropicClient({ timeoutMs: 45_000 });
    const res = await client.messages.create({
      model: lightModel(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer = textFrom(res);

    return NextResponse.json({
      answer: answer || NO_CONTEXT,
      sources,
    } satisfies AskResponseDTO);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
