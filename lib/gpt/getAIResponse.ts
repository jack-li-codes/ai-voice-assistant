// lib/gpt/getAIResponse.ts
export async function getAIResponse({
  systemMessage,
  userMessage,
}: { systemMessage: string; userMessage: string }): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      // 如需更稳，可调低温度：
      // temperature: 0.5,
    }),
  });

  const data = await res.json();
  return data.choices[0].message.content.trim();
}
