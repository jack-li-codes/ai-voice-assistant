// Translation utility for bilingual message support
// Uses existing GPT API to translate between Chinese and English

import { getAIResponse } from "./gpt/getAIResponse";

/**
 * Detect if text contains Chinese characters
 */
export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

/**
 * Translate text from English to Chinese using GPT
 */
async function translateToZH(enText: string): Promise<string> {
  try {
    const systemMessage = "You are a professional translator. Translate the given English text to natural, fluent Chinese. Only output the translation, no explanations.";
    const userMessage = `Translate this to Chinese:\n${enText}`;

    const result = await getAIResponse({ systemMessage, userMessage });
    return result.trim();
  } catch (error) {
    console.error("Translation to Chinese failed:", error);
    return enText; // Fallback to original text
  }
}

/**
 * Translate text from Chinese to English using GPT
 */
async function translateToEN(zhText: string): Promise<string> {
  try {
    const systemMessage = "You are a professional translator. Translate the given Chinese text to natural, fluent English. Only output the translation, no explanations.";
    const userMessage = `Translate this to English:\n${zhText}`;

    const result = await getAIResponse({ systemMessage, userMessage });
    return result.trim();
  } catch (error) {
    console.error("Translation to English failed:", error);
    return zhText; // Fallback to original text
  }
}

/**
 * Convert any text to bilingual format (EN + ZH)
 * Detects language automatically and translates accordingly
 *
 * @param text - Input text (Chinese or English)
 * @returns Object with both English and Chinese versions
 */
export async function toBilingual(text: string): Promise<{ en: string; zh: string }> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return { en: "", zh: "" };
  }

  // Detect if text contains Chinese characters
  const isChinese = hasChinese(trimmedText);

  if (isChinese) {
    // Original text is Chinese, translate to English
    const en = await translateToEN(trimmedText);
    return { en, zh: trimmedText };
  } else {
    // Original text is English, translate to Chinese
    const zh = await translateToZH(trimmedText);
    return { en: trimmedText, zh };
  }
}
