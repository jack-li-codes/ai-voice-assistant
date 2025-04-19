"use client";

import { useState } from "react";
import { handleCustomTask } from "@/ai-calls/handleCustomTask";
import { speakWithElevenLabs } from "@/lib/tts";

export default function VoiceAssistant() {
  const [background, setBackground] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [speakerRole, setSpeakerRole] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);

  const handleSimulateCall = async () => {
    if (!background.trim() || !taskInput.trim() || !speakerRole.trim()) return;

    const userMsg = { role: "user" as const, text: `${speakerRole}说：${taskInput}` };
    setMessages((prev) => [...prev, userMsg]);

    const contextPrompt = `你是一个 AI 秘书。当前场景如下：${background}。用户正在与 ${speakerRole} 对话。
对方刚刚说：「${taskInput}」。请根据上下文自然回应。`;

    const openingLine = await handleCustomTask(contextPrompt);
    await speakWithElevenLabs(openingLine);
    setMessages((prev) => [...prev, { role: "ai", text: openingLine }]);

    setTaskInput("");
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">背景信息</label>
        <textarea
          className="w-full border rounded p-2"
          rows={3}
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          placeholder="请输入完整背景，例如用户正在办理开户，医生是第一次见面..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">对方是谁（医生 / 老师 / 银行人员...）</label>
        <input
          type="text"
          className="w-full border rounded px-2 py-1"
          value={speakerRole}
          onChange={(e) => setSpeakerRole(e.target.value)}
          placeholder="请输入场景身份，例如医生"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">对方说了什么</label>
        <textarea
          className="w-full border rounded p-2"
          rows={3}
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          placeholder="请输入一句对方说的话..."
        />
      </div>

      <button
        onClick={handleSimulateCall}
        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
      >
        AI 回复一句
      </button>

      <div className="mt-6 space-y-2">
        <h2 className="font-semibold">历史记录</h2>
        {messages.map((msg, index) => (
          <div key={index} className="text-left">
            <span className="font-semibold">{msg.role === "ai" ? "🤖 AI" : "👤 对方"}：</span> {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}
