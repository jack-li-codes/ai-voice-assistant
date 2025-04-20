export async function speakWithElevenLabs(text: string) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error('❌ 本地代理 TTS API 错误');
    return;
  }

  const blob = await res.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);

  try {
    await audio.play();
    console.log('✅ 语音播放成功');
  } catch (err) {
    console.error('🔴 播放失败:', err);
  }
}
