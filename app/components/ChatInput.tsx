"use client";

import { useRef, useCallback, type KeyboardEvent, type ChangeEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    adjustHeight();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) onSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !isLoading;

  return (
    <div
      className="flex items-end gap-2 border-t border-[#3d2b5a] bg-[#1e1535] px-3 py-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask your coach..."
        rows={1}
        disabled={isLoading}
        className="flex-1 resize-none bg-[#0d0a1a] border border-[#3d2b5a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#b8a5d4]/50 focus:outline-none focus:border-[#ff2d95]/50 disabled:opacity-50"
      />
      <button
        onClick={onSubmit}
        disabled={!canSend}
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[#ff2d95] text-white disabled:opacity-30 transition-opacity"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
