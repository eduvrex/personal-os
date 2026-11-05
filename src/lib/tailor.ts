import "server-only";

import { anthropicClient, extractJson, heavyModel, textFrom } from "@/lib/ai";
import { updateApplication } from "@/lib/applications";
import { getResume } from "@/lib/resume";

/**
 * W5 — Tailor the stored CV to a pasted job description. Heavy model,
 * explicit paid action. TRUTHFULNESS IS THE INVARIANT: only content already
 * in the CV may appear — reordered, re-emphasized, reworded. Output lands on
 * the matching application as "Ready — review & send"; nothing is submitted.
 */

const SYSTEM_PROMPT = `You tailor Eduardo's CV to a specific job posting.

HARD RULES:
- Use ONLY facts present in his CV: real employers, titles, dates, degrees, skills, projects. NEVER invent, upgrade, or extrapolate experience, titles, credentials, or skills — not even plausibly-implied ones.
- NEVER include a GPA, class rank, transcript detail, or academic-standing information on the resume or in the cover letter — even if the CV or the posting mentions one. Omission is not misrepresentation; fabrication or inflation would be.
- Lead with his strongest truthful material from the CV: quantitative/data skills, real work experience, research, and languages or work rights where relevant.
- You MAY reorder sections, select the most relevant items, re-emphasize, and reword truthfully in the language of the posting.
- The resume should be a complete, well-structured document (contact placeholder line if the CV lacks one, summary tailored to the role, experience, education, skills).
- The cover letter (when requested) is specific to the posting, grounded in real CV facts, warm and direct, under 350 words.

Return STRICT JSON: {"tailored_resume": string, "cover_letter": string | null}. Use \\n line breaks; section headings in ALL CAPS on their own line; bullet lines starting with "- ". No prose outside the JSON.`;

export interface TailorResult {
  tailored_resume: string;
  cover_letter: string | null;
}

export async function tailorResume(input: {
  jobDescription: string;
  applicationId?: string | null;
  includeCoverLetter?: boolean;
}): Promise<TailorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Tailoring needs ANTHROPIC_API_KEY.");

  const resume = await getResume();
  if (!resume.full_text?.trim()) {
    throw new Error("No CV on file — paste your CV in the Me tab first.");
  }

  // Explicit paid action; route maxDuration is 120s. No second paid retry.
  const client = anthropicClient({ timeoutMs: 110_000, maxRetries: 0 });
  const res = await client.messages.create({
    model: heavyModel(),
    max_tokens: 16_000, // thinking + a full resume + cover letter
    // Extended thinking: selecting/reordering real CV facts against a posting
    // benefits from a scratchpad; textFrom() drops thinking blocks.
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `MY CV (the only source of truth):\n${resume.full_text}\n\nJOB POSTING:\n${input.jobDescription}\n\n${
          input.includeCoverLetter
            ? "Produce the tailored resume AND a cover letter."
            : "Produce the tailored resume only; cover_letter must be null."
        }`,
      },
    ],
  });

  const json = extractJson(textFrom(res)) as {
    tailored_resume?: unknown;
    cover_letter?: unknown;
  } | null;
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Couldn't parse the tailoring response — try again.");
  }
  const parsed: TailorResult = {
    tailored_resume: String(json.tailored_resume ?? ""),
    cover_letter: json.cover_letter ? String(json.cover_letter) : null,
  };
  if (!parsed.tailored_resume.trim()) {
    throw new Error("Tailoring returned an empty resume — try again.");
  }

  if (input.applicationId) {
    await updateApplication(input.applicationId, {
      tailored_resume: parsed.tailored_resume,
      ...(parsed.cover_letter ? { cover_letter: parsed.cover_letter } : {}),
    });
  }

  return parsed;
}
