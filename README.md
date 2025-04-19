# 🤖 AI Voice Assistant – 智能语音秘书

一个基于 OpenAI 与语音合成技术的智能语音助手，  
可根据用户输入的中文指令，自动模拟英文语音通话，替用户拨打电话与 HR、客服等进行沟通。

---

## 🧠 项目功能

- 🗣️ 支持中文指令输入（例如“帮我改面试时间”）
- 🤖 调用 GPT API 模拟人类身份生成英文通话内容
- 🔊 使用 ElevenLabs 进行自然语音合成
- 🎙️ 支持语音识别（转录用户语音）
- 📝 显示完整通话内容并支持多轮追踪
- 📅 可根据预设日程调整面试、预约时间
- 🔌 模块化设计，支持扩展更多通话场景（HR、快递、政府、客服…）

---

## 📁 项目结构概览

```bash
ai-voice-assistant/
├── pages/                  # Next.js 页面
├── components/             # 前端组件（转录显示、按钮、加载动画等）
├── lib/                    # OpenAI & ElevenLabs 接口封装
├── ai-calls/               # ✅ 核心模块：AI 模拟打电话逻辑
│   ├── scheduler.ts              # 用户日程匹配逻辑
│   ├── callPromptBuilder.ts     # 构建 GPT Prompt
│   ├── callAgent.ts             # 封装 GPT 对话逻辑
│   └── templates/
│       └── rescheduleInterview.ts  # 改面试时间任务模板
├── public/                 # 静态资源
├── .env.local              # 环境变量（需配置 API 密钥）
├── README.md               # 本文件
├── README_FOR_CURSOR.md    # ✅ 给 Cursor 的开发指令（勿删）
