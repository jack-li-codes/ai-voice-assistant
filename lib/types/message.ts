// Message type definitions for bilingual conversation support

/**
 * Bilingual chat message structure
 * Supports both English and Chinese content for each message
 */
export interface ChatMessage {
  id: string;                      // Unique identifier (timestamp or UUID)
  role: "user" | "assistant";      // Message sender
  contentEN: string;               // English content
  contentZH: string;               // Chinese content
  timestamp?: number;              // Optional timestamp
  isManual?: boolean;              // Whether this is a manual input (vs voice)
  speaker?: "me" | "partner";      // Who spoke (for face-to-face mode)
}

/**
 * Helper to determine which language was the original input
 * Returns true if Chinese was the original, false if English
 */
export function isOriginalChinese(message: ChatMessage): boolean {
  // Check if the Chinese content contains actual Chinese characters
  return /[\u4e00-\u9fa5]/.test(message.contentZH);
}
