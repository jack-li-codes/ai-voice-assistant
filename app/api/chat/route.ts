// app/api/chat/route.ts

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Fast model
        messages,
        max_tokens: 200, // Limit response length
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("❌ OpenAI API Error:", data);
      return new Response(JSON.stringify({ error: data }), { status: res.status });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Chat API Error:", error?.message);
    return new Response(
      JSON.stringify({ error: "Request timeout or network error" }),
      { status: 500 }
    );
  }
}
