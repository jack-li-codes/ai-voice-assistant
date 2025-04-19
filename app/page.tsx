"use client";

import VoiceAssistant from "./components/VoiceAssistant";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-50 text-gray-900">
      <h1 className="text-3xl font-bold mb-6">AI 语音助手</h1>
      <div className="bg-white p-6 rounded-xl shadow-md w-full max-w-md text-center">
        {/* 渲染新版多场景助手 UI */}
        <VoiceAssistant />
      </div>
    </main>
  );
}
