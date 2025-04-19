/**
 * callPromptBuilder.ts
 * 
 * ✅ Prompt生成器模块：
 * - 根据不同场景构建通话提示词
 * - 生成符合上下文的对话内容
 * - 优化AI回复的自然度
 */
/**
 * 📦 callPromptBuilder.ts
 * 功能：统一处理通话 prompt 构建逻辑
 * 输入：任务类型 + 用户参数
 * 输出：GPT 可用的英文 prompt
 */

import { buildRescheduleInterviewPrompt, RescheduleInterviewParams } from './templates/rescheduleInterview'

type CallTaskType = 'rescheduleInterview' // ✅ 你以后可以加更多类型，比如 'deliveryInquiry' 等

interface CallPromptInput {
  type: CallTaskType
  params: RescheduleInterviewParams
}

export function buildCallPrompt({ type, params }: CallPromptInput): string {
  switch (type) {
    case 'rescheduleInterview':
      return buildRescheduleInterviewPrompt(params)
    default:
      throw new Error(`Unsupported call task type: ${type}`)
  }
}
