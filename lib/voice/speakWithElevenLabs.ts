// lib/voice/speakWithElevenLabs.ts
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopCurrentSpeech() {
  try {
    if (currentAudio) {
      currentAudio.pause();
      // 让 iOS/Safari 也立即停
      try { currentAudio.currentTime = 0; } catch {}
      currentAudio.src = ""; // 释放引用
    }
  } catch {}
  try {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
  } catch {}
  currentAudio = null;
  currentUrl = null;
}

export async function speakWithElevenLabs(text: string) {
  // 播放前先打断上一段
  stopCurrentSpeech();

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error("❌ 本地代理 TTS API 错误");
    return;
  }

  const blob = await res.blob();
  currentUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentUrl);

  currentAudio.onended = () => stopCurrentSpeech();
  currentAudio.onerror = () => stopCurrentSpeech();

  try {
    await currentAudio.play();
    console.log("✅ 语音播放成功");
  } catch (err) {
    console.error("🔴 播放失败:", err);
    stopCurrentSpeech();
  }
}
