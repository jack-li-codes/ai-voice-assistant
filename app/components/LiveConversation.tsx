"use client";

import { useEffect, useRef, useState } from "react";
import { getAIResponse } from "@/lib/gpt/getAIResponse";
import { speakWithElevenLabs, stopCurrentSpeech } from "@/lib/voice/speakWithElevenLabs";
import { toBilingual, hasChinese } from "@/lib/translate";
import { ChatMessage } from "@/lib/types/message";
import ManualInputBox from "./ManualInputBox";
import MicSelector from "./MicSelector";
import { buildInterviewMeetingPrompt } from "@/ai-calls/templates/interviewMeeting";

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

const endsLikeCompleteThought = (text: string) =>
  /[.!?。！？]$/.test((text || "").trim());

const startsLikeContinuation = (text: string) =>
  /^(and|but|or|so|then|because|also|plus|uh|um|yeah|yes|no|i|we|you|they|he|she|it|to|for|at|in|on|with|that|which|who|what|when|where|why|how)\b/i
    .test((text || "").trim());

const shouldMergeTranscriptMessage = (previous: ChatMessage, next: ChatMessage) => {
  if (previous.role !== "user" || next.role !== "user") return false;
  if (previous.speaker !== next.speaker) return false;
  if (previous.isManual || next.isManual) return false;
  if (isTimestampLine(previous.contentEN) || isTimestampLine(next.contentEN)) return false;
  if (!isMeaningfulText(next.contentEN)) return false;

  const previousTime = previous.timestamp || 0;
  const nextTime = next.timestamp || Date.now();
  if (!previousTime) return false;

  const maxGap = next.speaker === "me" ? 8000 : 5000;
  if (nextTime - previousTime > maxGap) return false;

  const nextWords = next.contentEN.trim().split(/\s+/).filter(Boolean).length;
  const previousLooksOpen = !endsLikeCompleteThought(previous.contentEN);
  const nextLooksFragment = nextWords <= 4 || startsLikeContinuation(next.contentEN);

  return previousLooksOpen || nextLooksFragment;
};

