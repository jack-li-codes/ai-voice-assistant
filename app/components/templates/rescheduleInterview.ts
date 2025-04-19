export type RescheduleInterviewParams = {
  userName: string;
  originalTime: string;
  newTime: string;
  companyName?: string;
};

export const rescheduleInterviewTemplate = (params: RescheduleInterviewParams) => {
  const { userName, originalTime, newTime, companyName = "the company" } = params;
  
  return {
    taskType: "rescheduleInterview" as const,
    params,
    prompt: `You are ${userName}, calling HR to reschedule an interview. 
    The original interview time was ${originalTime}, and you want to change it to ${newTime}.
    The company is ${companyName}. Please be polite and professional.`
  };
}; 