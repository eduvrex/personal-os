import { describe, expect, it } from "vitest";

import {
  classifyOutcome,
  isNoise,
  matchApplication,
  parseIngestBody,
  parseSender,
  type ApplicationRef,
} from "@/lib/jobEmails";
import { ValidationError } from "@/lib/validate";

const APPS: ApplicationRef[] = [
  { id: "a1", org: "UNIR (Grupo PROEDUCA)" },
  { id: "a2", org: "Management Solutions" },
  { id: "a3", org: "Flying Tiger Copenhagen" },
  { id: "a4", org: "Marlex People (empresa familiar distribuidora)" },
  { id: "a5", org: "ESADE" },
  { id: "a6", org: "Ally Financial" },
];

describe("parseSender", () => {
  it("splits display name from the registrable domain", () => {
    expect(parseSender("UNIR Talento <no-reply@unir.net>")).toEqual({
      display: "unir talento",
      core: "unir",
    });
    expect(parseSender("careers@managementsolutions.com").core).toBe("managementsolutions");
  });

  it("skips a country second-level domain", () => {
    expect(parseSender("rrhh@flyingtiger.co.uk").core).toBe("flyingtiger");
    expect(parseSender("hola@esade.com.mx").core).toBe("esade");
  });

  it("survives junk", () => {
    expect(parseSender(null)).toEqual({ display: "", core: "" });
    expect(parseSender("not-an-address").core).toBe("");
  });
});

describe("matchApplication", () => {
  it("matches a short org through its domain only", () => {
    // "ally" is 4 chars: it must never match from subject text alone, but the
    // registrable domain is unambiguous.
    expect(matchApplication("Ally Careers <noreply@ally.com>", "Your application", APPS)?.id)
      .toBe("a6");
    expect(matchApplication("news@example.com", "Ally of the week", APPS)).toBeNull();
  });

  it("matches the full org name as a phrase when no single token is distinctive", () => {
    expect(
      matchApplication(
        "Talent Acquisition <no-reply@myworkday.com>",
        "Thank you for applying to Ally Financial",
        APPS,
      )?.id,
    ).toBe("a6");
  });

  it("never matches on generic finance words alone", () => {
    expect(matchApplication("news@bankrate.com", "Financial news digest", APPS)).toBeNull();
    expect(matchApplication("hr@othercorp.com", "Financial Analyst opening", APPS)).toBeNull();
  });

  it("matches on the sender domain", () => {
    expect(matchApplication("Talento <no-reply@unir.net>", "Tu candidatura", APPS)?.id).toBe("a1");
    expect(matchApplication("hr@managementsolutions.com", "Proceso", APPS)?.id).toBe("a2");
  });

  it("matches a distinctive word in the display name or subject", () => {
    expect(
      matchApplication("Recruiting <talent@mail.example.com>", "Flying Tiger — next steps", APPS)?.id,
    ).toBe("a3");
  });

  it("does not match a 4-letter token through subject text alone", () => {
    // "unir" is an ordinary Spanish verb — only the domain may carry it.
    expect(matchApplication("boletin@newsletter.es", "Vamos a unir fuerzas", APPS)).toBeNull();
  });

  it("does not match on generic corporate filler", () => {
    expect(matchApplication("info@solutions-hosting.com", "Your invoice", APPS)).toBeNull();
    expect(matchApplication("noreply@people-analytics.io", "Weekly digest", APPS)).toBeNull();
    expect(matchApplication("hello@barcelona-tourism.cat", "Visit Barcelona", APPS)).toBeNull();
  });

  it("returns null when nothing is close", () => {
    expect(matchApplication("friend@gmail.com", "lunch tomorrow?", APPS)).toBeNull();
    expect(matchApplication("x@y.com", "hello", [])).toBeNull();
  });

  it("prefers the domain match over a weaker text match", () => {
    const hit = matchApplication("hr@esade.edu", "Management Solutions mentioned you", APPS);
    expect(hit?.id).toBe("a5");
  });
});

describe("parseIngestBody", () => {
  const one = { id: "m1", subject: "Hello", from: "a@b.com", date: "2026-09-09T10:00:00Z", snippet: "hi" };

  it("accepts a well-formed batch", () => {
    expect(parseIngestBody({ items: [one] })).toHaveLength(1);
  });

  it("allows optional fields to be absent", () => {
    const [item] = parseIngestBody({ items: [{ id: "m2", subject: "S" }] });
    expect(item.from).toBeNull();
    expect(item.snippet).toBeNull();
  });

  it("rejects a missing id, a non-array, and an oversized batch", () => {
    expect(() => parseIngestBody({ items: [{ subject: "no id" }] })).toThrow(ValidationError);
    expect(() => parseIngestBody({ items: "nope" })).toThrow(ValidationError);
    expect(() => parseIngestBody({ items: Array(101).fill(one) })).toThrow(ValidationError);
  });
});


describe("isNoise", () => {
  it("catches the job-board marketing actually seen in the inbox", () => {
    expect(isNoise('"Mensajes InfoJobs.net" <pushinfojobs@comms.infojobs.net>', "Te has inscrito a una oferta")).toBe(true);
    expect(isNoise("Infojobs <ofertas@push.infojobs.net>", "Eduardo, 10 ofertas que te recomendamos")).toBe(true);
    expect(isNoise("Google <no-reply@accounts.google.com>", "Security alert")).toBe(true);
  });

  it("leaves real employer mail alone", () => {
    expect(
      isNoise('"Sofia Rodriguez - Grupo PROEDUCA" <sofia@grupoproeduca.teamtailor-mail.com>', "Bienvenida al proceso"),
    ).toBe(false);
    expect(isNoise("hr@esade.edu", "Entrevista")).toBe(false);
  });
});

describe("classifyOutcome", () => {
  it("reads the real UNIR rejection", () => {
    expect(
      classifyOutcome(
        "Gracias por participar en nuestro proceso de selección",
        "después de evaluar tu candidatura, consideramos que para esta oferta tu perfil no se ajusta plenamente a nuestras necesidades actuales.",
      ),
    ).toBe("rejected");
  });

  it("reads the real UNIR acknowledgement as an ack, not a rejection", () => {
    expect(
      classifyOutcome(
        "Bienvenida al proceso",
        "¡Bienvenido/a al proceso de selección de Analista Junior! ... procederemos a valorar tu candidatura",
      ),
    ).toBe("ack");
  });

  it("lets rejection win even when the letter also mentions an interview", () => {
    expect(
      classifyOutcome("Proceso finalizado", "Gracias por la entrevista. Hemos decidido no continuar con tu candidatura."),
    ).toBe("rejected");
    expect(
      classifyOutcome("Update", "Thanks for the interview - unfortunately you were unsuccessful this time."),
    ).toBe("rejected");
  });

  it("detects interview invitations in both languages", () => {
    expect(classifyOutcome("Siguiente fase", "Nos gustaría agendar una llamada contigo.")).toBe("interview");
    expect(classifyOutcome("Next steps", "We would like to schedule an interview.")).toBe("interview");
  });

  it("detects an offer", () => {
    expect(classifyOutcome("Oferta de empleo", "Nos complace ofrecerte el puesto.")).toBe("offer");
  });

  it("says nothing about neutral mail", () => {
    expect(classifyOutcome("Factura de septiembre", "Adjuntamos la factura.")).toBeNull();
    expect(classifyOutcome("hola", null)).toBeNull();
  });
});
