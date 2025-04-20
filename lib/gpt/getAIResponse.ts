export async function getAIResponse(text: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: '你是一个代表用户进行英文对话的 AI 助手。请尽量自然地回复。' },
          { role: 'user', content: text },
        ],
      }),
    });
  
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }
  