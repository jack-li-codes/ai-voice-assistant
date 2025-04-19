# 📘 README_FOR_CURSOR.md

## 🧠 项目目标  
开发一个 AI 语音助手，接收用户中文任务描述，自动用英文模拟用户身份进行电话沟通。

---

## 📞 第一步任务：AI 打 HR 电话改面试时间

### 1. 模块说明
- `ai-calls/`：集中处理 AI 模拟打电话功能
  - `scheduler.ts`：日程数据处理模块（可用时间匹配）
  - `callPromptBuilder.ts`：将用户需求转成 GPT Prompt
  - `callAgent.ts`：调用 GPT 模拟对话
  - `templates/rescheduleInterview.ts`：改面试时间任务模板

---

### 2. Cursor 指令  
请严格按照以下规则：

- ❌ 不改动已有业务逻辑（除非我提出）  
- ✅ 所有新逻辑写入 `ai-calls/` 下  
- ✅ 每个功能写成独立模块并注释清楚  
- ✅ `.env.local` 内 API 密钥请读取，不要硬编码  

---

### 3. ✅ 下一步开发指令
☑️ 实现 `rescheduleInterview.ts` 模板逻辑  
☑️ 根据该模板生成 callPrompt  
☑️ 在 `callAgent.ts` 中封装 GPT 调用函数  
☑️ 前端按钮触发 `callAgent`（模拟拨打）

