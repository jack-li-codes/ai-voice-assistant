"use client";

import { useState, useRef, useEffect } from "react";
import ChatBubble from "./ChatBubble";
import { Button } from "@/components/ui/button";
import { speakWithElevenLabs } from "@/lib/tts";

type Message = {
  sender: "user" | "ai";
  text: string;
  isLoading?: boolean;
};

// @ts-ignore
const SpeechRecognition =
  typeof window !== "undefined" &&
  ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export default function VoiceAssistant() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleClick = () => {
    if (!SpeechRecognition) {
      alert("你的浏览器不支持语音识别，请使用 Chrome 浏览器");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = async (event: any) => {
      try {
        const text = event.results[0][0].transcript;
        if (!text) return;

        setMessages((prev) => [
          ...prev,
          { sender: "user", text },
          { sender: "ai", text: "", isLoading: true },
        ]);

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });

        if (!res.ok) {
          throw new Error(`GPT 请求失败: ${res.status}`);
        }

        const data = await res.text();

        setMessages((prev) => {
          const updated = [...prev];
          const aiIndex = updated.findIndex((m, i) => i === updated.length - 1 && m.sender === "ai" && m.isLoading);
          if (aiIndex !== -1) {
            updated[aiIndex] = { sender: "ai", text: data };
          }
          return updated;
        });

        await speakWithElevenLabs(data);
      } catch (error) {
        console.error("出错:", error);
        setMessages((prev) => [
          ...prev.filter((m) => !m.isLoading),
          { sender: "ai", text: "抱歉，AI 暂时无法回答，请稍后再试。" },
        ]);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("语音识别出错:", event.error);
      alert("语音识别出错：" + event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col items-center justify-start p-6 space-y-6">
      <h1 className="text-4xl font-bold text-gray-900">AI 面试助手</h1>

      <Button
        onClick={handleClick}
        size="lg"
        className={`$${
          isRecording ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
        } text-white px-8 py-6 rounded-lg text-lg shadow-md transition-colors`}
      >
        🎤 {isRecording ? "正在录音..." : "点击开始说话"}
      </Button>

      {isRecording && (
        <div className="flex justify-center space-x-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}

      <div className="max-w-2xl w-full mx-auto space-y-4 px-4">
        {messages.map((msg, idx) => (
          <ChatBubble key={idx} sender={msg.sender} text={msg.text} isLoading={msg.isLoading} />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
