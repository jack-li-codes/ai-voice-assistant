import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { text } = await req.json();

  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'kdmDKE6EkgrWrrykO9Qt';

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!res.ok) {
    console.error('❌ ElevenLabs API Error:', res.statusText);
    return new NextResponse(JSON.stringify({ error: 'ElevenLabs Error' }), { status: 500 });
  }

  const audioBuffer = await res.arrayBuffer();

  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
