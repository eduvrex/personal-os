import { expect, test } from "@playwright/test";

import { envLocal } from "./env";

const H = { "x-api-secret": envLocal("AUTH_SECRET") };

test.describe("applications pipeline (API)", () => {
  test("create → move through statuses → delete-equivalent", async ({ request }) => {
    // Create.
    const created = await request.post("/api/applications", {
      headers: H,
      data: { title: "__e2e_app__", org: "Test Org", kind: "job" },
    });
    expect(created.status()).toBe(201);
    const app = await created.json();
    expect(app.status).toBe("researching");

    // Move through the pipeline.
    for (const status of ["applying", "applied", "interview", "decision"]) {
      const res = await request.patch(`/api/applications/${app.id}`, {
        headers: H,
        data: { status },
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).status).toBe(status);
    }

    // Invalid status is ignored, not applied.
    const bad = await request.patch(`/api/applications/${app.id}`, {
      headers: H,
      data: { status: "hacked" },
    });
    expect((await bad.json()).status).toBe("decision");

    // Cleanup: the app intentionally has no DELETE route for applications, so
    // remove the test row directly via Supabase REST (service role).
    const supaUrl = envLocal("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = envLocal("SUPABASE_SERVICE_ROLE_KEY");
    const del = await request.delete(
      `${supaUrl}/rest/v1/applications?id=eq.${app.id}&user_id=eq.eduardo`,
      { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
    );
    expect(del.status()).toBe(204);
  });
});

test.describe("calendar event CRUD (API)", () => {
  test("create → appears in range feed → update → delete", async ({ request }) => {
    const created = await request.post("/api/calendar/events", {
      headers: H,
      data: {
        title: "__e2e_event__",
        category: "General",
        start: "2026-08-15",
        all_day: true,
        notes: "from the e2e suite",
      },
    });
    expect(created.status()).toBe(201);
    const event = await created.json();
    expect(event.editable).toBe(true);

    const feed = await request.get("/api/calendar?from=2026-08-01&to=2026-08-31", {
      headers: H,
    });
    const { events } = await feed.json();
    expect(events.some((e: { id: string }) => e.id === event.id)).toBe(true);

    const patched = await request.patch(`/api/calendar/events/${event.id}`, {
      headers: H,
      data: { title: "__e2e_event_renamed__" },
    });
    expect((await patched.json()).title).toBe("__e2e_event_renamed__");

    // Bad color rejected.
    const bad = await request.patch(`/api/calendar/events/${event.id}`, {
      headers: H,
      data: { color: "purple" },
    });
    expect(bad.status()).toBe(400);

    const del = await request.delete(`/api/calendar/events/${event.id}`, { headers: H });
    expect(del.status()).toBe(204);

    // Gone from the feed.
    const after = await request.get("/api/calendar?from=2026-08-01&to=2026-08-31", {
      headers: H,
    });
    const { events: remaining } = await after.json();
    expect(remaining.some((e: { id: string }) => e.id === event.id)).toBe(false);
  });
});
