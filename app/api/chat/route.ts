import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { formatAIError } from "@/lib/aiError";
import { getBGPatterns } from "@/lib/bgPatternsDb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
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

  const body = (await req.json()) as {
    messages: { role: string; parts?: { type: string; text?: string }[]; content?: string }[];
    context?: string;
  };
  const { messages, context } = body;

  const patterns = await getBGPatterns(email);

  let systemPrompt = context ?? "";
  if (patterns?.patternsText) {
    systemPrompt += `\n\n## Cross-Run BG Patterns\nThese are statistically validated patterns from the runner's completed runs. Cite relevant patterns when answering BG, fueling, or training questions.\n${patterns.patternsText}`;
  }

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
