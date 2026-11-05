import { describe, expect, it } from "vitest";

import { matchCommand } from "@/lib/telegramCommands";

const cmd = (text: string) => matchCommand(text)?.command ?? null;
const fmt = (text: string) => matchCommand(text)?.format ?? null;

describe("matchCommand — strict intent matching", () => {
  it("matches bare keywords, slash-prefixed or not, any case", () => {
    expect(cmd("cv")).toBe("cv");
    expect(cmd("/cv")).toBe("cv");
    expect(cmd("Resume")).toBe("cv");
    expect(cmd("BRIEFING")).toBe("briefing");
    expect(cmd("/start")).toBe("help");
    expect(cmd("backup")).toBe("backup");
    expect(cmd("export")).toBe("backup");
    expect(cmd("spending")).toBe("spending");
    expect(cmd("finance")).toBe("spending");
    expect(cmd("tasks")).toBe("tasks");
    expect(cmd("today")).toBe("tasks");
    expect(cmd("events")).toBe("events");
    expect(cmd("calendar")).toBe("events");
    expect(cmd("agenda")).toBe("events");
  });

  it("tolerates trailing punctuation and whitespace", () => {
    expect(cmd("  briefing!  ")).toBe("briefing");
    expect(cmd("cv.")).toBe("cv");
  });

  it("matches short natural requests", () => {
    expect(cmd("send me my cv")).toBe("cv");
    expect(cmd("Send my resume")).toBe("cv");
    expect(cmd("please send me the briefing")).toBe("briefing");
    expect(cmd("give me my tasks")).toBe("tasks");
    expect(cmd("show me the spending")).toBe("spending");
    expect(cmd("show me my calendar")).toBe("events");
  });

  it("parses a format suffix", () => {
    expect(matchCommand("cv pdf")).toEqual({ command: "cv", format: "pdf" });
    expect(matchCommand("cv as pdf")).toEqual({ command: "cv", format: "pdf" });
    expect(matchCommand("send me my cv as pdf")).toEqual({ command: "cv", format: "pdf" });
    expect(matchCommand("briefing pdf")).toEqual({ command: "briefing", format: "pdf" });
    expect(matchCommand("cv as docx")).toEqual({ command: "cv", format: "docx" });
    expect(matchCommand("cv in word")).toEqual({ command: "cv", format: "docx" });
    expect(fmt("cv")).toBe("text");
  });

  it("never eats real captures", () => {
    expect(matchCommand("send my cv to the ESADE portal by friday")).toBeNull();
    expect(matchCommand("update my resume with the Acme Analytics role")).toBeNull();
    expect(matchCommand("felt great today")).toBeNull();
    expect(matchCommand("today was exhausting")).toBeNull();
    expect(matchCommand("remind me to export the ledger tomorrow")).toBeNull();
    expect(matchCommand("finance homework due monday")).toBeNull();
    expect(matchCommand("dentist appointment thursday 3pm")).toBeNull();
    expect(matchCommand("add pilates to my calendar for monday")).toBeNull();
    expect(matchCommand("")).toBeNull();
  });
});
