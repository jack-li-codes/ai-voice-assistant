'use client';

import LiveConversation from '@/app/components/LiveConversation';

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black p-6 space-y-4">
      <h1 className="text-2xl font-bold text-blue-700">AI秘书语音对话测试</h1>

      <p className="text-gray-700">
        请点击“开始对话”，对方可以直接说话（中英文皆可），AI 会自动帮你理解并用英文代替你自然回应。
      </p>

      <LiveConversation />
    </main>
  );
}
