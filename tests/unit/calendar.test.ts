import { describe, expect, it } from "vitest";

import { expandIcs } from "@/lib/calendar";
import { shiftDateKey } from "@/lib/localDate";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:single-1
DTSTART:20260706T150000Z
DTEND:20260706T160000Z
SUMMARY:Dentist appointment
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
DTSTART:20260701T090000Z
DTEND:20260701T093000Z
RRULE:FREQ=WEEKLY;BYDAY=WE
SUMMARY:Weekly standup
END:VEVENT
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260710
SUMMARY:All-day thing
END:VEVENT
BEGIN:VEVENT
UID:outside-1
DTSTART:20270101T100000Z
SUMMARY:Far future
END:VEVENT
END:VCALENDAR`;

const start = Date.parse("2026-07-01T00:00:00Z");
const end = Date.parse("2026-07-28T23:59:59Z");

describe("expandIcs", () => {
  it("includes single events inside the window and excludes ones outside", () => {
    const events = expandIcs(ICS, start, end);
    const titles = events.map((e) => e.title);
    expect(titles).toContain("Dentist appointment");
    expect(titles).not.toContain("Far future");
  });

  it("expands weekly recurring events across the 4-week window", () => {
    const events = expandIcs(ICS, start, end);
    const standups = events.filter((e) => e.title === "Weekly standup");
    // Wednesdays Jul 1, 8, 15, 22 2026 (Jul 1 2026 is a Wednesday)
    expect(standups.length).toBe(4);
    expect(new Set(standups.map((e) => e.id)).size).toBe(4); // unique per occurrence
  });

  it("marks all-day events and keys them by date", () => {
    const events = expandIcs(ICS, start, end);
    const allday = events.find((e) => e.title === "All-day thing");
    expect(allday?.allDay).toBe(true);
    expect(allday?.start).toBe("2026-07-10");
  });

  it("tags everything as the read-only Google Calendar category", () => {
    for (const e of expandIcs(ICS, start, end)) {
      expect(e.category).toBe("Google Calendar");
      expect(e.editable).toBe(false);
      expect(e.source).toBe("gcal");
    }
  });

  it("returns [] on malformed input instead of throwing", () => {
    expect(expandIcs("not an ics feed", start, end)).toEqual([]);
  });
});

describe("shiftDateKey — all-day inclusive/exclusive end conversion", () => {
  it("shifts across month and year boundaries", () => {
    expect(shiftDateKey("2026-07-31", 1)).toBe("2026-08-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("round-trips: inclusive +1 (save) then -1 (populate) is identity", () => {
    const inclusive = "2026-07-08";
    expect(shiftDateKey(shiftDateKey(inclusive, 1), -1)).toBe(inclusive);
  });

  it("a 2-day drawer selection stores an exclusive end one day later", () => {
    // User picks Jul 7 → Jul 8 inclusive; FullCalendar needs end = Jul 9.
    expect(shiftDateKey("2026-07-08", 1)).toBe("2026-07-09");
  });

  it("tolerates a full ISO string by using the leading date key", () => {
    expect(shiftDateKey("2026-07-08T00:00:00Z", 1)).toBe("2026-07-09");
  });
});
