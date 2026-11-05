import { describe, expect, it } from "vitest";

import {
  friendlyHM,
  hmToMinutes,
  inReminderWindow,
  reminderText,
} from "@/lib/reminders";

describe("hmToMinutes", () => {
  it("parses HH:MM and HH:MM:SS (Postgres time), rejects junk", () => {
    expect(hmToMinutes("17:00")).toBe(1020);
    expect(hmToMinutes("17:00:00")).toBe(1020);
    expect(hmToMinutes("00:05")).toBe(5);
    expect(hmToMinutes("5pm")).toBeNull();
    expect(hmToMinutes(null)).toBeNull();
    expect(hmToMinutes("")).toBeNull();
  });
});

describe("inReminderWindow", () => {
  it("fires at the due minute and up to 5 minutes early (heads-up beats late)", () => {
    expect(inReminderWindow("17:00", "17:00")).toBe(true);
    expect(inReminderWindow("17:00", "16:55")).toBe(true);
    expect(inReminderWindow("17:00", "16:54")).toBe(false);
  });

  it("catches up to 45 minutes after a missed tick, then stops", () => {
    expect(inReminderWindow("17:00", "17:30")).toBe(true);
    expect(inReminderWindow("17:00", "17:45")).toBe(true);
    expect(inReminderWindow("17:00", "17:46")).toBe(false);
  });

  it("never fires without a due time", () => {
    expect(inReminderWindow(null, "17:00")).toBe(false);
    expect(inReminderWindow("", "17:00")).toBe(false);
  });
});

describe("reminder message", () => {
  it("formats a friendly 12h time", () => {
    expect(friendlyHM("17:05")).toBe("5:05pm");
    expect(friendlyHM("00:30")).toBe("12:30am");
    expect(friendlyHM("12:00")).toBe("12:00pm");
  });

  it("composes the ping", () => {
    expect(reminderText("Email Dr. Soto", "17:00")).toBe(
      "⏰ Reminder: Email Dr. Soto — 5:00pm today",
    );
  });
});
