import type { Message } from "@/components/AIChatBox";

const STORAGE_KEY = "framefind-ask-messages";

export function loadAskMessages(): Message[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Message =>
        typeof entry === "object" &&
        entry !== null &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string"
    );
  } catch {
    return [];
  }
}

export function saveAskMessages(messages: Message[]) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}
