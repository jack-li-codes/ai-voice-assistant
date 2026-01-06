// lib/voice/speakWithElevenLabs.ts
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentAbort: AbortController | null = null;

export function stopCurrentSpeech() {
  // 中止正在进行的 fetch 请求
  try {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
  } catch {}

  // 停止音频播放
  try {
    if (currentAudio) {
      currentAudio.pause();
      // 让 iOS/Safari 也立即停
      try { currentAudio.currentTime = 0; } catch {}
      currentAudio.src = ""; // 释放引用
    }
  } catch {}

  // 释放 URL
  try {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
  } catch {}

  currentAudio = null;
  currentUrl = null;
}

export async function speakWithElevenLabs(text: string) {
  // 播放前先打断上一段
  stopCurrentSpeech();

  let fetchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let playbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const stopOnce = () => {
    if (stopped) return;
    stopped = true;
    stopCurrentSpeech();
  };

  try {
    // 创建新的 AbortController with timeout
    currentAbort = new AbortController();
    fetchTimeoutId = setTimeout(() => currentAbort?.abort(), 20000); // 20s fetch timeout

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: currentAbort.signal, // 使用 signal 支持中止
    });

    if (!res.ok) {
      console.error("❌ 本地代理 TTS API 错误:", res.status);
      return;
    }

    const blob = await res.blob();
    currentUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentUrl);

    // Add playback timeout (max 30s for any audio)
    playbackTimeoutId = setTimeout(() => {
      console.warn("⚠️ TTS playback timeout, stopping");
      if (playbackTimeoutId) clearTimeout(playbackTimeoutId);
      stopOnce();
    }, 30000);

    // Clear timeout only on ended/error (ensure stopCurrentSpeech runs exactly once)
    currentAudio.onended = () => {
      if (playbackTimeoutId) clearTimeout(playbackTimeoutId);
      stopOnce();
    };
    currentAudio.onerror = () => {
      if (playbackTimeoutId) clearTimeout(playbackTimeoutId);
      stopOnce();
    };

    await currentAudio.play();
    console.log("✅ 语音播放成功");
  } catch (err: any) {
    console.error("❌ TTS Error:", err?.name, err?.message);
    if (playbackTimeoutId) clearTimeout(playbackTimeoutId);
    stopOnce();
  } finally {
    // Always clear fetch timeout to prevent leak
    if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
  }
}
