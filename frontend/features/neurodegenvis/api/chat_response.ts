import { sendChat } from "../services/chatService";
import { MessageHistory } from "../utils_chat/types";

export async function getChatResponse(messages: MessageHistory[]) {
  return sendChat(messages);
}
