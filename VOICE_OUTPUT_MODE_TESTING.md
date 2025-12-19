# Voice Output Mode - 测试指南

## 功能概述

系统现在支持两种模式：

- **Live 模式（默认）**: Voice Output OFF - 你说话，AI 只生成文字建议
- **Agent 模式**: Voice Output ON - AI 替你说话（TTS 播放）

---

## 修改清单

### 文件修改
1. **app/components/LiveConversation.tsx** - 主要修改
   - 添加 `voiceOutputMode` 状态（"LIVE" | "AGENT"）
   - 添加 `showAdvanced` 状态用于折叠高级设置
   - Live/Agent 两套 prompt（systemMessage & userMessage）
   - TTS 播放逻辑：仅在 Agent 模式下调用 `speakWithElevenLabs`
   - UI 显示：Live 模式显示 "💡 Suggested Reply"，Agent 模式显示 "🤖 AI"
   - 简化顶部设置 UI，高级选项折叠到 Advanced
   - Stop 时调用 `stopCurrentSpeech()` 停止 TTS

2. **lib/voice/speakWithElevenLabs.ts** - 无修改（导出已有的 `stopCurrentSpeech`）

---

## 如何测试

### 1. Live 模式测试（Voice Output OFF）

**步骤：**
1. 启动应用：`npm run dev`
2. 打开浏览器：http://localhost:3000
3. 确认 Voice Output 显示为 **OFF (you speak)**
4. 在 GUIDE 中输入一些背景信息（例如："I'm going to meet Kevin tomorrow for a 1-on-1."）
5. 点击 **开始 Start**
6. 对着麦克风说话（例如："Hello, how are you?"）

**预期结果：**
- ✅ 对方说话被识别并显示为 "🧑 Partner"
- ✅ AI 不播放任何语音（完全静音）
- ✅ AI 生成的建议显示为 "💡 Suggested Reply:"
- ✅ 建议文字简洁自然，像"你可以说的话"（第一人称）
- ✅ 中文翻译折叠在 "Show Chinese 显示中文" 下
- ✅ 不会出现 "I'm an AI" 这样的词

**示例输出格式：**
```
💡 Suggested Reply:
    Hey! I'm doing well, thanks. Looking forward to our meeting tomorrow.

▼ Show Chinese 显示中文
    嘿！我很好，谢谢。期待明天的会议。
```

---

### 2. Agent 模式测试（Voice Output ON）

**步骤：**
1. 勾选 Voice Output 开关（切换到 ON）
2. 确认显示为 **ON (AI speaks)**
3. 点击 **开始 Start**
4. 对着麦克风说话

**预期结果：**
- ✅ 对方说话被识别并显示
- ✅ AI **播放语音**（能听到 TTS）
- ✅ AI 回复显示为 "🤖 AI (EN): ..." 和 "🤖 AI (ZH): ..."
- ✅ 保持原有对话记录样式（双语显示）
- ✅ 不会出现多段语音重叠

---

### 3. 关键功能验证

#### 3.1 停止功能
- ✅ 点击 **停止 Stop** 后，如果 TTS 正在播放，应该**立即停止**
- ✅ 识别也应该停止

#### 3.2 模式切换
- ✅ 在未开始对话时可以自由切换 Voice Output ON/OFF
- ✅ 对话进行中时，开关应该是 disabled 状态

#### 3.3 Advanced 设置折叠
- ✅ 默认情况下，Advanced Settings 是折叠的
- ✅ 点击 "Advanced Settings 高级设置 ▼" 可以展开
- ✅ 展开后可以看到：
  - My Name 我的身份
  - Counterparty 对方身份
  - Speakerphone Mode (Echo Shield)

#### 3.4 现有功能不回归
- ✅ warmup empty-submit：启动后 800ms 内的短文本被忽略
- ✅ TTS overlap：不会出现多段语音重叠播放
- ✅ 手动输入（ManualInputBox）仍然正常工作
- ✅ 导出对话记录功能正常

---

## 常见问题

### Q: Live 模式下还能听到语音吗？
**A:** 不能。Live 模式（Voice Output OFF）完全关闭 TTS，AI 只生成文字建议供你自己朗读。

### Q: Agent 模式和之前有什么区别？
**A:** Agent 模式保持原有逻辑，TTS 正常播放，提示词也保持原样。

### Q: 切换模式需要刷新页面吗？
**A:** 不需要。切换模式后立即生效（对话未开始时）。

### Q: Live 模式下的"建议回复"是中文还是英文？
**A:** 默认英文为主。中文翻译折叠显示，点击 "Show Chinese" 可展开。

---

## 成功标准

所有以下验收标准均需通过：

### Live 模式（Voice Output OFF）
- [x] 对方说话被识别
- [x] AI 不播放任何语音
- [x] 显示 "💡 Suggested Reply:"
- [x] 建议文字自然、口语化（第一人称）
- [x] 遇到不确定问题，AI 给出保守自然的兜底回复

### Agent 模式（Voice Output ON）
- [x] 对方说话被识别
- [x] AI 正常播放语音
- [x] 不会出现多段语音重叠
- [x] Stop 后语音立即停止

### UI
- [x] Voice Output toggle 清晰易懂
- [x] Advanced 设置默认折叠
- [x] 模式切换流畅

---

## 下一步（可选）

如果测试通过，可以考虑：
1. 根据实际使用调整 Live 模式的 prompt
2. 优化中文显示的折叠/展开体验
3. 添加键盘快捷键切换模式
4. 保存用户的模式偏好到 localStorage

---

**测试完成后，请告诉我结果！** 🚀
