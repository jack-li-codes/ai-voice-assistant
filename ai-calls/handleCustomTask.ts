// ai-calls/handleCustomTask.ts
import { speakWithElevenLabs } from "@/lib/tts";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID!;
const GPT_MODEL = "gpt-4";

// 存储上下文（可换成状态管理）
let messages: { role: "system" | "user" | "assistant"; content: string }[] = [
  {
    role: "system",
    content:
      "You are an AI assistant pretending to be Lucy, a patient talking to a doctor. Answer naturally and briefly.",
  },
];

export async function handleCustomTask(doctorSays: string): Promise<string> {
  messages.push({ role: "user", content: doctorSays });

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const data = await res.json();

    if (!res.ok) {
      console.error("❌ GPT请求失败：", data);
      throw new Error("生成通话内容失败");
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || "⚠️ 无内容返回";
    messages.push({ role: "assistant", content: reply });

    // await speakWithElevenLabs(reply);  // 注释掉这里的调用，因为 VoiceAssistant.tsx 中已经调用了
    return reply;
  } catch (err) {
    console.error("❌ 通话失败:", err);
    throw err;
  }
}
