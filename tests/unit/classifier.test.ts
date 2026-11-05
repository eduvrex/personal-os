import { describe, expect, it } from "vitest";

import {
  classifyWithRegex,
  cleanCaptureTitle,
  cleanTaskTitle,
  guardRoute,
  looksLikeSchool,
  parseExtraction,
  parseExtractions,
  parseWhen,
  reconcileExtraction,
} from "@/lib/router/classifyCapture";

describe("guardRoute — greetings/gibberish/commands never become tasks", () => {
  it("routes slash-commands to note", () => {
    expect(guardRoute("/start")).toBe("note");
    expect(guardRoute("/help me")).toBe("note");
  });
  it("routes greetings to note (with punctuation)", () => {
    for (const g of ["Hello", "hey", "OK", "thanks!", "Good morning", "gm"]) {
      expect(guardRoute(g)).toBe("note");
    }
  });
  it("routes very short non-actionable inputs to note", () => {
    expect(guardRoute("blue cheese")).toBe("note");
    expect(guardRoute("hmm")).toBe("note");
  });
  it("lets actionable and longer inputs through to the AI", () => {
    expect(guardRoute("submit essay")).toBeNull(); // short but task-keyword
    expect(guardRoute("remind me to email my advisor")).toBeNull();
    expect(guardRoute("felt really proud of the progress today")).toBeNull();
  });
});

describe("parseWhen — deterministic date/time extraction", () => {
  // Tuesday
  const today = "2026-07-07";

  it("resolves relative day words", () => {
    expect(parseWhen("dentist today", today).date).toBe("2026-07-07");
    expect(parseWhen("dinner tonight", today).date).toBe("2026-07-07");
    expect(parseWhen("call mom tomorrow", today).date).toBe("2026-07-08");
    expect(parseWhen("follow up the day after tomorrow", today).date).toBe("2026-07-09");
    expect(parseWhen("check again in 3 days", today).date).toBe("2026-07-10");
    expect(parseWhen("review this in 2 weeks", today).date).toBe("2026-07-21");
    expect(parseWhen("start next week", today).date).toBe("2026-07-14");
  });
  it("resolves weekday names to the next occurrence", () => {
    expect(parseWhen("meeting on friday", today).date).toBe("2026-07-10");
    expect(parseWhen("lunch monday", today).date).toBe("2026-07-13");
    // Saying the current weekday means next week.
    expect(parseWhen("review on tuesday", today).date).toBe("2026-07-14");
  });
  it("resolves month-day phrases, rolling past dates to next year", () => {
    expect(parseWhen("flight july 20", today).date).toBe("2026-07-20");
    expect(parseWhen("party on the 3rd of august", today).date).toBe("2026-08-03");
    expect(parseWhen("birthday march 5", today).date).toBe("2027-03-05");
  });
  it("passes through ISO dates", () => {
    expect(parseWhen("deadline 2026-09-01", today).date).toBe("2026-09-01");
  });
  it("parses times in 12h, 24h, and word forms", () => {
    expect(parseWhen("dentist at 3pm", today).time).toBe("15:00");
    expect(parseWhen("standup 9:30am", today).time).toBe("09:30");
    expect(parseWhen("train at 18:45", today).time).toBe("18:45");
    expect(parseWhen("lunch at noon", today).time).toBe("12:00");
    expect(parseWhen("essay is due at 5 p.m.", today).time).toBe("17:00");
  });
  it("returns nulls when nothing is stated", () => {
    expect(parseWhen("buy groceries", today)).toEqual({ date: null, time: null });
  });
});

describe("classifyWithRegex — the deterministic fallback", () => {
  it("classifies tasks", () => {
    expect(classifyWithRegex("remind me to email my advisor")).toBe("task");
    expect(classifyWithRegex("submit the lab report by friday")).toBe("task");
  });
  it("classifies scheduled happenings as events", () => {
    expect(classifyWithRegex("dentist appointment thursday at 3pm")).toBe("event");
    expect(classifyWithRegex("dinner with maria on friday")).toBe("event");
    // Time + date but no event keyword still reads as scheduled.
    expect(classifyWithRegex("haircut friday 4pm")).toBe("event");
  });
  it("keeps dateless event words out of the calendar", () => {
    // "book a dentist appointment" with no date is an errand, not an event.
    expect(classifyWithRegex("book a dentist appointment")).toBe("task");
  });
  it("classifies clearly personal/emotional text as personal", () => {
    expect(classifyWithRegex("today was difficult, I am missing my love")).toBe("personal");
    expect(classifyWithRegex("feeling so lonely and heartbroken")).toBe("personal");
  });
  it("classifies lighter reflection as journal", () => {
    expect(classifyWithRegex("today was productive and I am grateful")).toBe("journal");
  });
  it("defaults to note", () => {
    expect(classifyWithRegex("idea: morning gym sessions work better")).toBe("note");
  });
});

