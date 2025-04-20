export async function transcribeSpeech(audio: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', audio, 'audio.webm');
    formData.append('model', 'whisper-1');
  
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });
  
    const data = await res.json();
    return data.text;
  }
  