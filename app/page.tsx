'use client';

import LiveConversation from '@/app/components/LiveConversation';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-3 text-slate-950 md:px-5 md:py-4">
      <section className="mx-auto max-w-7xl space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            AI Communication Copilot
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">
            External brain for English conversations
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-5 text-slate-700">
            AI helps you understand and suggests what you can say. You stay in
            control. AI does not speak automatically.
          </p>
          <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-600">
            中文说明：实时听对方说话，显示字幕，帮你用中文理解意思，
            并给出自然英文提词。默认不会自动替你说话。
          </p>
        </div>

        <LiveConversation />
      </section>
    </main>
  );
}
