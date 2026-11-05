import "server-only";

import { effectiveBalance } from "@/lib/balance";
import { anthropicClient, heavyModel, textFrom } from "@/lib/ai";
import { buildFinanceOverview } from "@/lib/financeOverview";
import { buildSpending } from "@/lib/spending";
import { listApplications } from "@/lib/applications";
import { listPlans } from "@/lib/plans";
import { fullKnowledgeContext } from "@/lib/knowledgeBase";
import { localDateKey } from "@/lib/localDate";

/**
 * W5 — Money Q&A grounded in real data. Facts and 2–3 options with
 * trade-offs; NEVER a single directive. Heavy (Sonnet-class) model — this is
 * an explicit, occasional, paid action in the UI.
 */

const SYSTEM_PROMPT = `You are the financial information assistant inside Eduardo's Personal OS. Using ONLY the data provided, answer his money question with:
1. The relevant FACTS from his data (balances, APRs, computed interest costs, budget status, upcoming deadlines).
2. Two or three concrete OPTIONS, each with its trade-offs stated plainly (e.g. interest saved vs. cash buffer kept). Where math helps, show it (interest = balance × APR / 12).
3. End with exactly this note: "This isn't financial advice — those are the trade-offs, the call is yours."
Never give a single directive, never say "you should" without presenting the alternative, never invent numbers not derivable from the data. Be concise and warm.`;

/** Deterministic grounding context — the model gets facts, not the DB. */
export async function buildMoneyContext(): Promise<string> {
  const [finance, spending, apps, plans, knowledge] = await Promise.all([
    buildFinanceOverview(),
    buildSpending(),
    listApplications(),
    listPlans(),
    // Private authenticated surface (Finance tab) — full KB incl. advisor-only
    // items, which carry rules never to surface their specifics publicly.
    fullKnowledgeContext(),
  ]);

  const cash = finance.accounts
    .filter((a) => (a.type ?? "").toLowerCase() === "depository")
    .reduce((s, a) => s + effectiveBalance(a), 0);

  const cardLines = finance.cards
    .filter((c) => (c.balance ?? 0) > 0)
    .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))
    .map((c) => {
      const monthly =
        c.apr != null && c.balance != null ? (c.balance * (c.apr / 100)) / 12 : null;
      return `- ${c.name}: $${c.balance?.toFixed(2)} at ${c.apr ?? "?"}% APR${
        monthly != null ? ` (~$${monthly.toFixed(2)}/mo interest)` : ""
      }${c.minimum_payment != null ? `, min $${c.minimum_payment}` : ""}${
        c.dueLabel ? `, due ${c.dueLabel}` : ""
      }${c.overLimit ? " — OVER LIMIT" : ""}`;
    });

  const budgetLines = spending.categories
    .filter((c) => c.budget != null)
    .map(
      (c) =>
        `- ${c.label}: $${Math.round(c.spent)} spent of $${c.budget} budget${c.over ? " (over)" : ""}`,
    );

  const deadlines = apps
    .filter((a) => a.deadline)
    .map((a) => `- ${a.org} ${a.title}: ${a.deadline}`)
    .slice(0, 8);

  const savings = plans
    .filter((p) => p.savings_target)
    .map((p) => `- ${p.title}: target $${p.savings_target}${p.target_date ? ` by ${p.target_date}` : ""}`);

  return [
    ...(knowledge ? [knowledge, ""] : []),
    `Today: ${localDateKey()}.`,
    `Cash buffer (checking+savings): $${cash.toFixed(2)}.`,
    `Net worth: $${finance.netWorth.toFixed(2)} (assets $${finance.assets.toFixed(2)}, card debt $${finance.cardDebt.toFixed(2)}, loans $${finance.loanDebt.toFixed(2)}).`,
    "",
    "Credit cards (highest APR first):",
    ...(cardLines.length ? cardLines : ["- none carrying a balance"]),
    "",
    `This month's spending so far: $${Math.round(spending.total)} (last month $${Math.round(spending.lastMonthTotal)}).`,
    ...(budgetLines.length ? ["Budgets:", ...budgetLines] : []),
    ...(savings.length ? ["", "Savings goals:", ...savings] : []),
    ...(deadlines.length ? ["", "Upcoming application deadlines:", ...deadlines] : []),
  ].join("\n");
}

export async function askAdvisor(question: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Advisor needs ANTHROPIC_API_KEY.");

  const context = await buildMoneyContext();
  // Explicit paid action; route maxDuration is 120s, so allow a long attempt
  // but never a second paid retry on timeout.
  const client = anthropicClient({ timeoutMs: 110_000, maxRetries: 0 });
  const res = await client.messages.create({
    model: heavyModel(),
    max_tokens: 8000,
    // Extended thinking: the money trade-off math (APR × balance, buffer vs.
    // payoff) is exactly where a scratchpad earns its tokens. textFrom()
    // returns only the text blocks — thinking is never surfaced or stored.
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `My data:\n${context}\n\nQuestion: ${question}` },
    ],
  });
  return textFrom(res);
}
