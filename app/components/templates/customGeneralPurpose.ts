export type CustomTaskParams = {
  userName: string;
  taskDescription: string;
  additionalContext?: string;
};

export const customGeneralPurposeTemplate = (params: CustomTaskParams) => {
  const { userName, taskDescription, additionalContext = "" } = params;
  
  return {
    taskType: "custom" as const,
    params,
    prompt: `You are ${userName}, performing a custom task.
    Task description: ${taskDescription}
    ${additionalContext ? `Additional context: ${additionalContext}` : ""}
    Please be polite and professional.`
  };
}; 