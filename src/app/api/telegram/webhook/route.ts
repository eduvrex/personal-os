import { NextResponse, type NextRequest } from "next/server";

import { secretsMatch } from "@/lib/auth/session";
import { runCapture, rerouteCapture } from "@/lib/capture";
import { isUuid } from "@/lib/validate";
import { matchCommand, runCommand } from "@/lib/telegramCommands";
import { OUTCOME_LABEL, OUTCOMES, recordCheckin, type Outcome } from "@/lib/rhythmPings";
import { claimTelegramUpdate, finishTelegramUpdate } from "@/lib/telegramUpdates";
import {
  tgAnswerCallbackQuery,
  tgDownloadFile,
  tgEditMessageText,
  tgGetFilePath,
  tgSendMessage,
  type TgInlineButton,
} from "@/lib/telegram";
import { transcribeAudio } from "@/lib/transcribe";
import type { CaptureRoute } from "@/lib/types";

/**
 * Telegram voice/text capture webhook.
 *
 * This route is PUBLIC (excluded from the password middleware via the
 * /api/telegram prefix) so Telegram can reach it. It authenticates itself two
 * ways: the secret-token header Telegram echoes, and an allowlist of one sender.
 *
 * It always replies 200 (except on a bad secret) so Telegram doesn't retry —
 * problems are reported back to the user in the chat instead.
 */

const ROUTE_BUTTONS: { route: CaptureRoute; label: string }[] = [
  { route: "task", label: "Task" },
  { route: "event", label: "Calendar" },
  { route: "journal", label: "Journal" },
  { route: "note", label: "Note" },
  { route: "personal", label: "Private" },
  { route: "plan", label: "Plan" },
  { route: "reading", label: "Reading" },
  { route: "application", label: "Application" },
];

/** One row of "move" buttons for every route except where it already landed. */
function moveButtons(captureId: string, current: CaptureRoute): TgInlineButton[][] {
  const buttons = ROUTE_BUTTONS.filter((b) => b.route !== current).map((b) => ({
      text: b.label,
      callback_data: `rr:${captureId}:${b.route}`,
    }));
  return [buttons.slice(0, 4), buttons.slice(4)];
}

function clarificationButtons(captureId: string): TgInlineButton[][] {
  const buttons = ROUTE_BUTTONS.map((b) => ({
    text: b.label,
    callback_data: `rr:${captureId}:${b.route}`,
  }));
  return [buttons.slice(0, 4), buttons.slice(4)];
}

function confirmation(label: string, text: string): string {
  const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;
  return `✅ Captured → ${label}\n“${preview}”\n\nWrong shelf? Move it:`;
}

function clarification(label: string, text: string): string {
  const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;
  return `🤔 I think this belongs in ${label}, but I'm not certain.\n“${preview}”\n\nChoose the shelf:`;
}

