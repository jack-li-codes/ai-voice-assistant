"use client";

import { useState } from "react";
import { handleCustomTask } from "@/ai-calls/handleCustomTask";
import { speakWithElevenLabs } from "@/lib/tts";

export default function VoiceAssistant() {
  const [mode, setMode] = useState("face-to-face");
  const [background, setBackground] = useState("我是[你的身份]。当前我正在与[医生/老师/银行人员等]进行交流。\n\n以下是对话背景：[请在此补充事件的来龙去脉，例如孩子头晕、账户问题、投诉等]。\n\n请你作为我的 AI 小秘书协助我与对方进行沟通。无论对方说中文或英文，都请你自然地用英文代表我进行回答，语气专业、礼貌、简洁，像一个真实的人在说话。");
  const [taskInput, setTaskInput] = useState("");
  const [speakerRole, setSpeakerRole] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);

  const generatePrompt = () => {
    switch (mode) {
      case "make-call":
        return `你是一个 AI 秘书。你正在代替用户打电话沟通。以下是对话背景：${background}。现在用户正在和 ${speakerRole} 通话。对方说：“${taskInput}”。请模拟自然的电话回复。`;
      case "receive-call":
        return `你是一个 AI 秘书。你正在代替用户接听电话。以下是背景信息：${background}。电话对方是 ${speakerRole}，刚刚说：“${taskInput}”。请用英文模拟人类自然语气回应。`;
      case "face-to-face":
      default:
        return `你是一个 AI 秘书。现在你正陪同用户面对面与 ${speakerRole} 沟通。背景是：${background}。对方刚刚说：“${taskInput}”。请根据上下文自然回应。`;
    }
  };

  const handleSimulateCall = async () => {
    if (!background.trim() || !taskInput.trim() || !speakerRole.trim()) return;

    const userMsg = { role: "user" as const, text: `${speakerRole}说：${taskInput}` };
    setMessages((prev) => [...prev, userMsg]);

    const contextPrompt = generatePrompt();
    const openingLine = await handleCustomTask(contextPrompt);
    await speakWithElevenLabs(openingLine);
    setMessages((prev) => [...prev, { role: "ai", text: openingLine }]);

    setTaskInput("");
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">使用模式</label>
        <select
          className="w-full border rounded p-2"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="face-to-face">🧍 面对面沟通</option>
          <option value="make-call">📞 代打电话</option>
          <option value="receive-call">📲 接听电话</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">背景信息</label>
        <textarea
          className="w-full border rounded p-2"
          rows={6}
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
