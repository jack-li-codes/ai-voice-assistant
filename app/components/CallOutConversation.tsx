// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import { getAIResponse } from '@/lib/gpt/getAIResponse';
import { speakWithElevenLabs } from '@/lib/voice/speakWithElevenLabs';
import ManualInputBox from './ManualInputBox';
import MicSelector from './MicSelector';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

export default function CallOutConversation() {
  const [conversation, setConversation] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);

  const createNewRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.continuous = true;
    return recognition;
  };

  const restartRecognition = () => {
    const newRecog = createNewRecognition();

    newRecog.onresult = async (event: SpeechRecognitionEvent) => {
      if (isSpeakingRef.current || !isActive) return;
      const userText = event.results[event.results.length - 1][0].transcript.trim();
      if (!userText) return;

      setConversation((prev) => [...prev, `🧑 医生: ${userText}`]);

      const prompt = `
你是 Lucy，请直接用自然简洁的英文回答医生刚才说的内容，不要解释你是谁，也不要提及AI或秘书。
医生刚才说: ${userText}
`;

      const reply = await getAIResponse(prompt);
      setConversation((prev) => [...prev, `🤖 Lucy: ${reply}`]);

      if (recognitionRef.current) recognitionRef.current.stop();
      isSpeakingRef.current = true;

      try {
        await speakWithElevenLabs(reply);
      } catch (err) {
        console.error('语音播报失败:', err);
      } finally {
        isSpeakingRef.current = false;
        restartRecognition();
        recognitionRef.current.start();
      }
    };

    newRecog.onerror = (event: any) => console.error('识别出错:', event.error);
    newRecog.onend = () => {
      if (isActive && !isSpeakingRef.current) {
        try {
          newRecog.start();
        } catch (err) {
          console.error('重启失败:', err);
        }
      }
    };

    recognitionRef.current = newRecog;
  };

  useEffect(() => {
    if (isActive) {
      restartRecognition();
      recognitionRef.current?.start();
    } else {
      recognitionRef.current?.stop();
    }
  }, [isActive]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-purple-700">📞 拨打电话模式</h2>

      <MicSelector
        className="mb-2"
        onSelected={(id) => {
          // 只记录，不改变原流程
          // 未来如果用 getUserMedia 录音（非 WebSpeech），这里可以接入 deviceId
          console.log("Preferred mic deviceId:", id);
        }}
      />

      <button
        onClick={() => setIsActive((v) => !v)}
        className={`px-4 py-2 rounded text-white ${isActive ? 'bg-red-600' : 'bg-green-600'}`}
      >
        {isActive ? '停止通话' : '开始通话'}
      </button>

      <div className="bg-gray-100 p-4 rounded h-64 overflow-y-auto space-y-1 text-sm">
        {conversation.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>

      <ManualInputBox
        onSend={(text) => {
          setConversation((prev) => [...prev, `🧑 Lucy（手动）：${text}`]);
        }}
      />
    </div>
  );
}
