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
        </div>

        <LiveConversation />
      </section>
    </main>
  );
}
