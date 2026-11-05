import "server-only";

import { openaiClient, toFile } from "@/lib/ai";

/**
 * Transcribe an audio buffer (a Telegram voice note) with OpenAI Whisper.
 * Throws if OPENAI_API_KEY is unset — voice capture needs it.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  // Voice notes upload audio; give the call room but bound it well under the
  // webhook function's lifetime.
  const client = openaiClient({ timeoutMs: 120_000 });
  if (!client) {
    throw new Error("OPENAI_API_KEY is not set — cannot transcribe voice notes.");
  }
  const file = await toFile(buffer, filename);
  const res = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return res.text;
}
