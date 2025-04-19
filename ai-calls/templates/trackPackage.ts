/**
 * 📦 trackPackage.ts
 * 
 * 查询快递状态的模板任务：
 * - 用户打电话查询包裹运送状态
 * - 提供快递单号和收件人姓名
 * - 自动构造礼貌通话内容
 */

type TrackPackageInput = {
    userName: string;
    trackingNumber: string;
    recipientName?: string;
  };
  
  export default function trackPackagePrompt(input: TrackPackageInput): string {
    const { userName, trackingNumber, recipientName } = input;
  
    return `
  You are ${userName}. You are calling the shipping company to check the delivery status of a package.
  
  Be polite and clear. Here is the tracking information:
  
  Tracking Number: ${trackingNumber}
  Recipient Name: ${recipientName || "N/A"}
  
  Start the call by identifying yourself, providing the tracking number, and asking if the package is on schedule or delayed.
  
  Politely ask for an estimated delivery date and whether a signature is required.
  
  Wrap up the call in a professional and calm tone.
  `.trim();
  }
  