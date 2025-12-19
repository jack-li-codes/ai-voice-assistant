"use client";

import { useEffect, useRef, useState } from "react";
import { getAIResponse } from "@/lib/gpt/getAIResponse";
import { speakWithElevenLabs, stopCurrentSpeech } from "@/lib/voice/speakWithElevenLabs";
import { toBilingual, hasChinese } from "@/lib/translate";
import { ChatMessage } from "@/lib/types/message";
import ManualInputBox from "./ManualInputBox";
import MicSelector from "./MicSelector";

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start: () => void;
    stop: () => void;
    onresult: ((ev: SpeechRecognitionEvent) => any) | null;
    onend: ((ev: Event) => any) | null;
    onerror: ((ev: any) => any) | null;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

/* ===================== Utils ===================== */
const hasCJK = (s: string) => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(s);
const pickASRLang = (hint: string) => (hasCJK(hint) ? "zh-CN" : "en-US");
const isGreeting = (t: string) =>
  /^(hi|hello|hey|how are you|哈(啰|罗)|你好)\b/i.test(t);

/** 判断文本是否有效（不是空文本或只有标点） */
const isMeaningfulText = (t: string) => {
  const s = (t || "").trim();
  if (s.length < 2) return false; // 阈值可调 2~5
  // 只有标点/空白也算无效
  if (/^[\s\W_]+$/.test(s)) return false;
  return true;
};

/** 判断是否是时间戳行：---- HH:MM ---- */
const isTimestampLine = (text: string): boolean => {
  return /^----\s?\d{2}:\d{2}\s?----$/.test((text || "").trim());
};

/** 从时间戳行提取 HH:MM */
const extractHHMM = (text: string): string | null => {
  const match = (text || "").match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
};

