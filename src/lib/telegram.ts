import "server-only";

/**
 * Thin Telegram Bot API helpers (getFile, file download, sendMessage).
 * The bot token is server-only and never leaves these functions.
 */

function apiBase(token: string): string {
  return `https://api.telegram.org/bot${token}`;
}

/** Resolve a Telegram file_id to its downloadable file path. */
export async function tgGetFilePath(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${apiBase(token)}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!data?.ok || !data.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${data?.description ?? res.status}`);
  }
  return data.result.file_path as string;
}

/** Download a Telegram file's bytes given its file path. */
export async function tgDownloadFile(
  token: string,
  filePath: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!res.ok) {
    throw new Error(`Telegram file download failed: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = filePath.split("/").pop() || "audio.oga";
  return { buffer, filename };
}

/** One row of inline-keyboard buttons (callback_data based). */
export interface TgInlineButton {
  text: string;
  callback_data: string;
}

/** Send a plain-text reply to a chat, optionally with inline buttons. Best-effort. */
export async function tgSendMessage(
  token: string,
  chatId: number | string,
  text: string,
  buttons?: TgInlineButton[][],
): Promise<void> {
  await fetch(`${apiBase(token)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });
}

/** Rewrite a sent message's text (and buttons) in place. Best-effort. */
export async function tgEditMessageText(
  token: string,
  chatId: number | string,
  messageId: number,
  text: string,
  buttons?: TgInlineButton[][],
): Promise<void> {
  await fetch(`${apiBase(token)}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });
}

/** Acknowledge an inline-button tap (stops the client-side spinner). Best-effort. */
export async function tgAnswerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await fetch(`${apiBase(token)}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  });
}

/**
 * Send a long text as multiple messages, split on line boundaries under
 * Telegram's 4096-character message limit.
 */
export async function tgSendLongMessage(
  token: string,
  chatId: number | string,
  text: string,
): Promise<void> {
  const MAX = 4000;
  let rest = text;
  while (rest.length > 0) {
    let chunk = rest.slice(0, MAX);
    if (rest.length > MAX) {
      const cut = chunk.lastIndexOf("\n");
      if (cut > MAX / 2) chunk = chunk.slice(0, cut);
    }
    await tgSendMessage(token, chatId, chunk);
    rest = rest.slice(chunk.length).replace(/^\n+/, "");
  }
}

/** Upload and send a document (file) to a chat. Throws on API failure. */
export async function tgSendDocument(
  token: string,
  chatId: number | string,
  file: { buffer: Buffer; filename: string; caption?: string },
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (file.caption) form.append("caption", file.caption);
  form.append("document", new Blob([new Uint8Array(file.buffer)]), file.filename);
  const res = await fetch(`${apiBase(token)}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) {
    throw new Error(`Telegram sendDocument failed: ${data?.description ?? res.status}`);
  }
}
