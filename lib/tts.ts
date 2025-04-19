// lib/tts.ts

const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
const voiceId = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID;

console.log("🔍 当前 ElevenLabs API Key:", apiKey ? "✅ 已设置" : "❌ 缺失");
console.log("🔍 当前 Voice ID:", voiceId ? `✅ ${voiceId}` : "❌ 缺失");

export async function speakWithElevenLabs(text: string) {
  if (!apiKey || !voiceId) {
    console.error("❌ 请检查 .env.local 中的 NEXT_PUBLIC_ELEVENLABS_API_KEY 和 VOICE_ID 是否正确设置");
    return;
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!res.ok) {
      const errorMsg = await res.text();
      console.error("🛑 ElevenLabs 请求失败:", res.status, errorMsg);
      return;
    }

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    await audio.play();
    console.log("🔊 播放完成");
  } catch (err) {
    console.error("❌ ElevenLabs 合成出错:", err);
  }
}
