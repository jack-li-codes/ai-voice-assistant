export type TrackPackageParams = {
  userName: string;
  trackingNumber: string;
  recipientName?: string;
};

export const trackPackageTemplate = (params: TrackPackageParams) => {
  const { userName, trackingNumber, recipientName = "me" } = params;
  
  return {
    taskType: "trackPackage" as const,
    params,
    prompt: `You are ${userName}, calling to track a package. 
    The tracking number is ${trackingNumber}.
    The package is for ${recipientName}. Please be polite and professional.`
  };
}; 