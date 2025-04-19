// app/api/chat/route.ts

export async function POST(req: Request) {
  const { messages } = await req.json();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4", // 也可以改成 "gpt-3.5-turbo"
      messages,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("❌ OpenAI API Error:", data);
    return new Response(JSON.stringify({ error: data }), { status: res.status });
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
