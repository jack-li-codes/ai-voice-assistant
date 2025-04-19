/**
 * templates/rescheduleInterview.ts
 * 
 * ✅ 面试改期模板：
 * - 提供面试时间调整的对话模板
 * - 处理改期相关的上下文信息
 * - 生成礼貌专业的改期话术
 */
/**
 * 📞 rescheduleInterview.ts
 * 模板：拨打 HR 电话，改面试时间
 */

export interface RescheduleInterviewParams {
    userName: string         // 用户英文名，如：Lucy Jin
    originalTime: string     // 原定时间（自然语言，如 "Friday morning"）
    newTime: string          // 建议改期时间（自然语言，如 "Tuesday morning next week"）
    companyName?: string     // 可选：公司名
  }
  
  export function buildRescheduleInterviewPrompt({
    userName,
    originalTime,
    newTime,
    companyName,
  }: RescheduleInterviewParams): string {
    const intro = companyName
      ? `Hi, this is ${userName}. I'm calling about my interview with ${companyName}.`
      : `Hi, this is ${userName}. I'm calling about my upcoming interview.`;
  
    return `${intro} I was originally scheduled for ${originalTime}, but unfortunately I’m no longer available at that time. I’d like to ask if it’s possible to reschedule the interview to ${newTime}. Please let me know if that works for you. Thank you!`;
  }
  