/** 从 GUIDE 中提取“我的名字”（可英文/中文），找不到就 null */
function extractNameFromGuide(guide: string): string | null {
  if (!guide) return null;
  const head = guide.split(/\r?\n/).slice(0, 60).join("\n");
  const patterns = [
    /my\s+name\s+is\s+([A-Z][a-zA-Z\-]+)/i,
    /i\s+am\s+([A-Z][a-zA-Z\-]+)/i,
    /name[:：]\s*([A-Z][a-zA-Z\-]+)/i,
    /你叫[:：]?\s*([A-Za-z\u4e00-\u9fa5]+)/i,
    /我是[:：]?\s*([A-Za-z\u4e00-\u9fa5]+)/i,
  ];
  for (const re of patterns) {
    const m = head.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/** 估算播报时长（毫秒）：每秒 ~2.2 词 + 300ms 余量 */
const estimateTtsMs = (text: string) => {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  const ms = (words / 2.2) * 1000 + 300;
  return Math.max(800, Math.min(ms, 15000));
};

/** 只播英文：去掉手动输入回显 & 中文行 */
function sanitizeForTTS(reply: string, recentManuals: string[]) {
  let out = reply || "";
  for (const m of recentManuals) {
    const mm = (m || "").trim();
    if (mm.length >= 6 && out.includes(mm)) out = out.split(mm).join("");
  }
  if (hasCJK(out)) {
    out = out
      .split("\n")
      .filter((line) => !hasCJK(line))
      .join("\n")
      .trim();
  }
  return out || "Noted.";
}

/** —— 文本相似度（回声过滤） —— */
const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const DROP = new Set([
  "a","an","the","to","and","of","for","on","in","at","by","that","this","it","is","are","was","were",
  "be","am","been","do","does","did","with","from","as","so","but","or","if","then","than","have","has","had",
  "i","you","we","they","he","she","my","your","our","their","me","us","him","her"
]);

const tokenSet = (s: string) => {
  const ts = normalize(s).split(" ").filter((x) => !!x);
  const set = new Set<string>();
  for (const t of ts) if (!DROP.has(t)) set.add(t);
  return set;
};

const jaccard = (setA: Set<string>, setB: Set<string>) => {
  let inter = 0;
  setA.forEach((token) => {
    if (setB.has(token)) inter++;
  });
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
};


function isEchoOfAI(partnerText: string, recentAI: string[], threshold = 0.55) {
  const a = tokenSet(partnerText);
  if (a.size < 3) return false;
  for (const r of recentAI) {
    const b = tokenSet(r);
    const sim = jaccard(a, b);
    if (sim >= threshold) return true;
  }
  return false;
}

/** 自我语音过滤：检测用户是否在读 AI 刚才的建议 (Live 模式专用) */
function isSimilarToLastAISuggestion(
  input: string,
  lastSuggested: string,
  lastSuggestedAt: number
): boolean {
  if (!lastSuggested) return false;

  // 时间窗口：10 秒内
  if (Date.now() - lastSuggestedAt > 10000) return false;

  const t1 = normalize(input);
  const t2 = normalize(lastSuggested);

  // 太短的输入不判断
  if (t1.length < 10) return false;

  // 包含关系：检查前 20 个字符是否匹配
  const prefix = t2.slice(0, 20);
  if (prefix && t1.includes(prefix)) return true;

  // Jaccard 相似度
  const set1 = tokenSet(input);
  const set2 = tokenSet(lastSuggested);
  const similarity = jaccard(set1, set2);

  return similarity > 0.7;
}

/** 是否把我叫错（根据动态 myName） */
function detectMisname(text: string, myName: string) {
  const name = (myName || "").trim();
  if (!name) return false;
  if (new RegExp(`\\b${name}\\b`, "i").test(text)) return false; // 已叫对
  if (/\b(hi|hello|hey)[, ]+([A-Za-z\u4e00-\u9fa5]+)\b/i.test(text)) return true;
  return false;
}

/* ===================== Component ===================== */
// 时间戳间隔常量（5分钟）
const FIVE_MIN_MS = 5 * 60 * 1000;

export default function LiveConversation() {
  // —— 表单 —— //
  const [mode, setMode] = useState("face-to-face");
  const [background, setBackground] = useState("");
  const [speakerRole, setSpeakerRole] = useState("");

  // Voice Output Mode: "LIVE" = 你说 (TTS OFF), "AGENT" = AI说 (TTS ON)
  const [voiceOutputMode, setVoiceOutputMode] = useState<"LIVE" | "AGENT">("LIVE");

  // UI 折叠控制
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 动态身份
  const [myName, setMyName] = useState("Lucy"); // 默认值，随时可改
  const [autoNameFromGuide, setAutoNameFromGuide] = useState(true);

  // 外放防回声模式（打/接电话建议开启）
  const [speakerMode, setSpeakerMode] = useState(true);

  // —— 对话与控制 —— //
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Notes 模式：自动时间戳
  const lastTimestampRef = useRef<number>(0);

  // 识别/播报控制
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isSpeakingRef = useRef(false);
  const correctedOnceRef = useRef(false);
  const manualInputsRef = useRef<string[]>([]);
  const lastResultAtRef = useRef<number>(0);
  const heartbeatTimerRef = useRef<number | null>(null);

  // 启动抖动保护
  const startAtRef = useRef<number>(0);
  const silenceTimerRef = useRef<number | null>(null);

  // 回声过滤：记录最近 3 条 AI 回复
  const recentAIRef = useRef<string[]>([]);

  // 只处理最终结果；防重复
  const lastFinalTextRef = useRef<string>("");

  // 播报后忽略窗口：重启识别后的一小段时间内丢弃任何结果
  const listeningResumedAtRef = useRef<number>(0);
  const markListeningResumed = () => { listeningResumedAtRef.current = Date.now(); };

  // 自我语音过滤：记录最近的 AI 建议文本（Live 模式专用）
  const lastAISuggestedTextRef = useRef<string>("");
  const lastAISuggestedAtRef = useRef<number>(0);

  // 根据 GUIDE 自动更新名字（可关闭）
  useEffect(() => {
    if (!autoNameFromGuide) return;
    const n = extractNameFromGuide(background);
    if (n && n !== myName) setMyName(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background, autoNameFromGuide]);

  /* 检查并插入时间戳（仅 Notes 模式） */
  const maybeInsertTimestamp = (forceIfAfter30s = false) => {
    if (mode !== "notes") return;

    const now = Date.now();
    const elapsed = now - lastTimestampRef.current;

    // 任务 2：手动插入时间戳（30 秒间隔限制）
    if (forceIfAfter30s) {
      if (lastTimestampRef.current !== 0 && elapsed < 30000) {
        console.log("[Notes] 距离上次时间戳不足 30 秒，跳过插入");
        return;
      }
      // 继续执行插入逻辑
    } else {
      // 自动插入：首次或超过 5 分钟才插入
      if (lastTimestampRef.current !== 0 && elapsed < FIVE_MIN_MS) {
        return;
      }
    }

    // 统一的时间戳插入逻辑
    const timeStr = new Date(now).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const timestampMsg: ChatMessage = {
      id: `timestamp-${now}`,
      role: "user", // 使用 user role，但通过内容格式识别
      contentEN: `---- ${timeStr} ----`,
      contentZH: `---- ${timeStr} ----`,
      timestamp: now,
    };

    setConversation((prev) => [...prev, timestampMsg]);
    lastTimestampRef.current = now;
  };

  /* 统一提交入口：防止空提交产生 "noted" */
  const finalizeAndSubmit = async (text: string, reason: string) => {
    if (!isMeaningfulText(text)) {
      // 无效文本：不要发 GPT，不要生成 "noted"
      console.log("[ASR] skip submit (empty/short)", { reason, text });
      return;
    }

    // 清理静音计时器
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Notes 模式：只做回声过滤（更宽松），然后仅保存转写，不调用 AI
    const isNotesMode = mode === "notes";

    if (isNotesMode) {
      // Notes 模式下也做回声过滤，防止重复保存
      const echoThreshold = 0.50; // 宽松阈值
      if (isEchoOfAI(text, recentAIRef.current, echoThreshold)) {
        console.log("[Notes] skip (echo detected)", { reason, text });
        return;
      }

      // 插入时间戳（如果需要）
      maybeInsertTimestamp();

      // 只保存转写，不调用 AI
      const partnerBilingual = await toBilingual(text);
      const partnerMsg: ChatMessage = {
        id: `partner-${Date.now()}`,
        role: "user",
        contentEN: partnerBilingual.en,
        contentZH: partnerBilingual.zh,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, partnerMsg]);
      console.log("[Notes] transcript saved:", text);
      return; // 不调用 AI
    }

    // 非 Notes 模式：常规回声过滤
    const echoThreshold = speakerMode ? 0.50 : 0.55;
    if (isEchoOfAI(text, recentAIRef.current, echoThreshold)) {
      console.log("[ASR] skip submit (echo detected)", { reason, text });
      return;
    }

    // Create bilingual message for partner's speech
    const partnerBilingual = await toBilingual(text);
    const partnerMsg: ChatMessage = {
      id: `partner-${Date.now()}`,
      role: "user",
      contentEN: partnerBilingual.en,
      contentZH: partnerBilingual.zh,
      timestamp: Date.now(),
    };
    setConversation((prev) => [...prev, partnerMsg]);

    // —— 名字误叫，仅纠一次 —— //
    const mustCorrectOnce = detectMisname(text, myName) && !correctedOnceRef.current;

    // —— 轻量上下文 —— //
    const recent = conversation.slice(-4).map(msg =>
      `${msg.role === 'user' ? '🧑 Partner' : '🤖 AI'}: ${msg.contentEN}`
    ).join("\n") || "(none)";

    // —— 系统提示（动态身份 + 英文 + 模式区分） —— //
    const persona = (myName || "Speaker").trim();
    const isLiveMode = voiceOutputMode === "LIVE";

    const systemMessage = isLiveMode
      ? `
You are my real-time conversation assistant. Provide natural English suggestions that I can say directly.
My name is "${persona}". Always write suggestions in FIRST PERSON as ${persona} (not as an AI).
Generate short, natural, spoken phrases (1-3 sentences) that sound like a real person talking.
If I lack information, suggest safe fallback phrases like:
- "I don't have the exact number in front of me, but I can follow up right after this."
- "Let me double-check that and get back to you."

NEVER mention AI, assistant, or reveal automated help. Sound completely natural.

GUIDE (context if present):
${background ? `"""\n${background}\n"""` : "(empty)"}

Context:
- Mode: ${mode || "N/A"}
- Counterparty: ${speakerRole || "N/A"}
`.trim()
      : `
You are my real-time voice proxy. Always reply in ENGLISH (even if inputs are Chinese).
Your persona name is "${persona}". NEVER claim to be anyone else.
If the partner misnames you, correct ONCE with: "Hi — this is ${persona}." then continue.
Do NOT reveal you are an assistant. Be natural, concise, professional (1–3 sentences).
Avoid repeating the same point; move the conversation forward with one crisp question or update.
Never echo my manual notes verbatim; paraphrase naturally.

GUIDE (verbatim if present):
${background ? `"""\n${background}\n"""` : "(empty)"}

Context:
- Mode: ${mode || "N/A"}
- Counterparty: ${speakerRole || "N/A"}
`.trim();

    const userMessage = isLiveMode
      ? `
Recent lines:
${recent}

Partner just said:
${text}

Task:
Generate ONLY what I should say next in ENGLISH (1-3 natural sentences, first-person as ${persona}).
Do not explain or add commentary. Just provide the suggested reply I can read aloud.
`.trim()
      : `
Recent lines:
${recent}

New partner line:
${text}

Task:
1) Reply in ENGLISH only, first-person as ${persona}, 1–3 sentences.
2) If this line is another greeting, transition to ONE concrete topic rather than repeating greetings.
3) Paraphrase; do not mirror the user's words.
`.trim();

    let finalUserMessage = userMessage;
    if (mustCorrectOnce) {
      finalUserMessage += `\nAlso: Begin with exactly: "Hi — this is ${persona}." once, then continue.`;
    }

    try {
      const reply = await getAIResponse({ systemMessage, userMessage: finalUserMessage });

      // 记录最近 3 条 AI 回复，供回声过滤
      recentAIRef.current = [reply, ...recentAIRef.current].slice(0, 3);

      // 自我语音过滤：在 Live 模式下保存标准化的 AI 建议
      if (isLiveMode) {
        lastAISuggestedTextRef.current = normalize(reply);
        lastAISuggestedAtRef.current = Date.now();
      }

      // Translate AI's English reply to Chinese
      const aiZH = await toBilingual(reply).then(b => b.zh);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        contentEN: reply,
        contentZH: aiZH,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, aiMsg]);

      // —— 播报窗口锁定（仅 Agent 模式） —— //
      if (voiceOutputMode === "AGENT") {
        const recog2 = recognitionRef.current;
        const safeReply = sanitizeForTTS(reply, manualInputsRef.current);
        const speakMs = estimateTtsMs(safeReply);
        const extra = speakerMode ? 700 : 300;
        isSpeakingRef.current = true;
        try { recog2?.stop(); } catch {}
        await speakWithElevenLabs(safeReply);
        await new Promise((r) => setTimeout(r, speakMs + extra));
      }
      // Live 模式：不播报，AI 只是生成建议
    } catch (e) {
      console.error("❌ generate/speak error:", e);
    } finally {
      isSpeakingRef.current = false;
      if (voiceOutputMode === "AGENT") {
        try { recognitionRef.current?.start(); markListeningResumed(); } catch {}
      }
    }

    if (mustCorrectOnce) correctedOnceRef.current = true;
  };

  /* 识别器 */
  const ensureRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;

    const SR: any = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.error("This browser does not support Web Speech API.");
      return null;
    }

    const recog: SpeechRecognition = new SR();
    recog.lang = "en-US";        // 初始固定英文
    recog.interimResults = true; // 允许中间结果，但我们只吃 isFinal
    recog.continuous = true;

    recog.onresult = async (event: SpeechRecognitionEvent) => {
      if (!isActive) return;
      if (isSpeakingRef.current) return;

      // 播报刚结束后的忽略窗口（外放稍长）
      const IGNORE_WINDOW_MS = speakerMode ? 1800 : 1200;
      if (Date.now() - listeningResumedAtRef.current < IGNORE_WINDOW_MS) return;

      // 更新时间戳并重置静音计时器
      lastResultAtRef.current = Date.now();

      // 清理并重新设置静音计时器（1s 无新结果，强制提交）
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
      }

      // 取最后一个 isFinal=true 的结果
      let finalText = "";
      for (let i = event.results.length - 1; i >= 0; i--) {
        const res: any = event.results[i];
        if (res.isFinal) {
          finalText = res[0]?.transcript?.trim?.() || "";
          break;
        }
      }

      if (!finalText) {
        // 即使没有 final text，也要设置静音计时器
        silenceTimerRef.current = window.setTimeout(() => {
          // 1s 无新结果，尝试提交（如果有积累的 text）
          // 这里我们没有积累机制，所以只是清理
          silenceTimerRef.current = null;
        }, 1000);
        return;
      }

      // 启动抖动保护：启动后 800ms 内的短文本直接忽略
      const now = Date.now();
      const warmup = now - startAtRef.current < 800;
      if (warmup && !isMeaningfulText(finalText)) {
        console.log("[ASR] warmup ignore:", finalText);
        return;
      }

      // 设置静音计时器
      silenceTimerRef.current = window.setTimeout(() => {
        // 这里不需要再次提交，因为 finalText 已经在下面处理了
        silenceTimerRef.current = null;
      }, 1000);

      // 自我语音过滤：在 Live 模式下，如果用户在读 AI 的建议，丢弃这段输入
      if (voiceOutputMode === "LIVE") {
        if (
          isSimilarToLastAISuggestion(
            finalText,
            lastAISuggestedTextRef.current,
            lastAISuggestedAtRef.current
          )
        ) {
          // 静默丢弃，不做任何提示
          return;
        }
      }

      // 只基于当前文本切语言（含中文才切中文）
      const want = pickASRLang(finalText);
      if (recog.lang !== want) {
        try { recog.stop(); } catch {}
        recog.lang = want;
        try { recog.start(); markListeningResumed(); } catch {}
      }

      // 去重：和上次"最终文本"几乎一致就丢弃
      const lastFinal = lastFinalTextRef.current;
      const almostSame =
        finalText === lastFinal ||
        (finalText.length > 5 &&
          lastFinal.length > 5 &&
          (finalText.startsWith(lastFinal) || lastFinal.startsWith(finalText)));
      if (almostSame) return;
      lastFinalTextRef.current = finalText;

      // 调用统一提交入口
      await finalizeAndSubmit(finalText, "onresult-final");
    };

    recog.onerror = (e: any) => {
      console.error("recognition.onerror:", e?.error || e);
    };

    recog.onend = () => {
      // 清理静音计时器
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      // 重启识别（如果还在活跃状态）
      if (isActive && !isSpeakingRef.current) {
        try { recognitionRef.current?.start(); markListeningResumed(); } catch {}
      }
    };

    recognitionRef.current = recog;
    return recog;
  };

  const safeStart = () => {
    startAtRef.current = Date.now(); // 记录启动时间
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try { ensureRecognition()?.start(); markListeningResumed(); } catch {}
  };
  const safeStop = () => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try { recognitionRef.current?.stop(); } catch {}
  };
  const destroyRecognition = () => {
    try {
      if (recognitionRef.current) {
        (recognitionRef.current as any).onresult = null;
        (recognitionRef.current as any).onend = null;
        (recognitionRef.current as any).onerror = null;
        try { recognitionRef.current.stop(); } catch {}
      }
    } finally { recognitionRef.current = null; }
  };

  // mic 权限 + 回声/降噪（外放也有帮助）
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } as any
    })
      .then(() => console.log("🎤 mic granted"))
      .catch(() => alert("❌ Microphone permission denied"));
  }, []);

  // 心跳兜底：20s 无结果 -> 强制重启并切回英文
  useEffect(() => {
    if (!isActive) return;
    lastResultAtRef.current = Date.now();
    heartbeatTimerRef.current = window.setInterval(() => {
      if (!isActive) return;
      const idleMs = Date.now() - lastResultAtRef.current;
      if (idleMs > 20000 && !isSpeakingRef.current) {
        try { recognitionRef.current?.stop(); } catch {}
        try {
          if (recognitionRef.current) (recognitionRef.current as any).lang = "en-US";
          recognitionRef.current?.start();
          markListeningResumed();
        } catch {}
      }
    }, 5000) as unknown as number;

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current as number);
        heartbeatTimerRef.current = null;
      }
    };
  }, [isActive]);

  // 开/停
  useEffect(() => {
    if (isActive) {
      correctedOnceRef.current = false;
      recentAIRef.current = [];
      lastFinalTextRef.current = "";
      const recog = ensureRecognition();
      if (recog) (recog as any).lang = "en-US"; // 启动固定英文
      safeStart();
    } else {
      safeStop();
      destroyRecognition();
      // 停止对话时，立即停止任何正在播放的 TTS
      stopCurrentSpeech();

      // 任务 3：Stop 时重置 Notes 会话状态
      if (mode === "notes") {
        lastTimestampRef.current = 0;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // 导出对话记录为 .txt 文件
  const exportConversation = () => {
    if (conversation.length === 0) return;

    // Format bilingual messages for export
    const content = conversation.map(msg => {
      // 时间戳消息
      if (isTimestampLine(msg.contentEN)) {
        return `\n${msg.contentEN}\n`;
      }

      const role = msg.role === "user" ? "🧑 You" : "🤖 AI";
      const isChinese = hasChinese(msg.contentZH);
      // Show original language first, then translation
      if (isChinese) {
        return `${role} (ZH): ${msg.contentZH}\n${role} (EN): ${msg.contentEN}`;
      } else {
        return `${role} (EN): ${msg.contentEN}\n${role} (ZH): ${msg.contentZH}`;
      }
    }).join("\n\n");

    // 生成时间戳：2025-11-24-16-30-05 格式
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/T/, "-")
      .replace(/:/g, "-")
      .split(".")[0];

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-secretary-conversation-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  // 导出对话记录为 .md 文件（Markdown 格式，仅 Notes 模式）
  const exportConversationMarkdown = () => {
    if (conversation.length === 0) return;

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timestamp = now
      .toISOString()
      .replace(/T/, "-")
      .replace(/:/g, "-")
      .split(".")[0];

    // Markdown header
    let content = `# AI Secretary – Notes\nDate: ${dateStr}\n\n`;

    // 当前时间戳标题（用于分组）
    let currentTimeHeader = "";

    conversation.forEach((msg) => {
      // 时间戳消息：提取时间并设为新的 section header
      if (isTimestampLine(msg.contentEN)) {
        const time = extractHHMM(msg.contentEN);
        if (time) {
          currentTimeHeader = time;
          content += `\n## ${currentTimeHeader}\n\n`;
        }
        return;
      }

      // 如果还没有时间戳 header，创建一个默认的
      if (!currentTimeHeader) {
        currentTimeHeader = "Session";
        content += `## ${currentTimeHeader}\n\n`;
      }

      // Transcript 消息
      if (msg.role === "user") {
        const isChinese = hasChinese(msg.contentZH);
        // 双语 bullet points
        if (isChinese) {
          content += `- 🇨🇳 ${msg.contentZH}\n`;
          content += `- 🇺🇸 ${msg.contentEN}\n`;
        } else {
          content += `- 🇺🇸 ${msg.contentEN}\n`;
          content += `- 🇨🇳 ${msg.contentZH}\n`;
        }
        content += "\n";
      }
      // AI 消息（Notes 模式下通常没有，但为了完整性保留）
      else if (msg.role === "assistant") {
        content += `**AI Reply:**\n- 🇺🇸 ${msg.contentEN}\n- 🇨🇳 ${msg.contentZH}\n\n`;
      }
    });

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-secretary-notes-${timestamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  // 手动输入：不播报手动文本
  const handleManualSend = async (text: string) => {
    if (!text?.trim()) return;

    // Notes 模式：插入时间戳（如果需要）
    const isNotesMode = mode === "notes";
    if (isNotesMode) {
      maybeInsertTimestamp();
    }

    // Create bilingual message for manual input
    const manualBilingual = await toBilingual(text);
    const manualMsg: ChatMessage = {
      id: `manual-${Date.now()}`,
      role: "user",
      contentEN: manualBilingual.en,
      contentZH: manualBilingual.zh,
      timestamp: Date.now(),
      isManual: true,
    };
    setConversation((prev) => [...prev, manualMsg]);
    manualInputsRef.current = [text, ...manualInputsRef.current].slice(0, 5);

    // Notes 模式：仅保存手动输入，不调用 AI
    if (isNotesMode) {
      console.log("[Notes] manual input saved:", text);
      return; // 不调用 AI
    }

    const recent = conversation.slice(-4).map(msg =>
      `${msg.role === 'user' ? `🧑 ${myName || "Me"}` : '🤖 AI'}: ${msg.contentEN}`
    ).join("\n") || "(none)";

    const persona = (myName || "Speaker").trim();
    const isLiveMode = voiceOutputMode === "LIVE";

    const systemMessage = isLiveMode
      ? `
You are my real-time conversation assistant. Provide natural English suggestions that I can say directly.
My name is "${persona}". Always write suggestions in FIRST PERSON as ${persona} (not as an AI).
Generate short, natural, spoken phrases (1-3 sentences) based on my notes.
NEVER mention AI, assistant, or reveal automated help. Sound completely natural.
`.trim()
      : `
You are my real-time voice proxy. Always reply in ENGLISH (even if inputs are Chinese).
Your persona name is "${persona}". Never claim to be anyone else.
Be natural, concise, professional (1–3 sentences). Progress the talk with one crisp point.
Do not echo my manual note verbatim; paraphrase.
`.trim();

    const userMessage = isLiveMode
      ? `
Recent lines:
${recent}

My manual note:
${text}

Task:
Generate ONLY what I should say next in ENGLISH (1-3 natural sentences, first-person as ${persona}).
Paraphrase my note naturally. Do not explain or add commentary.
`.trim()
      : `
Recent lines:
${recent}

My manual note:
${text}

Task:
1) Reply in English only, first-person as ${persona}, 1–3 sentences.
2) Paraphrase my note; don't mirror wording.
3) Ask one precise follow-up if helpful.
`.trim();

    try {
      const reply = await getAIResponse({ systemMessage, userMessage });
      recentAIRef.current = [reply, ...recentAIRef.current].slice(0, 3);

      // 自我语音过滤：在 Live 模式下保存标准化的 AI 建议
      if (isLiveMode) {
        lastAISuggestedTextRef.current = normalize(reply);
        lastAISuggestedAtRef.current = Date.now();
      }

      // Translate AI's English reply to Chinese
      const aiZH = await toBilingual(reply).then(b => b.zh);
      const aiMsg: ChatMessage = {
        id: `ai-manual-${Date.now()}`,
        role: "assistant",
        contentEN: reply,
        contentZH: aiZH,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, aiMsg]);

      // 播报（仅 Agent 模式）
      if (voiceOutputMode === "AGENT") {
        const recog = ensureRecognition();
        isSpeakingRef.current = true;
        try { recog?.stop(); } catch {}
        const safeReply = sanitizeForTTS(reply, manualInputsRef.current);
        const speakMs = estimateTtsMs(safeReply);
        const extra = speakerMode ? 700 : 300;
        await speakWithElevenLabs(safeReply);
        await new Promise((r) => setTimeout(r, speakMs + extra));
      }
      // Live 模式：不播报
    } catch (e) {
      console.error(e);
    } finally {
      isSpeakingRef.current = false;
      if (isActive && voiceOutputMode === "AGENT") safeStart();
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">AI Secretary — Live Conversation</h2>

      {/* 核心设置 */}
      <div className="border rounded p-3 bg-gray-50">
        <MicSelector
          className="mb-3"
          onSelected={(id) => {
            console.log("Preferred mic deviceId:", id);
          }}
        />

        <div className="grid gap-3 md:grid-cols-3 mb-3">
          <div>
            <label className="block text-sm mb-1 font-medium">Mode 场景</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={isActive}
            >
              <option value="face-to-face">Face to Face 当面沟通</option>
              <option value="call-out">Call Out (future)</option>
              <option value="call-in">Call In (future)</option>
              <option value="notes">Notes (Silent Transcript)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1 font-medium">Voice Output 语音输出</label>
            <div className="flex items-center h-8">
              {mode === "notes" ? (
                <span className="text-sm text-gray-600 italic">
                  Notes mode: text only 📝
                </span>
              ) : (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voiceOutputMode === "AGENT"}
                    onChange={(e) => setVoiceOutputMode(e.target.checked ? "AGENT" : "LIVE")}
                    disabled={isActive}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    {voiceOutputMode === "AGENT" ? "ON (AI speaks)" : "OFF (you speak)"}
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="flex items-end">
            <button
              className={`w-full px-3 py-2 rounded text-white font-medium ${isActive ? "bg-red-500 hover:bg-red-600" : "bg-green-600 hover:bg-green-700"}`}
              onClick={() => setIsActive((v) => !v)}
            >
              {isActive ? "停止 Stop" : "开始 Start"}
            </button>
          </div>
        </div>

        {/* Advanced 折叠区 */}
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 font-medium">
            Advanced Settings 高级设置 ▼
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 border-t pt-3">
            <div>
              <label className="block text-sm mb-1">My Name 我的身份</label>
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="e.g. James' father"
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                disabled={isActive || autoNameFromGuide}
              />
              <label className="inline-flex items-center gap-2 mt-1 text-xs">
                <input
                  type="checkbox"
                  checked={autoNameFromGuide}
                  onChange={(e) => setAutoNameFromGuide(e.target.checked)}
                  disabled={isActive}
                />
                Auto from GUIDE
              </label>
            </div>

            <div>
              <label className="block text-sm mb-1">Counterparty 对方身份</label>
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="e.g. ER doctor"
                value={speakerRole}
                onChange={(e) => setSpeakerRole(e.target.value)}
                disabled={isActive}
              />
            </div>

            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={speakerMode}
                  onChange={(e) => setSpeakerMode(e.target.checked)}
                  disabled={isActive}
                />
                Speakerphone Mode (Echo Shield) 扬声器模式（防回声）
              </label>
            </div>
          </div>
        </details>
      </div>

      <div>
        <label className="block text-sm mb-1 font-medium">GUIDE / Background 背景说明</label>

        {/* 文件上传控件 */}
        <div className="mb-2">
          <input
            type="file"
            accept=".txt,.md,.rtf,.text"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = (event) => {
                let raw = String(event.target?.result || "");

                // 统一换行符
                raw = raw.replace(/\r\n/g, "\n");
                // 去掉 BOM
                raw = raw.replace(/^\uFEFF/, "");

                // 按空行分段
                const parts = raw.split(/\n\s*\n/);
                let cleaned: string;
                if (parts.length > 1) {
                  // 跳过第一段（标题），使用后面的正文
                  cleaned = parts.slice(1).join("\n\n").trimStart();
                } else {
                  // 没有空行，退化为原来的行为
                  cleaned = raw.trimStart();
                }

                setBackground(cleaned);
              };
              reader.onerror = () => {
                alert("文件读取失败，请重试。");
              };
              reader.readAsText(file, "utf-8");

              // 清空 input，允许重复上传同一文件
              e.target.value = "";
            }}
            disabled={isActive}
          />
          <p className="text-xs text-gray-500 mt-1">
            可选择本地 .txt/.md/.rtf 文件导入病情/背景说明
          </p>
        </div>

        <textarea
          className="w-full border rounded px-2 py-2 h-32"
          placeholder="在这里简要写明病情或背景，AI 会按照这里的内容来回答。也可以上方导入 .txt 文件。 / Briefly describe the situation here, or import a .txt file above."
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          disabled={isActive}
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">对话记录 Conversation</h3>
        <div className="flex gap-2">
          {/* 任务 2：手动插入时间戳按钮（仅 Notes 模式） */}
          {mode === "notes" && (
            <button
              className="px-3 py-1 rounded text-sm bg-yellow-500 text-white hover:bg-yellow-600"
              onClick={() => maybeInsertTimestamp(true)}
            >
              🕒 Insert Timestamp
            </button>
          )}
          <button
            className="px-3 py-1 rounded text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={exportConversation}
            disabled={conversation.length === 0}
          >
            导出为文本 Export .txt
          </button>
          {mode === "notes" && (
            <button
              className="px-3 py-1 rounded text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={exportConversationMarkdown}
              disabled={conversation.length === 0}
            >
              导出 Markdown Export .md
            </button>
          )}
        </div>
      </div>

      <div className="border rounded p-3 bg-white">
        {conversation.map((msg, idx) => {
          // 时间戳消息特殊处理
          if (isTimestampLine(msg.contentEN)) {
            // 任务 1：提取并优化时间戳显示
            const timeStr = extractHHMM(msg.contentEN);
            return (
              <div key={msg.id || idx} className="my-4 text-center">
                <div className="inline-block px-4 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium">
                  🕒 {timeStr || msg.contentEN}
                </div>
              </div>
            );
          }

          const isUser = msg.role === "user";
          const isAI = msg.role === "assistant";
          const isChinese = hasChinese(msg.contentZH);
          const isLiveMode = voiceOutputMode === "LIVE";
          const isNotesMode = mode === "notes";

          // Determine display order: original first, then translation
          let firstLang: string, firstContent: string;
          let secondLang: string, secondContent: string;

          if (isAI) {
            // AI messages: always EN first, then ZH
            firstLang = "EN";
            firstContent = msg.contentEN;
            secondLang = "ZH";
            secondContent = msg.contentZH;
          } else {
            // User messages: original language first
            if (isChinese) {
              firstLang = "ZH";
              firstContent = msg.contentZH;
              secondLang = "EN";
              secondContent = msg.contentEN;
            } else {
              firstLang = "EN";
              firstContent = msg.contentEN;
              secondLang = "ZH";
              secondContent = msg.contentZH;
            }
          }

          // Notes 模式：添加 📝 图标
          const roleLabel = isNotesMode && isUser
            ? (msg.isManual ? `📝 ${myName || "You"} (manual)` : "📝 Transcript")
            : isUser
            ? (msg.isManual ? `🧑 ${myName || "You"} (manual)` : "🧑 Partner")
            : (isLiveMode ? "💡 Suggested Reply" : "🤖 AI");

          return (
            <div key={msg.id || idx} className="mb-3 leading-7">
              {isAI && isLiveMode ? (
                // Live 模式：简洁显示，像 notes
                <>
                  <div className="font-medium text-blue-700 mb-1">
                    {roleLabel}:
                  </div>
                  <div className="whitespace-pre-wrap pl-4 border-l-2 border-blue-300 text-gray-800">
                    {firstContent}
                  </div>
                  {/* 中文折叠显示（可选） */}
                  <details className="mt-2 pl-4 text-sm">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                      Show Chinese 显示中文
                    </summary>
                    <div className="whitespace-pre-wrap text-gray-600 mt-1">
                      {secondContent}
                    </div>
                  </details>
                </>
              ) : isNotesMode && isUser ? (
                // Notes 模式：简洁双语显示
                <>
                  <div className="whitespace-pre-wrap">
                    {roleLabel} ({firstLang}): {firstContent}
                  </div>
                  <div className="whitespace-pre-wrap text-gray-600">
                    {roleLabel} ({secondLang}): {secondContent}
                  </div>
                </>
              ) : (
                // Agent 模式或其他：保持现有样式
                <>
                  <div className="whitespace-pre-wrap">
                    {roleLabel} ({firstLang}): {firstContent}
                  </div>
                  <div className="whitespace-pre-wrap text-gray-600">
                    {roleLabel} ({secondLang}): {secondContent}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <ManualInputBox onSend={handleManualSend} />
    </div>
  );
}
