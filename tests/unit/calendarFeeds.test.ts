import { describe, expect, it } from "vitest";

import {
  normalizeFeedUrl,
  PROVIDER_COLORS,
  toFeedDTO,
} from "@/lib/calendarFeeds";
import { expandIcs } from "@/lib/calendar";
import { ValidationError } from "@/lib/validate";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:evt-1",
  "SUMMARY:Econometrics lecture",
  "DTSTART:20260722T150000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("normalizeFeedUrl", () => {
  it("accepts https and normalizes webcal (Outlook publish links)", () => {
    expect(normalizeFeedUrl("https://calendar.google.com/x/basic.ics")).toBe(
      "https://calendar.google.com/x/basic.ics",
    );
    expect(
      normalizeFeedUrl("webcal://outlook.office365.com/owa/calendar/x/calendar.ics"),
    ).toBe("https://outlook.office365.com/owa/calendar/x/calendar.ics");
  });

  it("rejects http, junk, and empty — capability URLs travel encrypted or not at all", () => {
    expect(() => normalizeFeedUrl("http://insecure.example/cal.ics")).toThrow(ValidationError);
    expect(() => normalizeFeedUrl("not a url")).toThrow(ValidationError);
    expect(() => normalizeFeedUrl("")).toThrow(ValidationError);
  });
});

describe("toFeedDTO", () => {
  it("never carries the URL, and falls back to the provider color", () => {
    const dto = toFeedDTO({
      id: "f1",
      name: "School",
      provider: "microsoft",
      url_encrypted: "v1:deadbeef",
      color: null,
      visible: true,
      last_synced_at: null,
      last_error: null,
    });
    expect(JSON.stringify(dto)).not.toContain("deadbeef");
    expect("url" in dto || "url_encrypted" in dto).toBe(false);
    expect(dto.color).toBe(PROVIDER_COLORS.microsoft);
  });

  it("coerces unknown providers to 'other'", () => {
    expect(toFeedDTO({ id: "x", name: "n", provider: "icloud" }).provider).toBe("other");
  });
});

describe("expandIcs with feed options", () => {
  it("stamps the feed's category, color, source, and id prefix", () => {
    const events = expandIcs(ICS, Date.parse("2026-07-22"), Date.parse("2026-07-23"), {
      category: "School calendar",
      color: "#7f93a8",
      source: "feed:microsoft",
      idPrefix: "feed:f1",
    });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("School calendar");
    expect(events[0].color).toBe("#7f93a8");
    expect(events[0].source).toBe("feed:microsoft");
    expect(events[0].id.startsWith("feed:f1:evt-1")).toBe(true);
  });

  it("keeps the legacy gcal defaults when no options are passed", () => {
    const events = expandIcs(ICS, Date.parse("2026-07-22"), Date.parse("2026-07-23"));
    expect(events[0].category).toBe("Google Calendar");
    expect(events[0].source).toBe("gcal");
  });
});
