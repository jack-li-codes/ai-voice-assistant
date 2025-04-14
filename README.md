# 🎙️ 智能 AI 面试助手（AI Voice Interview Assistant）

一个基于 Next.js、OpenAI GPT-4 和 ElevenLabs 的语音交互式 AI 面试助手。  
支持语音识别、自然语言对话、语音朗读、多轮问答、多语言扩展等能力，未来可用于模拟电话面试、安排空闲时间、对接真实客服系统等应用场景。

---

## 🚀 项目亮点

- 🤖 使用 GPT-4 实现语义理解与自然语言对话
- 🎤 浏览器语音识别（SpeechRecognition）
- 🗣️ 使用 ElevenLabs 合成自然语音（支持中英双语）
- 💬 GPT 回复实时流式展示
- 🌀 语音识别中动画加载（待办）
- 🧠 可扩展多轮问答、时间管理、电话交互等功能

---

## 🧱 技术栈

- [Next.js 14](https://nextjs.org/)（App Router）
- TypeScript + TailwindCSS
- OpenAI GPT API + Streaming
- ElevenLabs 语音合成
- 浏览器端 SpeechRecognition + Audio 播放

---

## 🗂️ 项目结构与开发规范（Cursor 请严格遵守）

- 所有 GPT 请求必须通过 `/api/chat` 实现，使用 `StreamingTextResponse` 返回
- GPT 请求封装必须在 `openai.chat.completions.create` 内
- OpenAI Key 不能暴露在前端
- 所有语音功能封装在 `VoiceAssistant.tsx`
- 禁止将业务逻辑写在 `page.tsx` 页面文件内部

---

## 🔒 安全与依赖控制

- 不允许在前端直接调用 OpenAI
- 避免引入大型第三方库（如 lodash、moment）
- `.env.local` 已加入 `.gitignore`

---

## 📅 开发任务计划

| 编号 | 功能                          | 状态       |
|------|-------------------------------|------------|
| 242  | 接入 OpenAI GPT API           | ✅ 已完成  |
| 243  | 展示对话记录（问答气泡 UI）   | 🔜 进行中  |
| 244  | 加入语音识别中动画             | ⏳ 待办     |
| 245  | 支持多轮语音对话               | ⏳ 待办     |
| 246  | 可配置面试空闲时间表           | ⏳ 待办     |
| 247  | 与电话系统打通（模拟预约等）   | ⏳ 待办     |

---

## 🧪 快速本地运行

```bash
npm install
npm run dev