/** Handle a "move" button tap on a capture confirmation. */
async function handleCallback(
  token: string,
  callback: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number }; message_id?: number; text?: string };
  },
): Promise<void> {
  const allowedUserId = process.env.TELEGRAM_USER_ID;
  const fromId = String(callback.from?.id ?? "");
  if (!allowedUserId || fromId !== allowedUserId) {
    await tgAnswerCallbackQuery(token, callback.id);
    return;
  }

  // Rhythm check-in taps: "rc:<ping id>:done|partial|skipped".
  const rc = (callback.data ?? "").match(/^rc:([0-9a-f-]{36}):(\w+)$/);
  if (rc) {
    const outcome = rc[2] as Outcome;
    if (!isUuid(rc[1]) || !OUTCOMES.includes(outcome)) {
      await tgAnswerCallbackQuery(token, callback.id, "This button has expired.");
      return;
    }
    const label = await recordCheckin(rc[1], outcome);
    await tgAnswerCallbackQuery(token, callback.id, label ? OUTCOME_LABEL[outcome] : "This button has expired.");
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    if (label && chatId && messageId) {
      await tgEditMessageText(token, chatId, messageId, `${OUTCOME_LABEL[outcome]} · ${label}`);
    }
    return;
  }

  const match = (callback.data ?? "").match(/^rr:([0-9a-f-]{36}):(\w+)$/);
  const route = match?.[2] as CaptureRoute | undefined;
  const validRoute =
    route && ROUTE_BUTTONS.some((b) => b.route === route) ? route : null;
  if (!match || !isUuid(match[1]) || !validRoute) {
    await tgAnswerCallbackQuery(token, callback.id, "This button has expired.");
    return;
  }

  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  try {
    const result = await rerouteCapture(match[1], validRoute);
    await tgAnswerCallbackQuery(token, callback.id, `Moved → ${result.label}`);
    if (chatId && messageId) {
      // Rewrite the confirmation in place so the chat reflects where it lives now.
      const original = callback.message?.text ?? "";
      const quote = original.match(/“[\s\S]*”/)?.[0] ?? "";
      await tgEditMessageText(
        token,
        chatId,
        messageId,
        `✅ Moved → ${result.label}\n${quote}\n\nWrong shelf? Move it:`,
        moveButtons(match[1], validRoute),
      );
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unexpected error";
    await tgAnswerCallbackQuery(token, callback.id, `Couldn't move it — ${detail}`);
  }
}

export async function POST(request: NextRequest) {
  // 1. Verify the shared secret Telegram sends with every update.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !provided || !(await secretsMatch(provided, secret))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Not configured yet — acknowledge so Telegram doesn't keep retrying.
    return NextResponse.json({ ok: true });
  }

  const update = await request.json().catch(() => null);

  const updateId = typeof update?.update_id === "number" ? update.update_id : null;
  const actorId = String(
    update?.callback_query?.from?.id ?? update?.message?.from?.id ?? update?.edited_message?.from?.id ?? "",
  );
  const allowedUserId = process.env.TELEGRAM_USER_ID;
  if (!allowedUserId || actorId !== allowedUserId) {
    return NextResponse.json({ ok: true });
  }
  if (updateId != null && !(await claimTelegramUpdate(updateId))) {
    return NextResponse.json({ ok: true });
  }

  // Inline-button taps (the "move" row under capture confirmations).
  if (update?.callback_query?.id) {
    await handleCallback(token, update.callback_query).catch(() => {});
    if (updateId != null) await finishTelegramUpdate(updateId, { status: "processed" }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const message = update?.message ?? update?.edited_message;
  if (!message) return NextResponse.json({ ok: true });

  // 2. Only the owner may capture; ignore everyone else silently.
  const fromId = String(message.from?.id ?? "");
  if (!allowedUserId || fromId !== allowedUserId) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat?.id as number | undefined;

  try {
    // 3. Get the text — transcribe voice/audio, or use the message text.
    let text = "";
    const voice = message.voice ?? message.audio;
    if (voice?.file_id) {
      const filePath = await tgGetFilePath(token, voice.file_id);
      const { buffer, filename } = await tgDownloadFile(token, filePath);
      text = (await transcribeAudio(buffer, filename)).trim();
    } else if (typeof message.text === "string") {
      text = message.text.trim();
    }

    if (!text) {
      if (chatId) {
        await tgSendMessage(token, chatId, "I couldn't find any text or speech to capture.");
      }
      if (updateId != null) await finishTelegramUpdate(updateId, { status: "processed" });
      return NextResponse.json({ ok: true });
    }
    if (text.length > 4000) text = `${text.slice(0, 4000)}…`;

    // 4a. Commands first — "cv", "briefing pdf", "send me my events", … reply
    // with documents/summaries instead of being captured. The matcher is strict
    // so real captures never get eaten.
    const command = matchCommand(text);
    if (command && chatId) {
      await runCommand(command, token, chatId);
      if (updateId != null) await finishTelegramUpdate(updateId, { status: "processed" });
      return NextResponse.json({ ok: true });
    }

    // 4 + 5. Classify and route through the same pipeline as /api/capture.
    const result = await runCapture({ text, source: "telegram", deferLowConfidence: true });

    // 6. Confirm where it landed, with one-tap "move" buttons to re-route.
    if (chatId) {
      if (result.pending) {
        await tgSendMessage(
          token,
          chatId,
          clarification(result.label, text),
          clarificationButtons(result.captureId),
        );
      } else {
        await tgSendMessage(
          token,
          chatId,
          confirmation(result.label, text),
          result.itemCount === 1 ? moveButtons(result.captureId, result.routedTo) : undefined,
        );
      }
    }
    if (updateId != null) {
      await finishTelegramUpdate(updateId, { status: "processed", captureId: result.captureId });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unexpected error";
    if (updateId != null) {
      await finishTelegramUpdate(updateId, { status: "failed", error: detail }).catch(() => {});
    }
    if (chatId) {
      await tgSendMessage(
        token,
        chatId,
        `⚠️ Couldn't save that — ${detail}`,
      ).catch(() => {});
    }
    // Still 200: a 5xx makes Telegram retry the same failing update repeatedly.
    return NextResponse.json({ ok: true });
  }
}
