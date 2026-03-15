"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Loader2 } from "lucide-react";
import { useAtomValue } from "jotai";
import { ChatMessage } from "../components/ChatMessage";
import { ChatInput } from "../components/ChatInput";
import { useCoachData } from "../hooks/useCoachData";
import {
  enrichedEventsAtom,
  wellnessEntriesAtom,
  phaseInfoAtom,
  bgModelAtom,
  settingsAtom,
  paceTableAtom,
  currentBGAtom,
  trendSlopeAtom,
  trendAtom,
  lastBGUpdateAtom,
  readingsAtom,
  runBGContextsAtom,
} from "../atoms";
const SUGGESTIONS = [
  "How's my training load looking?",
  "Analyze my BG trends",
  "What can we conclude about my BG before, during and after runs?",
  "How am I progresing for the Ecotrail 16km?",
];

function getMessageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");
}

export function CoachScreen() {
  const events = useAtomValue(enrichedEventsAtom);
  const wellnessEntries = useAtomValue(wellnessEntriesAtom);
  const phaseInfo = useAtomValue(phaseInfoAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const settings = useAtomValue(settingsAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const currentBG = useAtomValue(currentBGAtom);
  const trendSlope = useAtomValue(trendSlopeAtom);
  const trendArrow = useAtomValue(trendAtom);
  const lastUpdate = useAtomValue(lastBGUpdateAtom);
  const readings = useAtomValue(readingsAtom);
  const runBGContexts = useAtomValue(runBGContextsAtom);
  const raceDate = settings?.raceDate;
  const lthr = settings?.lthr;
  const maxHr = settings?.maxHr;
  const hrZones = settings?.hrZones ?? [];
  const { context, isLoading: contextLoading } = useCoachData({
    events,
    wellnessEntries,
    phaseInfo,
    bgModel,
    raceDate,
    lthr,
    maxHr,
    hrZones,
    paceTable,
    currentBG,
    trendSlope,
    trendArrow,
    lastUpdate,
    readings,
    runBGContexts,
  });

  const transport = new TextStreamChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages, trigger, requestMetadata }) => ({
      body: { id, messages, context: requestMetadata as string, trigger },
    }),
  });

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
    void sendMessage({ text: msg }, { metadata: context });
  };

  const showWelcome = messages.length === 0 && !contextLoading;

  return (
    <div className="h-full flex flex-col bg-[#13101c]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          {contextLoading && (
            <div className="flex items-center justify-center py-12 text-[#af9ece]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading training data...</span>
            </div>
          )}

          {showWelcome && (
            <div className="pt-8 pb-4">
              <h2 className="text-lg font-bold text-white mb-1">AI Coach</h2>
              <p className="text-sm text-[#af9ece] mb-6">
                Ask about training, fueling, BG management, or upcoming
                workouts.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { handleSend(s); }}
                    className="text-sm px-3 py-1.5 rounded-full border border-[#2e293c] bg-[#1d1828] text-[#af9ece] hover:border-[#f23b94]/50 hover:text-white transition-colors"
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
                <div className="bg-[#1d1828] border border-[#2e293c] rounded-2xl px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-[#af9ece]" />
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
        onSubmit={() => { handleSend(); }}
        isLoading={chatBusy || contextLoading}
      />
    </div>
  );
}