const appendTranscriptMessage = (messages: ChatMessage[], next: ChatMessage) => {
  const previous = messages[messages.length - 1];
  if (!previous || !shouldMergeTranscriptMessage(previous, next)) {
    return [...messages, next];
  }

  const merged: ChatMessage = {
    ...previous,
    contentEN: `${previous.contentEN.trim()} ${next.contentEN.trim()}`.trim(),
    contentZH: `${previous.contentZH.trim()} ${next.contentZH.trim()}`.trim(),
    timestamp: next.timestamp || previous.timestamp,
  };

  return [...messages.slice(0, -1), merged];
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

type ScenarioId = "zoom-1-1" | "phone-call" | "team-meeting" | "face-to-face";

const scenarioCards: Array<{
  id: ScenarioId;
  title: string;
  subtitle: string;
  mode: string;
  rolePlaceholder: string;
  guidePlaceholder: string;
  goalPlaceholder: string;
}> = [
  {
    id: "zoom-1-1",
    title: "Zoom 1:1",
    subtitle: "Interview, manager sync, client call",
    mode: "interview-meeting",
    rolePlaceholder: "e.g. hiring manager, client, mentor",
    guidePlaceholder: "Who are you meeting? What do they care about? Add any important background or constraints.",
    goalPlaceholder: "e.g. Explain my project clearly and ask for next steps.",
  },
  {
    id: "phone-call",
    title: "Phone Call",
    subtitle: "Fast help while listening on a call",
    mode: "face-to-face",
    rolePlaceholder: "e.g. clinic receptionist, bank agent, school office",
    guidePlaceholder: "Add account details, appointment context, problem summary, or anything the caller may ask about.",
    goalPlaceholder: "e.g. Understand the issue and confirm the action I need to take.",
  },
  {
    id: "team-meeting",
    title: "Team Meeting",
    subtitle: "Follow discussion and prepare concise replies",
    mode: "interview-meeting",
    rolePlaceholder: "e.g. product team, engineer, project lead",
    guidePlaceholder: "Add project context, decisions needed, your responsibilities, and any topics likely to come up.",
    goalPlaceholder: "e.g. Contribute one clear update and clarify blockers.",
  },
  {
    id: "face-to-face",
    title: "Face to Face",
    subtitle: "In-person conversation support",
    mode: "face-to-face",
    rolePlaceholder: "e.g. doctor, teacher, neighbor, service staff",
    guidePlaceholder: "Add the situation, names, symptoms, questions, preferences, or boundaries you want remembered.",
    goalPlaceholder: "e.g. Stay calm, understand them, and answer politely.",
  },
];

export default function LiveConversation() {
  // —— 表单 —— //
  const [scenario, setScenario] = useState<ScenarioId>("zoom-1-1");
  const [mode, setMode] = useState("interview-meeting");
  const [background, setBackground] = useState("");
  const [myGoal, setMyGoal] = useState("");
  const [myTone, setMyTone] = useState("Natural, calm, and professional");
  const [speakerRole, setSpeakerRole] = useState("");

  // Voice Output Mode: "LIVE" = 你说 (TTS OFF), "AGENT" = AI说 (TTS ON)
  const [voiceOutputMode, setVoiceOutputMode] = useState<"LIVE" | "AGENT">("LIVE");

  // Active Speaker (Face-to-Face mode only): who is speaking now
  const [activeSpeaker, setActiveSpeaker] = useState<"partner" | "me">("partner");
  const activeSpeakerRef = useRef<"partner" | "me">("partner");

  // 动态身份
  const [myName, setMyName] = useState("Lucy"); // 默认值，随时可改
  const [autoNameFromGuide, setAutoNameFromGuide] = useState(true);

  // 外放防回声模式（打/接电话建议开启）
  const [speakerMode, setSpeakerMode] = useState(true);

  // —— 对话与控制 —— //
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const conversationRef = useRef<ChatMessage[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Interim caption (Zoom-like live caption while speaking)
  const [liveCaption, setLiveCaption] = useState("");

  // —— 🪄 Suggested Line —— //
  const [pendingLines, setPendingLines] = useState<string[]>([]);
  const [isGeneratingLine, setIsGeneratingLine] = useState(false);

  // Auto suggestions control (LIVE mode only)
  const [autoSuggestEnabled, setAutoSuggestEnabled] = useState(true);

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

  // 安全重启识别（throttle：立即 start，250ms 内拒绝重复）
  const safeStartRecognition = (r?: SpeechRecognition | null) => {
    if (restartingRef.current) return;
    restartingRef.current = true;

    try {
      const recog = r || recognitionRef.current;
      recog?.start();
      markListeningResumed();
    } catch {}

    setTimeout(() => {
      restartingRef.current = false;
    }, 250);
  };

  // 自我语音过滤：记录最近的 AI 建议文本（Live 模式专用）
  const lastAISuggestedTextRef = useRef<string>("");
  const lastAISuggestedAtRef = useRef<number>(0);

  // Delivery Guardrail refs (Face-to-Face 防反哺)
  const lastSuggestionAtRef = useRef<number>(0);
  const lastSuggestionTextRef = useRef<string>("");

  // Backpressure refs (防堵死)
  const isGeneratingRef = useRef(false);
  const pendingPartnerInputRef = useRef<{ text: string; target: "partner" | "me" } | null>(null);

  // Watchdog: track when locks were set (for emergency unlock)
  const generationStartedAtRef = useRef<number>(0);
  const speakingStartedAtRef = useRef<number>(0);
  const watchdogTimerRef = useRef<number | null>(null);

  // SpeechRecognition restart debounce (防抖)
  const restartingRef = useRef(false);

  const currentScenario =
    scenarioCards.find((item) => item.id === scenario) || scenarioCards[0];

  const chooseScenario = (nextScenario: ScenarioId) => {
    const next = scenarioCards.find((item) => item.id === nextScenario);
    if (!next) return;
    setScenario(nextScenario);
    setMode(next.mode);
  };

  useEffect(() => {
    activeSpeakerRef.current = activeSpeaker;
  }, [activeSpeaker]);

  // 根据 GUIDE 自动更新名字（可关闭）
  useEffect(() => {
    if (!autoNameFromGuide) return;
    const n = extractNameFromGuide(background);
    if (n && n !== myName) setMyName(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background, autoNameFromGuide]);

  // Sync conversationRef with conversation state (for suggested lines)
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

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
  const finalizeAndSubmit = async (
    text: string,
    reason: string,
    targetAtRecognition: "partner" | "me" = activeSpeakerRef.current
  ) => {
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

    const listeningTarget = targetAtRecognition;

    // A) Delivery Guardrail (防反哺)
    const isFaceToFace = mode === "face-to-face";
    if (
      isFaceToFace &&
      listeningTarget === "partner" &&
      autoSuggestEnabled &&
      lastSuggestionTextRef.current
    ) {
      const timeSinceLastSuggestion = Date.now() - lastSuggestionAtRef.current;
      if (timeSinceLastSuggestion < 9000) {
        const set1 = tokenSet(text);
        const set2 = tokenSet(lastSuggestionTextRef.current);
        const similarity = jaccard(set1, set2);
        if (similarity > 0.30) {
          console.log(`[Guardrail] ignore as delivery: ${text.slice(0, 60)}`);
          return;
        }
      }
    }

    // 如果当前分析对象是"我"，只记录不触发 AI。适用于所有外部监听场景。
    if (listeningTarget === "me") {
      console.log("[Listening target] Me / pause suggestions, record only", { reason, text });

      // 可选：记录"我"说的话（根据需求，这里暂时记录）
      const myBilingual = await toBilingual(text);
      const myMsg: ChatMessage = {
        id: `me-${Date.now()}`,
        role: "user",
        contentEN: myBilingual.en,
        contentZH: myBilingual.zh,
        timestamp: Date.now(),
        speaker: "me",
      };
      setConversation((prev) => appendTranscriptMessage(prev, myMsg));
      return; // 不触发 AI 提词
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
        speaker: "partner",
      };
      setConversation((prev) => appendTranscriptMessage(prev, partnerMsg));
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
    // Phase 1 copilot UX: keep Chinese meaning visible even in LIVE mode.
    const isLiveMode = voiceOutputMode === "LIVE";
    const shouldSkipTranslation = false;

    let partnerMsg: ChatMessage;
    if (shouldSkipTranslation) {
      // 直接使用原文，不翻译（节省一次 OpenAI 调用）
      partnerMsg = {
        id: `partner-${Date.now()}`,
        role: "user",
        contentEN: text,
        contentZH: text, // 暂时使用相同文本，或者可以留空
        timestamp: Date.now(),
        speaker: "partner",
      };
    } else {
      const partnerBilingual = await toBilingual(text);
      partnerMsg = {
        id: `partner-${Date.now()}`,
        role: "user",
        contentEN: partnerBilingual.en,
        contentZH: partnerBilingual.zh,
        timestamp: Date.now(),
        speaker: "partner",
      };
    }
    setConversation((prev) => appendTranscriptMessage(prev, partnerMsg));

    // —— LIVE 模式下，如果 Auto suggestions 关闭，则只保存转写，不生成 AI 回复 —— //
    if (isLiveMode && !autoSuggestEnabled) {
      console.log("[LIVE] auto-suggest disabled, skip AI response");
      return;
    }

    // B) Backpressure (防堵死)
    if (isFaceToFace && listeningTarget === "partner") {
      if (isGeneratingRef.current) {
        pendingPartnerInputRef.current = { text, target: listeningTarget };
        console.log(`[Backpressure] AI is busy, queuing latest input: ${text.slice(0, 60)}`);
        return;
      }
      isGeneratingRef.current = true;
      generationStartedAtRef.current = Date.now(); // Track when generation started
    }

    // —— 名字误叫，仅纠一次 —— //
    const mustCorrectOnce = detectMisname(text, myName) && !correctedOnceRef.current;

    // ===== 最外层 try/finally：确保 cleanup 永远执行 =====
    try {

      // —— 轻量上下文 —— //
      const recent = conversation.slice(-4).map(msg =>
        `${msg.role === 'user' ? '🧑 Partner' : '🤖 AI'}: ${msg.contentEN}`
      ).join("\n") || "(none)";

      // —— 系统提示（动态身份 + 英文 + 模式区分） —— //
      const persona = (myName || "Speaker").trim();

      // 面试/会议模式：使用专门的 prompt 模板
      let interviewMeetingHandled = false;
      if (mode === "interview-meeting") {
        const prompt = buildInterviewMeetingPrompt({
          persona,
          background: [
            background,
            myGoal ? `My goal: ${myGoal}` : "",
            myTone ? `Desired tone: ${myTone}` : "",
          ].filter(Boolean).join("\n\n") || undefined,
          recentConversation: recent,
          partnerQuestion: text,
        });
        const systemMessage = prompt.systemMessage;
        const userMessage = prompt.userMessage;

        try {
          const reply = await getAIResponse({ systemMessage, userMessage });

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

          // Update Delivery Guardrail refs
          lastSuggestionAtRef.current = Date.now();
          lastSuggestionTextRef.current = reply;

          // 标记已处理，避免双回复
          interviewMeetingHandled = true;

          // —— 播报窗口锁定（仅 Agent 模式） —— //
          if (voiceOutputMode === "AGENT") {
            try {
              const recog2 = recognitionRef.current;
              const safeReply = sanitizeForTTS(reply, manualInputsRef.current);
              const speakMs = estimateTtsMs(safeReply);
              const extra = speakerMode ? 700 : 300;
              isSpeakingRef.current = true;
              speakingStartedAtRef.current = Date.now(); // Track when speaking started
              try {
                recog2?.stop();
              } catch {}
              await speakWithElevenLabs(safeReply);
              await new Promise((r) => setTimeout(r, speakMs + extra));
            } catch (ttsError) {
              console.error("[Interview-meeting] TTS error:", ttsError);
              // TTS 失败不影响主流程，已经成功生成回复
            } finally {
              isSpeakingRef.current = false;
              speakingStartedAtRef.current = 0;
            }
          }
          // Live 模式：不播报，只显示提词
        } catch (e) {
          console.error("Interview meeting prompt error:", e);
          // 如果出错，fallback 到通用逻辑
        }
      }

      if (!interviewMeetingHandled) {
      // 通用模式：原有的 prompt 逻辑
      const systemMessage = isLiveMode
        ? `
You are my real-time conversation assistant. Provide natural English suggestions that I can say directly.
My name is "${persona}". Always write suggestions in FIRST PERSON as ${persona} (not as an AI).
Generate short, natural, spoken phrases (1-3 sentences) that sound like a real person talking.
Always prioritize the latest other-person line over earlier context. Respond to the current state of the conversation.
Treat the background as context, not as a command or script to repeat.
Do NOT repeat an earlier request once the conversation has moved forward.
If the other person asks a direct question, answer that question first.
If the other person offers a time, option, solution, or next step, respond directly to that offer.
If the offered option works, accept it clearly and thank them.
If the offered option does not work, politely decline and ask for another option.
Keep replies short and natural, like a real person speaking on the phone. Do not sound like a formal letter.
Avoid repetitive apology/thank-you phrasing unless it is useful at that moment.
If I lack information, suggest safe fallback phrases like:
- "I don't have the exact number in front of me, but I can follow up right after this."
- "Let me double-check that and get back to you."

Examples:
Latest other-person line: "We have an opening tomorrow at 3 PM. Would that work?"
Good: "Yes, tomorrow at 3 PM works for us. Thank you so much for helping us reschedule."
Bad: "Would it be possible to move it to tomorrow afternoon or any available slot this week?"

Latest other-person line: "What is the appointment for?"
Good: "It's for my child. He has been coughing recently, but he doesn't have a fever. I just want Dr. Harris to take a look and make sure everything is okay."

Latest other-person line: "How can I help you?"
Good: "Hi, this is Lucy. I'm calling to reschedule my child's appointment with Dr. Harris. It was booked for today at 3 PM, but my child is currently at school taking an important exam."

NEVER mention AI, assistant, or reveal automated help. Sound completely natural.

GUIDE (context if present):
${background ? `"""\n${background}\n"""` : "(empty)"}

Context:
- Mode: ${mode || "N/A"}
- Counterparty: ${speakerRole || "N/A"}
- My goal: ${myGoal || "N/A"}
- Desired tone: ${myTone || "Natural, calm, and professional"}
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
- My goal: ${myGoal || "N/A"}
- Desired tone: ${myTone || "Natural, calm, and professional"}
`.trim();

      const userMessage = isLiveMode
        ? `
Recent lines:
${recent}

Partner just said:
${text}

Task:
Generate ONLY what I should say next in ENGLISH (1-3 natural sentences, first-person as ${persona}).
The latest other-person line is the anchor. Answer it directly before using older context.
Use the background only as context. Do not repeat old requests after the other person has offered a specific option.
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

        // Update Delivery Guardrail refs
        lastSuggestionAtRef.current = Date.now();
        lastSuggestionTextRef.current = reply;

        // —— 播报窗口锁定（仅 Agent 模式） —— //
        if (voiceOutputMode === "AGENT") {
          try {
            const recog2 = recognitionRef.current;
            const safeReply = sanitizeForTTS(reply, manualInputsRef.current);
            const speakMs = estimateTtsMs(safeReply);
            const extra = speakerMode ? 700 : 300;
            isSpeakingRef.current = true;
            speakingStartedAtRef.current = Date.now(); // Track when speaking started
            try { recog2?.stop(); } catch {}
            await speakWithElevenLabs(safeReply);
            await new Promise((r) => setTimeout(r, speakMs + extra));
          } catch (ttsError) {
            console.error("[Generic] TTS error:", ttsError);
            // TTS 失败不影响主流程
          } finally {
            isSpeakingRef.current = false;
            speakingStartedAtRef.current = 0;
          }
        }
        // Live 模式：不播报，AI 只是生成建议
      } catch (e) {
        console.error("❌ generate/speak error:", e);
      }
      } // end if (!interviewMeetingHandled)

    } finally {
      // ===== Unified cleanup - ALWAYS executes =====
      isSpeakingRef.current = false;
      speakingStartedAtRef.current = 0;
      if (voiceOutputMode === "AGENT") {
        safeStartRecognition();
      }

      // Backpressure: process pending input
      isGeneratingRef.current = false;
      generationStartedAtRef.current = 0;
      const pending = pendingPartnerInputRef.current;
      if (pending) {
        pendingPartnerInputRef.current = null;
        console.log(`[Backpressure] processing pending input: ${pending.text.slice(0, 60)}`);
        // 异步调用,避免阻塞
        setTimeout(() => finalizeAndSubmit(pending.text, "backpressure-pending", pending.target), 0);
      }

      if (mustCorrectOnce) correctedOnceRef.current = true;
    }
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

      // Process INTERIM results for live caption (Zoom-like)
      let interimText = "";
      for (let i = event.results.length - 1; i >= 0; i--) {
        const res: any = event.results[i];
        if (!res.isFinal) {
          interimText = res[0]?.transcript?.trim?.() || "";
          if (interimText) break;
        }
      }

      // Update live caption with interim text
      if (interimText) {
        setLiveCaption(interimText);
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

      // Clear live caption when final result arrives
      setLiveCaption("");

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
        safeStartRecognition(recog);
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

      // 调用统一提交入口，并固定这次识别发生时的分析对象
      await finalizeAndSubmit(finalText, "onresult-final", activeSpeakerRef.current);
    };

    recog.onerror = (e: any) => {
      const errorType = e?.error;
      console.warn("[SR] recognition.onerror:", errorType || e);

      // Handle specific errors that can be recovered
      if (errorType === "aborted" || errorType === "audio-capture") {
        if (isActive) {
          console.warn(`[SR] restarting after ${errorType} error...`);
          safeStartRecognition();
        }
      }
    };

    recog.onend = () => {
      console.log("[SR] recognition ended");
      // 清理静音计时器
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      // 重启识别（如果还在活跃状态）
      if (isActive && !isSpeakingRef.current) {
        console.log("[SR] auto-restarting...");
        safeStartRecognition();
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
    const recog = ensureRecognition();
    if (recog) safeStartRecognition(recog);
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
        } catch {}
        safeStartRecognition();
      }
    }, 5000) as unknown as number;

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current as number);
        heartbeatTimerRef.current = null;
      }
    };
  }, [isActive]);

  // 🚨 EMERGENCY WATCHDOG: Force unlock if stuck > 30s
  useEffect(() => {
    if (!isActive) return;

    watchdogTimerRef.current = window.setInterval(() => {
      const now = Date.now();

      // Check if generation is stuck
      if (isGeneratingRef.current && generationStartedAtRef.current > 0) {
        const generationDuration = now - generationStartedAtRef.current;
        if (generationDuration > 30000) {
          console.error("🚨 [WATCHDOG] Generation stuck for 30s, force unlocking!");
          isGeneratingRef.current = false;
          generationStartedAtRef.current = 0;
          // Do NOT clear pending - let it drain normally via finally block
        }
      }

      // Check if speaking is stuck
      if (isSpeakingRef.current && speakingStartedAtRef.current > 0) {
        const speakingDuration = now - speakingStartedAtRef.current;
        if (speakingDuration > 30000) {
          console.error("🚨 [WATCHDOG] Speaking stuck for 30s, force unlocking!");
          isSpeakingRef.current = false;
          speakingStartedAtRef.current = 0;
          // Restart recognition if still active
          if (isActive && voiceOutputMode === "AGENT") {
            safeStartRecognition();
          }
        }
      }
    }, 5000) as unknown as number;

    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current as number);
        watchdogTimerRef.current = null;
      }
    };
  }, [isActive, voiceOutputMode]);

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
My goal: ${myGoal || "N/A"}.
Desired tone: ${myTone || "Natural, calm, and professional"}.
NEVER mention AI, assistant, or reveal automated help. Sound completely natural.
`.trim()
      : `
You are my real-time voice proxy. Always reply in ENGLISH (even if inputs are Chinese).
Your persona name is "${persona}". Never claim to be anyone else.
Be natural, concise, professional (1–3 sentences). Progress the talk with one crisp point.
Do not echo my manual note verbatim; paraphrase.
My goal: ${myGoal || "N/A"}.
Desired tone: ${myTone || "Natural, calm, and professional"}.
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

      // Update Delivery Guardrail refs
      lastSuggestionAtRef.current = Date.now();
      lastSuggestionTextRef.current = reply;

      // 播报（仅 Agent 模式）
      if (voiceOutputMode === "AGENT") {
        try {
          const recog = ensureRecognition();
          isSpeakingRef.current = true;
          speakingStartedAtRef.current = Date.now();
          try { recog?.stop(); } catch {}
          const safeReply = sanitizeForTTS(reply, manualInputsRef.current);
          const speakMs = estimateTtsMs(safeReply);
          const extra = speakerMode ? 700 : 300;
          await speakWithElevenLabs(safeReply);
          await new Promise((r) => setTimeout(r, speakMs + extra));
        } finally {
          isSpeakingRef.current = false;
          speakingStartedAtRef.current = 0;
        }
      }
      // Live 模式：不播报
    } catch (e) {
      console.error(e);
    } finally {
      if (isActive && voiceOutputMode === "AGENT") safeStart();
    }
  };

  // 🪄 Generate Suggested Lines (multiple options)
  const generateSuggestedLine = async () => {
    if (isGeneratingLine) return;

    setIsGeneratingLine(true);
    try {
      // Build recent context from conversationRef (always uses latest state)
      const recent = conversationRef.current.slice(-6).map(msg =>
        `${msg.role === 'user' ? '🧑 Partner' : '🤖 AI'}: ${msg.contentEN}`
      ).join("\n") || "(no conversation yet)";

      const persona = (myName || "Speaker").trim();

      // System message for 2-4 short professional options
      const systemMessage = `
You are a silent meeting assistant helping ${persona} with professional conversation.
Output exactly 2 to 4 options for what ${persona} can say next.
Each option must be:
- Short and speakable (6-18 words)
- Professional English
- Directly responsive to the latest other-person line
- Consistent with recent conversation and GUIDE
- Prefixed with "- " (dash + space)
- Avoid questions unless context strongly requires them
- Do NOT introduce new topics
- Do NOT add explanations or commentary
- Do NOT repeat an earlier request if the other person has already offered a specific time, option, solution, or next step
- Treat the GUIDE/background as context, not as a script to repeat
- Sound like a real person speaking on the phone, not a formal letter

Use the latest other-person line as the anchor for every option.
If the latest other-person line asks a direct question, answer it directly first.
If the latest other-person line offers something that works, accept it clearly and thank them.
If it does not work, politely ask for another option.

Examples:
Latest other-person line: "We have an opening tomorrow at 3 PM. Would that work?"
Good:
- Yes, tomorrow at 3 PM works for us. Thank you so much.
Bad:
- Could we move it to tomorrow afternoon or later this week?

Latest other-person line: "What is the appointment for?"
Good:
- It's for my child. He has been coughing, but he doesn't have a fever.

Latest other-person line: "How can I help you?"
Good:
- Hi, this is Lucy. I'm calling to reschedule my child's appointment.

Format:
- [First option]
- [Second option]
- [Third option]
- [Fourth option (optional)]
`.trim();

      const userMessage = `
Background context (GUIDE):
${background ? `"""\n${background}\n"""` : "(none)"}

My goal:
${myGoal || "(not specified)"}

Desired tone:
${myTone || "Natural, calm, and professional"}

Recent conversation:
${recent}

Task:
Generate 2 to 4 short professional English response options (6-18 words each) that ${persona} can say next.
Each option on its own line with "- " prefix.
Use the latest other-person line as the anchor. Do not generate options that repeat old requests after the other person has offered a specific option.
Avoid questions unless needed. Stay consistent with the conversation. No new topics.
`.trim();

      const reply = await getAIResponse({ systemMessage, userMessage });

      // Parse bullet lines
      const lines = reply
        .trim()
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.startsWith("- "))
        .map(line => line.slice(2).trim())
        .filter(Boolean);

      if (lines.length > 0) {
        setPendingLines(lines);
      } else {
        // Fallback if parsing fails
        setPendingLines(["I understand. Let me think about that for a moment."]);
      }
    } catch (error) {
      console.error("Error generating suggested lines:", error);
      setPendingLines(["I understand. Let me think about that for a moment."]);
    } finally {
      setIsGeneratingLine(false);
    }
  };

  // Copy a single line to clipboard
  const copySingleLine = async (line: string) => {
    if (!line) return;
    try {
      await navigator.clipboard.writeText(line);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Copy all pending lines to clipboard (joined by newline)
  const copyAllLines = async () => {
    if (pendingLines.length === 0) return;
    try {
      await navigator.clipboard.writeText(pendingLines.join("\n"));
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Clear pendingLines
  const clearPendingLines = () => {
    setPendingLines([]);
  };

  const speakSuggestedLine = async (line: string) => {
    if (!line.trim()) return;

    try {
      const recog = recognitionRef.current;
      isSpeakingRef.current = true;
      speakingStartedAtRef.current = Date.now();
      try { recog?.stop(); } catch {}
      await speakWithElevenLabs(line);
      await new Promise((r) => setTimeout(r, estimateTtsMs(line) + 500));
    } catch (error) {
      console.error("Manual suggestion TTS failed:", error);
    } finally {
      isSpeakingRef.current = false;
      speakingStartedAtRef.current = 0;
      if (isActive) safeStart();
    }
  };

  const transcriptMessages = conversation
    .filter((msg) => msg.role === "user" && !isTimestampLine(msg.contentEN))
    .slice(-4);

  const latestPartnerMessage = [...conversation]
    .reverse()
    .find((msg) =>
      msg.role === "user" &&
      !msg.isManual &&
      msg.speaker !== "me" &&
      !isTimestampLine(msg.contentEN)
    );

  const latestSuggestionMessage = [...conversation]
    .reverse()
    .find((msg) => msg.role === "assistant");

  const suggestedOptions =
    pendingLines.length > 0
      ? pendingLines
      : latestSuggestionMessage?.contentEN
      ? [latestSuggestionMessage.contentEN]
      : [];

  const latestOriginal = latestPartnerMessage?.contentEN || "";
  const latestMeaning = latestPartnerMessage?.contentZH || "";

  return (
    <div className="space-y-5 text-[15px] leading-7">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Communication Copilot / 沟通外脑
            </h2>
            <p className="mt-1 text-base text-slate-600">
              Listen, understand, and choose what to say.
            </p>
          </div>
          <button
            className={`rounded px-6 py-3 text-base font-semibold text-white ${
              isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"
            }`}
            onClick={() => setIsActive((v) => !v)}
          >
            {isActive ? "Stop listening / 停止" : "Start listening / 开始"}
          </button>
        </div>

        <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Current scenario: {currentScenario.title}
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {scenarioCards.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseScenario(item.id)}
                disabled={isActive}
                className={`rounded-lg border p-3 text-left transition ${
                  scenario === item.id
                    ? "border-blue-600 bg-blue-50 text-blue-950"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                } ${isActive ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">{item.subtitle}</div>
              </button>
            ))}
          </div>
        </details>

        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-base font-semibold text-slate-900">
                Listening target / 当前分析对象
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:min-w-[420px]">
              <button
                type="button"
                className={`rounded border px-4 py-3 text-base font-semibold transition ${
                  activeSpeaker === "partner"
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setActiveSpeaker("partner")}
              >
                Other person 对方
              </button>
              <button
                type="button"
                className={`rounded border px-4 py-3 text-base font-semibold transition ${
                  activeSpeaker === "me"
                    ? "border-amber-600 bg-amber-500 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setActiveSpeaker("me")}
              >
                Me / Pause suggestions 我在说/暂停建议
              </button>
            </div>
          </div>
        </div>
      </section>

      <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold text-slate-800">
          Preparation / 背景准备
          <span className="ml-2 text-sm font-normal text-slate-500">
            {background || myGoal || speakerRole ? "Context added" : "Add context when needed"}
          </span>
        </summary>

        <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Background / Context</span>
                <textarea
                  className="mt-1 h-28 w-full rounded border border-slate-300 px-3 py-3 text-base leading-7"
                  placeholder={currentScenario.guidePlaceholder}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  disabled={isActive}
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">My goal / 我的目标</span>
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-3 text-base"
                    placeholder={currentScenario.goalPlaceholder}
                    value={myGoal}
                    onChange={(e) => setMyGoal(e.target.value)}
                    disabled={isActive}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">My tone / 我的语气</span>
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-3 text-base"
                    value={myTone}
                    onChange={(e) => setMyTone(e.target.value)}
                    disabled={isActive}
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Other person / 对方身份</span>
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-3 text-base"
                  placeholder={currentScenario.rolePlaceholder}
                  value={speakerRole}
                  onChange={(e) => setSpeakerRole(e.target.value)}
                  disabled={isActive}
                />
              </label>

              <details className="rounded border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  Import guide and settings / 导入背景与设置
                </summary>
                <div className="mt-3 space-y-4 border-t border-slate-200 pt-3">
                  <div>
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
                  </div>

                  <MicSelector
                    onSelected={(id) => {
                      console.log("Preferred mic deviceId:", id);
                    }}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Underlying mode</span>
                      <select
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        disabled={isActive}
                      >
                        <option value="face-to-face">Face to Face</option>
                        <option value="interview-meeting">Interview/Meeting</option>
                        <option value="call-out">Call Out (future)</option>
                        <option value="call-in">Call In (future)</option>
                        <option value="notes">Notes (Silent Transcript)</option>
                      </select>
                    </label>

                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">My name / identity</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
                        placeholder="e.g. Lucy"
                        value={myName}
                        onChange={(e) => setMyName(e.target.value)}
                        disabled={isActive || autoNameFromGuide}
                      />
                    </label>
                  </div>

                  <div className="grid gap-2 text-sm text-slate-700">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoNameFromGuide}
                        onChange={(e) => setAutoNameFromGuide(e.target.checked)}
                        disabled={isActive}
                      />
                      Auto-detect my name from guide
                    </label>

                    {mode !== "notes" && (
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={voiceOutputMode === "AGENT"}
                          onChange={(e) => setVoiceOutputMode(e.target.checked ? "AGENT" : "LIVE")}
                          disabled={isActive}
                        />
                        Voice output mode: {voiceOutputMode === "AGENT" ? "AI speaks" : "manual only"}
                      </label>
                    )}

                    {mode !== "notes" && voiceOutputMode === "LIVE" && (
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={autoSuggestEnabled}
                          onChange={(e) => setAutoSuggestEnabled(e.target.checked)}
                          disabled={isActive}
                        />
                        Auto-generate suggestions after the other person speaks
                      </label>
                    )}

                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={speakerMode}
                        onChange={(e) => setSpeakerMode(e.target.checked)}
                        disabled={isActive}
                      />
                      Speakerphone echo shield
                    </label>
                  </div>
                </div>
              </details>
        </div>
      </details>

      <section className="space-y-5">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-950">
            Chinese Meaning / 中文理解
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Only updates when target is Other person / 只在分析对象为对方时更新
          </p>
          <div className="mt-4 min-h-44 rounded-lg border border-amber-200 bg-amber-50 p-5">
            {latestOriginal || latestMeaning ? (
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Original / 原文
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-lg leading-8 text-slate-950">
                    {latestOriginal}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Chinese meaning / 中文理解
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-lg leading-8 text-slate-900">
                    {latestMeaning}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-base leading-7 text-slate-600">
                对方说完一句后，这里会先显示英文原文，再显示中文理解。
              </div>
            )}
          </div>
        </article>

        <article className="rounded-lg border-2 border-blue-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-blue-950">
                Suggested English / 我可以说
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Paused while target is Me. Previous suggestion stays visible.
                当分析对象是我时暂停更新，上一条建议会保留。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedOptions.length > 1 && (
                <button
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={copyAllLines}
                >
                  Copy all
                </button>
              )}
              {pendingLines.length > 0 && (
                <button
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={clearPendingLines}
                >
                  Clear
                </button>
              )}
              <button
                className="rounded bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={generateSuggestedLine}
                disabled={isGeneratingLine}
              >
                {isGeneratingLine ? "Generating..." : "Regenerate"}
              </button>
            </div>
          </div>

          <div className="mt-5 min-h-60 space-y-3">
            {suggestedOptions.length ? (
              suggestedOptions.map((line, idx) => (
                <div key={`${line}-${idx}`} className="rounded-lg border border-blue-100 bg-blue-50 p-5">
                  <div className="whitespace-pre-wrap text-2xl leading-10 text-slate-950">
                    {line}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                      onClick={() => copySingleLine(line)}
                    >
                      Copy
                    </button>
                    <button
                      className="rounded border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
                      onClick={() => speakSuggestedLine(line)}
                    >
                      Speak this line
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 p-6 text-base leading-7 text-slate-600">
                Suggestions will appear here after the other person speaks.
              </div>
            )}
          </div>

          <ManualInputBox onSend={handleManualSend} />
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-slate-950">
              Recent Transcript / 最近记录
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
            }`}>
              {isActive ? "Listening" : "Paused"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {activeSpeaker === "partner"
              ? "Recording the other person. Suggestions will update."
              : "Recording you as Me. Chinese Meaning and Suggested English are paused."}
          </p>

          {liveCaption && (
            <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs font-semibold uppercase text-blue-700">
                Hearing now
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-800">{liveCaption}</div>
            </div>
          )}

          <div className="mt-3 min-h-32 space-y-3">
            {transcriptMessages.length ? (
              transcriptMessages.map((msg) => (
                <div key={msg.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    {msg.speaker === "me" || msg.isManual ? "Me" : "Other person"}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-800">
                    {msg.contentEN}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Start listening to see recent speech here.
              </div>
            )}
          </div>
        </article>
      </section>

      <details className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Session log and export / 对话记录与导出
        </summary>
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Conversation record</h3>
            <div className="flex flex-wrap gap-2">
              {mode === "notes" && (
                <button
                  className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700"
                  onClick={() => maybeInsertTimestamp(true)}
                >
                  Insert Timestamp
                </button>
              )}
              <button
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={exportConversation}
                disabled={conversation.length === 0}
              >
                Export .txt
              </button>
              {mode === "notes" && (
                <button
                  className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  onClick={exportConversationMarkdown}
                  disabled={conversation.length === 0}
                >
                  Export .md
                </button>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            {conversation.length ? (
              conversation.map((msg, idx) => {
                if (isTimestampLine(msg.contentEN)) {
                  const timeStr = extractHHMM(msg.contentEN);
                  return (
                    <div key={msg.id || idx} className="my-4 text-center">
                      <div className="inline-block rounded-full bg-slate-200 px-4 py-1 text-sm font-medium text-slate-700">
                        {timeStr || msg.contentEN}
                      </div>
                    </div>
                  );
                }

                const isUser = msg.role === "user";
                const roleLabel = isUser
                  ? msg.isManual
                    ? `${myName || "Me"} (manual)`
                    : msg.speaker === "me"
                    ? "Me"
                    : "Other person"
                  : "Suggested English";

                return (
                  <div key={msg.id || idx} className="mb-3 rounded bg-white p-3 text-sm leading-6">
                    <div className="font-semibold text-slate-700">{roleLabel}</div>
                    <div className="mt-1 whitespace-pre-wrap text-slate-900">{msg.contentEN}</div>
                    {msg.contentZH && msg.contentZH !== msg.contentEN && (
                      <div className="mt-1 whitespace-pre-wrap text-slate-600">{msg.contentZH}</div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-500">No conversation yet.</div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
