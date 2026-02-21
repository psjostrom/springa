import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 500 },
    );
  }

  const { messages, context } = await req.json();

  const anthropic = createAnthropic({ apiKey });

  // Convert UI messages (parts format) to core messages (content format)
  const coreMessages = messages.map((m: { role: string; parts?: { type: string; text?: string }[]; content?: string }) => ({
    role: m.role,
    content: m.content ?? m.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ?? "",
  }));

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: context || undefined,
    messages: coreMessages,
  });

  return result.toTextStreamResponse();
}
