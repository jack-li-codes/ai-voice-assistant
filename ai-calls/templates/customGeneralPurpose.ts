/**
 * customGeneralPurpose.ts
 * 用于接收自由输入的中文意图说明，并生成英文电话沟通脚本
 */

import { buildCallPrompt } from "../02_callPromptBuilder";

export interface CustomTaskParams {
  userInstruction: string; // 用户自由输入的任务说明（中文）
}

export async function customGeneralPurposePrompt(params: CustomTaskParams): Promise<string> {
  const { userInstruction } = params;

  const systemPrompt = `
You are an AI phone assistant. Your job is to help the user complete their task by making a polite and effective phone call.
The user will describe their situation in Chinese. Please extract the intent and generate a realistic, well-structured English phone script.
The script should:
- Be natural and polite
- Be role-appropriate (e.g. acting as the user or their representative)
- Be detailed, but not overly robotic
`;

  const fullPrompt = `
用户的说明如下：
"""
${userInstruction}
"""

请用英文生成完整的电话通话内容（从开头问候、表明身份，到提出请求、收尾道别）。
`;

  return await buildCallPrompt({
    type: 'rescheduleInterview',
    params: {
      userName: 'Lucy Jin',
      originalTime: 'now',
      newTime: 'later',
      companyName: 'Custom Task'
    }
  });
}
