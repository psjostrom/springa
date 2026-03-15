"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[#f23b94]/20 border border-[#f23b94]/30 text-white whitespace-pre-wrap"
            : "bg-[#1d1828] border border-[#2e293c] text-[#f0e6ff]"
        }`}
      >
        {isUser ? content : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
              em: ({ children }) => <em className="text-[#af9ece]">{children}</em>,
              del: ({ children }) => <del className="text-[#af9ece] line-through">{children}</del>,
              h1: ({ children }) => <h1 className="text-base font-bold text-white mb-1">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-bold text-white mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-bold text-white mb-1">{children}</h3>,
              code: ({ children }) => <code className="bg-[#13101c] px-1 py-0.5 rounded text-[#00ffff] text-xs">{children}</code>,
              pre: ({ children }) => <pre className="bg-[#13101c] rounded p-2 mb-2 last:mb-0 overflow-x-auto text-xs">{children}</pre>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-[#f23b94] pl-3 text-[#af9ece] mb-2 last:mb-0">{children}</blockquote>,
              table: ({ children }) => <div className="overflow-x-auto mb-2 last:mb-0"><table className="text-xs w-full border-collapse">{children}</table></div>,
              thead: ({ children }) => <thead className="border-b border-[#2e293c]">{children}</thead>,
              th: ({ children }) => <th className="text-left px-2 py-1 text-white font-semibold">{children}</th>,
              td: ({ children }) => <td className="px-2 py-1 border-t border-[#2e293c]/50">{children}</td>,
              a: ({ href, children }) => <a href={href} className="text-[#00ffff] underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              hr: () => <hr className="border-[#2e293c] my-2" />,
              img: () => null,
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
