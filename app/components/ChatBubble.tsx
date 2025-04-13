import React from "react";

type Props = {
  sender: "user" | "ai";
  text: string;
};

export default function ChatBubble({ sender, text }: Props) {
  const isUser = sender === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={`px-4 py-2 max-w-xs rounded-2xl shadow text-sm whitespace-pre-wrap
        ${isUser ? "bg-blue-500 text-white rounded-br-none" : "bg-gray-200 text-black rounded-bl-none"}`}
      >
        {text}
      </div>
    </div>
  );
}
