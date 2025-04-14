// app/api/chat/route.ts

import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';
import { speakWithElevenLabs } from '@/lib/tts';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    // ✅ 可选：将用户输入用 ElevenLabs 发音合成一段音频（可删掉这行测试语音）
   // await speakWithElevenLabs(prompt);

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: [
        {
          role: 'system',
          content: '你是一个模拟面试助手，请帮助用户准备 HR 面试',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const stream = OpenAIStream(response as any);
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("❌ GPT 接口调用失败:", error);
    return new Response("抱歉，处理请求时出错，请稍后再试。", { status: 500 });
  }
}
