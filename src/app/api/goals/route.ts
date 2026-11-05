import { NextResponse, type NextRequest } from "next/server";

import { getGoals, setGoals, type GoalScope } from "@/lib/goals";

export async function GET() {
  try {
    return NextResponse.json(await getGoals());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const scope = body?.scope as GoalScope;
  if (scope !== "week" && scope !== "semester") {
    return NextResponse.json(
      { error: "scope must be 'week' or 'semester'." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body?.items)) {
    return NextResponse.json({ error: "items must be an array." }, { status: 400 });
  }
  if (body.items.length > 100) {
    return NextResponse.json({ error: "items is capped at 100." }, { status: 400 });
  }
  try {
    return NextResponse.json(await setGoals(scope, body.items));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
