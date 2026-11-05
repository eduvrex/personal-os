import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID } from "@/lib/db";
import { textToDocx } from "@/lib/docx";
import { isUuid } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

/** Download a saved tailored resume / cover letter as .docx. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const doc = request.nextUrl.searchParams.get("doc") === "cover" ? "cover" : "resume";

  const { data, error } = await db()
    .from("applications")
    .select("org,title,tailored_resume,cover_letter")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const text = doc === "cover" ? data.cover_letter : data.tailored_resume;
  if (!text) {
    return NextResponse.json(
      { error: `No ${doc === "cover" ? "cover letter" : "tailored resume"} saved yet — generate one first.` },
      { status: 404 },
    );
  }

  const buffer = await textToDocx(String(text));
  const slug = [data.org, data.title, doc === "cover" ? "cover-letter" : "resume"]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${slug || "document"}.docx"`,
    },
  });
}
