"use client";

import { useState, useRef, useEffect } from "react";
//import ChatBubble from "./components/ChatBubble";
import ChatBubble from "./ChatBubble";



// @ts-ignore
const SpeechRecognition =
  typeof window !== "undefined" &&
  ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export default function VoiceAssistant() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<
    { sender: "user" | "ai"; text: string }[]
  >([]);
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
        console.log('语音识别结果:', text);

        if (!text) {
          console.warn('语音识别结果为空');
          return;
        }

        // 添加用户发言
        setMessages((prev) => [...prev, { sender: "user", text }]);

        // 调用 GPT 接口
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });

        if (!res.ok) {
          throw new Error(`GPT 接口请求失败: ${res.status} ${res.statusText}`);
        }

        const data = await res.text();
        console.log('GPT 回复:', data);

        if (!data) {
          console.warn('GPT 回复为空');
          return;
        }

        // 添加 AI 回复
        setMessages((prev) => [...prev, { sender: "ai", text: data }]);

        // 语音播放回复
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(data);
        utterance.lang = "zh-CN";
        
        // 确保语音合成可用
        if (synth.speaking) {
          console.log('正在播放语音，等待完成...');
          synth.cancel();
        }

        utterance.onend = () => {
          console.log('语音播放完成');
        };

        utterance.onerror = (event) => {
          console.error('语音播放出错:', event);
        };

        synth.speak(utterance);
      } catch (error) {
        console.error('处理语音识别结果时出错:', error);
        // 添加错误提示到消息列表
        setMessages((prev) => [...prev, { 
          sender: "ai", 
          text: "抱歉，处理您的请求时出现了问题，请稍后再试。" 
        }]);
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
    <div className="mt-8 text-center space-y-4">
      <button
        onClick={handleClick}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg shadow-md hover:bg-blue-700 transition"
      >
        🎤 {isRecording ? "正在录音..." : "点击开始说话"}
      </button>

      {/* 语音识别动画 */}
      {isRecording && (
        <div className="flex justify-center space-x-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}

      <div className="max-w-md w-full mx-auto mt-4 px-4">
        {messages.map((msg, idx) => (
          <ChatBubble key={idx} sender={msg.sender} text={msg.text} />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
