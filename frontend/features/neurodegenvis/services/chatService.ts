import { buildApiUrl } from "../../../shared/runtimeConfig";
import type { MessageHistory } from "../utils_chat/types";

export async function sendChat(messages: MessageHistory[]) {
  const response = await fetch(buildApiUrl("/chatbot/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`API ERROR: ${response.status}`);
  }

  const data = (await response.json()) as { reply: string };
  return data.reply;
}
