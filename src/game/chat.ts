export interface ChatMessage {
  id: string
  senderSeatIndex: number
  senderName: string
  senderAvatar: string
  text: string
  timestamp: number
}

export function createChatMessage(
  senderSeatIndex: number,
  senderName: string,
  senderAvatar: string,
  text: string,
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderSeatIndex,
    senderName,
    senderAvatar,
    text: text.trim(),
    timestamp: Date.now(),
  }
}
