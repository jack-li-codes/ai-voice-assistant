export const runtime = "nodejs"; // ✅ 关键：强制 Node.js Runtime

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId =
      process.env.ELEVENLABS_VOICE_ID || "kdmDKE6EkgrWrrykO9Qt";

    if (!apiKey) {
      console.error("❌ ELEVENLABS_API_KEY not set");
      return NextResponse.json(
        { error: "Missing ElevenLabs API key" },
        { status: 500 }
      );
    }

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.5,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("❌ ElevenLabs API Error:", errText);
      return NextResponse.json(
        { error: "ElevenLabs API failed" },
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
  } catch (err) {
    console.error("❌ TTS Route Fatal Error:", err);
    return NextResponse.json(
      { error: "TTS internal error" },
      { status: 500 }
    );
  }
}
