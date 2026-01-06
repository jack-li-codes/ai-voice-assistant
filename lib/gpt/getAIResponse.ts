// lib/gpt/getAIResponse.ts
const FALLBACK_RESPONSE = "I understand. Let me get back to you on that.";

export async function getAIResponse({
  systemMessage,
  userMessage,
}: { systemMessage: string; userMessage: string }): Promise<string> {
  try {
    // Call our API route instead of OpenAI directly (security: no client-side API key)
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) {
      console.error('[GPT] API error:', res.status);
      return FALLBACK_RESPONSE;
    }

    const data = await res.json();
    return data.choices[0]?.message?.content?.trim() || FALLBACK_RESPONSE;
  } catch (error: any) {
    // Timeout or network error
    console.error('[GPT] Error:', error?.name, error?.message);
    return FALLBACK_RESPONSE;
  }
}
