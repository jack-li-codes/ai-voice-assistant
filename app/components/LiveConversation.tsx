// ✅ 最终稳定修复版 LiveConversation.tsx（已解决识别器无法重启 + 多轮识别不生效问题）

'use client';

import { useEffect, useRef, useState } from 'react';
import { getAIResponse } from '@/lib/gpt/getAIResponse';
import { speakWithElevenLabs } from '@/lib/voice/speakWithElevenLabs';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

export default function LiveConversation() {
  const [mode, setMode] = useState('face-to-face');
  const [background, setBackground] = useState('');
  const [speakerRole, setSpeakerRole] = useState('');
  const [conversation, setConversation] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);

  // 初始化识别器
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

    newRecog.onstart = () => console.log('✅ recognition.onstart 被触发，监听已开启');

    newRecog.onresult = async (event: SpeechRecognitionEvent) => {
      if (isSpeakingRef.current || !isActive) return;
      const userText = event.results[event.results.length - 1][0].transcript;
      setConversation((prev) => [...prev, `🧑 对方: ${userText}`]);

      const systemPrompt = `
你是James的爸爸，请以他的身份用自然流畅、专业礼貌的英文回答医生的问题。不要解释你是谁，不要提及AI或秘书。请始终参考以下背景信息后再作答：

🎯 背景说明:
- 当前沟通模式: ${mode}
- 对方身份: ${speakerRole}
- 场景背景: ${background}

💬 医生刚才说: ${userText}

🧠 你的任务:
- 只代表James的爸爸回答。
- 用清晰、真实、简洁的英文表达。
- 不要重复背景信息，不要解释身份。
- 回应医生刚刚那句话，不要一次说太多。
      `;

      const reply = await getAIResponse(systemPrompt);
      setConversation((prev) => [...prev, `🤖 AI: ${reply}`]);

      if (recognitionRef.current) recognitionRef.current.stop();
      isSpeakingRef.current = true;
      console.log('🗣 开始播放语音...');

      try {
        await speakWithElevenLabs(reply);
        console.log('✅ 语音播放成功');
      } catch (error) {
        console.error('❌ 语音播放失败:', error);
      } finally {
        isSpeakingRef.current = false;
        console.log('✅ isSpeakingRef 重置为 false，准备重启识别器');
        restartRecognition();
        recognitionRef.current.start();
      }
    };

    newRecog.onerror = (event: any) => {
      console.error('❌ recognition.onerror:', event.error);
    };

    newRecog.onend = () => {
      console.log('📣 onend 被动触发，isActive:', isActive, '| isSpeakingRef:', isSpeakingRef.current);
      if (isActive && !isSpeakingRef.current) {
        try {
          newRecog.start();
          console.log('✅ 被动重启识别成功');
        } catch (err) {
          console.error('❌ 被动识别重启失败:', err);
        }
      }
    };

    recognitionRef.current = newRecog;
  };

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => console.log('🎤 麦克风权限已获取'))
      .catch(() => alert('❌ 获取麦克风失败，请检查权限'));
  }, []);

  useEffect(() => {
    if (isActive) {
      restartRecognition();
      try {
        recognitionRef.current?.start();
        console.log('🎧 正在启动识别...');
      } catch (error) {
        console.error('❌ 启动识别失败:', error);
      }
    } else {
      recognitionRef.current?.stop();
    }
  }, [isActive]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-blue-700">AI 秘书语音对话测试</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">使用模式</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="border px-3 py-2 rounded w-full"
        >
          <option value="face-to-face">面对面沟通</option>
          <option value="make-call">拨打电话</option>
          <option value="receive-call">接听电话</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">背景信息</label>
        <textarea
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          placeholder="请输入背景信息，例如你当前的位置、身份、目的等"
          className="border px-3 py-2 rounded w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">对方是谁（医生/老师/银行…）</label>
        <input
          value={speakerRole}
          onChange={(e) => setSpeakerRole(e.target.value)}
          placeholder="如 医生"
          className="border px-3 py-2 rounded w-full"
        />
      </div>

      <button
        onClick={() => setIsActive((v) => !v)}
        className={`px-4 py-2 rounded text-white ${isActive ? 'bg-red-500' : 'bg-green-600'}`}
      >
        {isActive ? '🛑 停止对话' : '🎤 启动对话'}
      </button>

      <div className="bg-gray-100 p-4 rounded space-y-2 h-64 overflow-y-auto">
        {conversation.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>
    </div>
  );
}
