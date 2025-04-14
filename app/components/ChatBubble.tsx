import React from "react";

type Props = {
  sender: "user" | "ai";
  text: string;
  isLoading?: boolean;
};

export default function ChatBubble({ sender, text, isLoading = false }: Props) {
  const isUser = sender === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={`px-4 py-2 max-w-xs rounded-2xl shadow text-sm whitespace-pre-wrap
        ${isUser
          ? "bg-blue-500 text-white rounded-br-none"
          : isLoading
          ? "bg-gray-300 text-gray-600 animate-pulse rounded-bl-none"
          : "bg-gray-200 text-black rounded-bl-none"}
      `}
      >
        {isLoading ? "AI 正在思考中..." : text}
      </div>
    </div>
  );
}