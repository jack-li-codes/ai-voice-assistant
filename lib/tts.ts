// lib/tts.ts

const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
const voiceId = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID;

console.log("🔍 当前 API KEY:", JSON.stringify(apiKey));
console.log("🔍 当前 VOICE ID:", JSON.stringify(voiceId));


export async function speakWithElevenLabs(text: string) {
  if (!apiKey || !voiceId) {
    throw new Error("❌ 请配置 ElevenLabs API Key 和 Voice ID");
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`❌ 语音合成失败：${response.statusText}`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  await audio.play();
}
