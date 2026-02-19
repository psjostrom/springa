"use client";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[#ff2d95]/20 border border-[#ff2d95]/30 text-white"
            : "bg-[#1e1535] border border-[#3d2b5a] text-[#f0e6ff]"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
