"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Loader2 } from "lucide-react";
import { ChatMessage } from "../components/ChatMessage";
import { ChatInput } from "../components/ChatInput";
import { useCoachData } from "../hooks/useCoachData";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import type { RunBGContext } from "@/lib/runBGContext";
import type { RunFeedbackRecord } from "@/lib/feedbackDb";

const SUGGESTIONS = [
  "How's my training load looking?",
  "Analyze my BG trends",
  "What can we conclude about my BG before, during and after runs?",
  "How am I progresing for the Ecotrail 16km?",
];

function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");
}

interface CoachScreenProps {
  events: CalendarEvent[];
  phaseInfo: { name: string; week: number; progress: number };
  bgModel: BGResponseModel | null;
  raceDate?: string;
  currentBG?: number | null;
  trendSlope?: number | null;
  trendArrow?: string | null;
  lastUpdate?: Date | null;
  readings?: XdripReading[];
  runBGContexts?: Map<string, RunBGContext>;
}

export function CoachScreen({
  events,
  phaseInfo,
  bgModel,
  raceDate,
  currentBG,
  trendSlope,
  trendArrow,
  lastUpdate,
  readings,
  runBGContexts,
}: CoachScreenProps) {
  const [recentFeedback, setRecentFeedback] = useState<RunFeedbackRecord[]>();
  useEffect(() => {
    fetch("/api/recent-feedback")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRecentFeedback)
      .catch(() => setRecentFeedback([]));
  }, []);

  const { context, isLoading: contextLoading } = useCoachData({
    events,
    phaseInfo,
    bgModel,
    raceDate,
    currentBG,
    trendSlope,
    trendArrow,
    lastUpdate,
    readings,
    runBGContexts,
    recentFeedback,
  });

  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  /* eslint-disable react-hooks/refs -- ref accessed in callback, not during render */
  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
          body: { id, messages, context: contextRef.current, trigger },
        }),
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */

  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatBusy = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string) => {
    const msg = text ?? input;
    if (!msg.trim() || chatBusy) return;
    setInput("");
    sendMessage({ text: msg });
  };

  const showWelcome = messages.length === 0 && !contextLoading;

  return (
    <div className="h-full flex flex-col bg-[#0d0a1a]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          {contextLoading && (
            <div className="flex items-center justify-center py-12 text-[#b8a5d4]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading training data...</span>
            </div>
          )}

          {showWelcome && (
            <div className="pt-8 pb-4">
              <h2 className="text-lg font-bold text-white mb-1">AI Coach</h2>
              <p className="text-sm text-[#b8a5d4] mb-6">
                Ask about training, fueling, BG management, or upcoming
                workouts.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="text-sm px-3 py-1.5 rounded-full border border-[#3d2b5a] bg-[#1e1535] text-[#c4b5fd] hover:border-[#ff2d95]/50 hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-[#3d1525] border border-[#ff3366]/30 rounded-xl px-4 py-3 text-sm text-[#ff3366]">
              Failed to get response. Check your API key and try again.
            </div>
          )}

          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              role={m.role as "user" | "assistant"}
              content={getMessageText(m.parts)}
            />
          ))}

          {chatBusy &&
            messages.length > 0 &&
            getMessageText(messages[messages.length - 1].parts) === "" && (
              <div className="flex justify-start">
                <div className="bg-[#1e1535] border border-[#3d2b5a] rounded-2xl px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-[#b8a5d4]" />
                </div>
              </div>
            )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={() => handleSend()}
        isLoading={chatBusy || contextLoading}
      />
    </div>
  );
}
