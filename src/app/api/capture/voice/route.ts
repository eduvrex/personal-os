import { NextResponse, type NextRequest } from "next/server";

import { runCapture } from "@/lib/capture";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { transcribeAudio } from "@/lib/transcribe";

/** ~25MB is Whisper's cap; hold-to-talk clips are far smaller. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Voice capture from the web capture bar: transcribe, then route as usual. */
export async function POST(request: NextRequest) {
  const limit = rateLimit("capture-voice", 10, 60_000);
  if (!limit.ok) {
    const { body: b, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(b, init);
  }

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "No audio received." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json({ error: "Recording too large." }, { status: 413 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const filename =
      (audio instanceof File && audio.name) || "capture.webm";
    const text = (await transcribeAudio(buffer, filename)).trim();
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't hear anything in that recording." },
        { status: 422 },
      );
    }

    const result = await runCapture({
      text: text.length > 4000 ? `${text.slice(0, 4000)}…` : text,
      source: "web-voice",
    });
    return NextResponse.json({ ...result, text }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
