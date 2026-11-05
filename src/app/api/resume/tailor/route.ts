import { NextResponse, type NextRequest } from "next/server";

import { rateLimit, tooMany } from "@/lib/rateLimit";
import { tailorResume } from "@/lib/tailor";
import { asObject, isUuid, reqStr, ValidationError } from "@/lib/validate";

export const maxDuration = 120;

/** Tailor the stored CV to a pasted job description. Paid, occasional. */
export async function POST(request: NextRequest) {
  const limit = rateLimit("tailor", 3, 10 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }

  let jd: string;
  let applicationId: string | null;
  let includeCoverLetter: boolean;
  try {
    const body = asObject(await request.json().catch(() => null));
    jd = reqStr(body.jobDescription, "jobDescription", 15_000);
    applicationId =
      typeof body.applicationId === "string" && isUuid(body.applicationId)
        ? body.applicationId
        : null;
    includeCoverLetter = body.includeCoverLetter === true;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const result = await tailorResume({
      jobDescription: jd,
      applicationId,
      includeCoverLetter,
    });
    return NextResponse.json({ ...result, applicationId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
