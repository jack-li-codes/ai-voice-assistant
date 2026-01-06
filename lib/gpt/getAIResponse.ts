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
      model: 'gpt-4o-mini', // 更快的模型，降低延迟
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 150, // 限制输出长度，缩短等待时间
      temperature: 0.7, // 保持自然响应
    }),
  });

  const data = await res.json();
  return data.choices[0].message.content.trim();
}