describe("parseExtraction — validating model JSON", () => {
  it("accepts a well-formed reply, including fenced/prefixed JSON", () => {
    const out = parseExtraction(
      'Sure: {"route":"event","title":"Dentist","date":"2026-07-09","time":"15:00"}',
      "claude",
    );
    expect(out).toEqual({
      route: "event",
      title: "Dentist",
      date: "2026-07-09",
      time: "15:00",
      llm: "claude",
    });
  });
  it("nulls malformed fields instead of failing the whole reply", () => {
    const out = parseExtraction(
      '{"route":"task","title":"","date":"next friday","time":"3pm"}',
      "openai",
    );
    expect(out).toEqual({ route: "task", title: null, date: null, time: null, llm: "openai" });
  });
  it("rejects impossible ISO-shaped calendar values", () => {
    const out = parseExtraction(
      '{"route":"event","title":"Bad date","date":"2026-99-40","time":"27:90"}',
      "claude",
    );
    expect(out).toEqual({
      route: "event",
      title: "Bad date",
      date: null,
      time: null,
      llm: "claude",
    });
  });
  it("rejects unknown routes and non-JSON", () => {
    expect(parseExtraction('{"route":"meeting"}', "claude")).toBeNull();
    expect(parseExtraction("task", "claude")).toBeNull();
    expect(parseExtraction(null, "claude")).toBeNull();
  });
  it("parses a multi-item v3 reply with destination metadata", () => {
    const out = parseExtractions(
      JSON.stringify({
        items: [
          {
            text: "Submit econometrics essay tomorrow",
            route: "task",
            title: "Submit econometrics essay",
            date: "2026-07-11",
            time: null,
            confidence: 0.96,
            domain: "school",
            course: "Econometrics",
          },
          {
            text: "add Thinking in Bets to my reading list",
            route: "reading",
            title: "Thinking in Bets",
            date: null,
            time: null,
            confidence: 0.93,
            author: "Annie Duke",
          },
        ],
      }),
      "claude",
    );
    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({ route: "task", domain: "school", course: "Econometrics" });
    expect(out?.[1]).toMatchObject({ route: "reading", title: "Thinking in Bets", author: "Annie Duke" });
  });
});

describe("task title cleanup + school detection", () => {
  it("strips lead-ins", () => {
    expect(cleanTaskTitle("remind me to email my advisor")).toBe("email my advisor");
    expect(cleanTaskTitle("todo: buy groceries")).toBe("buy groceries");
    expect(
      cleanCaptureTitle("I need to finish my econometrics essay tomorrow. It's due at 5 p.m."),
    ).toBe("finish my econometrics essay");
    expect(cleanCaptureTitle("remind me to buy milk at 5 p.m.")).toBe("buy milk");
  });
  it("detects coursework", () => {
    expect(looksLikeSchool("finish the CS 201 problem set")).toBe(true);
    expect(looksLikeSchool("buy groceries")).toBe(false);
  });
});

describe("reconcileExtraction — source facts win over incomplete model JSON", () => {
  const today = "2026-07-09";

  it("fills a date and spoken-style time omitted by the model", () => {
    expect(
      reconcileExtraction(
        "I need to finish my econometrics essay tomorrow. It's due at 5 p.m.",
        { route: "task", title: null, date: null, time: null, llm: "claude" },
        today,
      ),
    ).toEqual({
      route: "task",
      title: "finish my econometrics essay",
      date: "2026-07-10",
      time: "17:00",
      llm: "claude",
    });
  });

  it("corrects a model date when an explicit source date is deterministic", () => {
    const out = reconcileExtraction(
      "Pay the subscription tomorrow",
      { route: "task", title: "Pay the subscription", date: "2026-07-20", time: null, llm: "openai" },
      today,
    );
    expect(out.date).toBe("2026-07-10");
  });

  it("does not attach scheduling fields to notes or reflections", () => {
    expect(
      reconcileExtraction(
        "Idea for tomorrow: rethink the morning routine",
        { route: "note", title: "Wrong", date: "2026-07-10", time: "09:00", llm: "claude" },
        today,
      ),
    ).toEqual({ route: "note", title: null, date: null, time: null, llm: "claude" });
  });
});
