import { NextResponse, type NextRequest } from "next/server";

import { getProfile, updateProfile } from "@/lib/profile";
import {
  asObject,
  keyDateArray,
  optDateKey,
  optStr,
  strArray,
  ValidationError,
} from "@/lib/validate";

export async function GET() {
  try {
    return NextResponse.json(await getProfile());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let patch: Record<string, unknown>;
  try {
    const body = asObject(await request.json().catch(() => null));
    patch = {};
    if ("current_city" in body) patch.current_city = optStr(body.current_city, "current_city", 200);
    if ("target_city" in body) patch.target_city = optStr(body.target_city, "target_city", 200);
    if ("target_date" in body) patch.target_date = optDateKey(body.target_date, "target_date");
    if ("occupation" in body) patch.occupation = optStr(body.occupation, "occupation", 300);
    if ("studies" in body) patch.studies = optStr(body.studies, "studies", 300);
    if ("residency_status" in body) patch.residency_status = optStr(body.residency_status, "residency_status", 500);
    if ("about" in body) patch.about = optStr(body.about, "about", 5000);
    if ("languages" in body) patch.languages = strArray(body.languages, "languages", 20, 50);
    if ("key_dates" in body) patch.key_dates = keyDateArray(body.key_dates, "key_dates");
    if ("facts" in body) {
      const facts = body.facts;
      if (facts != null && (typeof facts !== "object" || Array.isArray(facts))) {
        throw new ValidationError("facts must be an object.");
      }
      if (JSON.stringify(facts ?? {}).length > 5000) {
        throw new ValidationError("facts is too large.");
      }
      patch.facts = facts ?? {};
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await updateProfile(patch));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
