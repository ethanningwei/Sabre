import "server-only";
import { splitMessage } from "@/lib/parade";

export class TelegramError extends Error {}

interface SendTarget {
  chatId: string;
  threadId: string | null;
}

async function call(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError("TELEGRAM_BOT_TOKEN is not set.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: true; result: { message_id: number } }
    | { ok: false; description?: string }
    | null;
  if (!json?.ok) throw new TelegramError(json && !json.ok ? (json.description ?? "unknown error") : `HTTP ${res.status}`);
  return json.result;
}

/**
 * Sends text to the coy's chat/topic, split at subunit boundaries like the bot.
 * A deleted/wrong topic gets an explanation posted to the main chat, as before.
 */
export async function sendToTelegram(target: SendTarget, text: string): Promise<number[]> {
  const ids: number[] = [];
  try {
    for (const chunk of splitMessage(text)) {
      const result = await call("sendMessage", {
        chat_id: target.chatId,
        text: chunk,
        ...(target.threadId ? { message_thread_id: Number(target.threadId) } : {}),
      });
      ids.push(result.message_id);
    }
  } catch (e) {
    if (e instanceof TelegramError && /thread not found/i.test(e.message) && target.threadId) {
      await call("sendMessage", {
        chat_id: target.chatId,
        text:
          `⚠️ CONFIG MISMATCH!\n\nTHREAD ID ${target.threadId} does not exist in this chat — the topic ` +
          `may have been deleted, or the number is wrong.\n\nFix it in the web app's coy settings.`,
      }).catch(() => undefined);
      throw new TelegramError(
        `Topic ${target.threadId} doesn't exist in that chat${ids.length ? ` (${ids.length} part(s) were sent before it failed)` : ""}. Check the thread ID in Admin › Coy settings.`,
      );
    }
    throw e;
  }
  return ids;
}
