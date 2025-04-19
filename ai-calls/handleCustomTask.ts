// ai-calls/handleCustomTask.ts

import { speakWithElevenLabs } from "@/lib/tts";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID!;
console.log("🔑 OPENAI_API_KEY:", OPENAI_API_KEY);
console.log("🏢 OPENAI_ORG_ID:", OPENAI_ORG_ID);

const GPT_MODEL = "gpt-4"; // You can change this to your preferred model

export async function handleCustomTask(customInstruction: string): Promise<string> {
  const messages = [
    {
      role: "system",
      content: "You are an AI assistant making a phone call in English. Be professional and concise.",
    },
    {
      role: "user",
      content: customInstruction,
    },
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Organization": OPENAI_ORG_ID,
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ GPT request failed:", data);
      throw new Error("Failed to generate call content");
    }

    const content = data.choices?.[0]?.message?.content?.trim() || "⚠️ No content returned";
    await speakWithElevenLabs(content);
    return content;
  } catch (error) {
    console.error("❌ Call failed:", error);
    throw error;
  }
}
