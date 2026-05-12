import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { formatAIError } from "@/lib/aiError";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 500 },
    );
  }

  let body: {
    messages: { role: string; parts?: { type: string; text?: string }[]; content?: string }[];
    context?: string;
  };
  try {
    body = (await req.json()) as {
      messages: { role: string; parts?: { type: string; text?: string }[]; content?: string }[];
      context?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { messages, context } = body;

  const systemPrompt = context ?? "";
  const anthropic = createAnthropic({ apiKey });

  // Convert UI messages (parts format) to core messages (content format)
  const coreMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content ?? m.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ?? "",
  }));

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt || undefined,
      messages: coreMessages,
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
