"use client";

import React, { useState } from "react";
import { handleCustomTask } from "@/ai-calls/handleCustomTask";

export default function VoiceAssistant() {
  const [customInstruction, setCustomInstruction] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [callHistory, setCallHistory] = useState<string[]>([]);

  const handleSimulateCall = async () => {
    if (!customInstruction.trim()) return;

    try {
      setIsProcessing(true);
      const content = await handleCustomTask(customInstruction);
      setCallHistory((prev) => [content, ...prev.slice(0, 4)]); // 最多保留5条
      setCustomInstruction("");
    } catch (error) {
      console.error("❌ 通话失败:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white shadow-md rounded-xl">
      <h1 className="text-2xl font-bold text-center text-gray-800 mb-4">AI 语音助手</h1>

      <label className="block text-sm font-medium text-gray-700 mb-1">任务说明</label>
      <textarea
        className="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        rows={4}
        placeholder="请输入您想让 AI 执行的任务说明..."
        value={customInstruction}
        onChange={(e) => setCustomInstruction(e.target.value)}
      />

      <button
        onClick={handleSimulateCall}
        disabled={isProcessing}
        className="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {isProcessing ? "处理中..." : "开始通话"}
      </button>

      {callHistory.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">历史记录</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {callHistory.map((entry, index) => (
              <li key={index} className="p-2 rounded-md bg-gray-50 border border-gray-200">
                {entry}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
