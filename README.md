This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 🧠 Project: 智能 AI 面试助手

以下是本项目的自定义开发规范、文件结构与功能计划，供团队成员或 AI 辅助工具（如 Cursor）遵循。

## 🧠 Project: 智能 AI 面试助手

以下是本项目的自定义开发规范、文件结构与功能计划，供团队成员或 AI 辅助工具（如 Cursor）遵循。

### ✅ 技术栈
- Next.js 14 (App Router)
- TypeScript
- TailwindCSS
- Vercel AI SDK（ai）
- OpenAI GPT-4
- 浏览器内建 SpeechRecognition + SpeechSynthesis

### ✅ 项目结构约定


### ✅ 开发规范（Cursor 请严格遵守）

1. 所有 AI 回复必须走 `/api/chat` 后端接口
2. 所有 GPT 生成必须使用 `StreamingTextResponse` 返回
3. GPT 请求封装在 `openai.chat.completions.create`
4. 不允许 GPT Key 暴露在前端
5. 所有语音识别、朗读等放在 `VoiceAssistant.tsx` 内
6. 组件职责要清晰，前后端职责分明

### 🚫 禁止行为
- 不允许在前端直接访问 OpenAI
- 不允许写在 page.tsx 内部完成所有逻辑
- 不允许混用 fetch/axios
- 不建议引入 lodash、moment 等大型库（优先原生）

### 🔜 任务推进计划

| 编号 | 功能                         | 状态 |
|------|------------------------------|------|
| 242  | 接入 OpenAI GPT API 🎯        | ✅ 已完成 |
| 243  | 展示对话记录（问答气泡 UI）💬 | 🔜 下一步 |
| 244  | 加入语音识别中动画 🌀        | 待办 |
| 245  | 支持多轮语音对话 🧠          | 待办 |
| 246  | 可配置面试空闲时间表 📅       | 待办 |
| 247  | 与电话系统打通 ☎️            | 待办 |

