export const runtime = "nodejs"; // ✅ 强制 Node.js Runtime

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "kdmDKE6EkgrWrrykO9Qt";

    if (!apiKey) {
      console.error("❌ ELEVENLABS_API_KEY not set");
      return NextResponse.json(
        { error: "Missing ElevenLabs API key" },
        { status: 500 }
      );
    }

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          // ✅ 更稳：通用模型，避免 monolingual 在某些账号/声音/语言下报错
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.5,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text(); // ✅ 读出 ElevenLabs 原始错误
      console.error("❌ ElevenLabs API Error:", elevenRes.status, errText);

      // ✅ 关键：把真实原因返回给前端 Network -> Response
      return NextResponse.json(
        {
          error: "ElevenLabs API failed",
          status: elevenRes.status,
          details: errText,
          voiceId,
          model_id: "eleven_multilingual_v2",
        },
        { status: 500 }
      );
    }

    const audioBuffer = await elevenRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("❌ TTS Route Fatal Error:", err);
    return NextResponse.json(
      { error: "TTS internal error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
