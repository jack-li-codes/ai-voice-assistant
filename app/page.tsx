'use client';

import LiveConversation from '@/app/components/LiveConversation';

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black p-6 space-y-4">
      <h1 className="text-2xl font-bold text-blue-700">
        AI秘书语音对话测试 / AI Secretary — Live Conversation
      </h1>

      <p className="text-gray-700 text-sm leading-6">
        中文说明：点击「开始对话」，对方可以直接说话（中英文皆可），
        AI 会自动帮你理解，对外用自然的英文替你回答。
        <br />
        <span className="text-gray-600">
          EN: Click "Start". The other person can speak freely in English or Chinese.
          The AI understands you in Chinese and replies in fluent English on your behalf.
        </span>
      </p>

      <LiveConversation />
    </main>
  );
}
