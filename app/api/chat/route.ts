import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { auth } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(session.user.email);
  const aiKey = settings.googleAiApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!aiKey) {
    return NextResponse.json(
      { error: "No Google AI API key configured." },
      { status: 400 },
    );
  }

  const { messages, context } = await req.json();

  const google = createGoogleGenerativeAI({ apiKey: aiKey });

  // Convert UI messages (parts format) to core messages (content format)
  const coreMessages = messages.map((m: { role: string; parts?: { type: string; text?: string }[]; content?: string }) => ({
    role: m.role,
    content: m.content ?? m.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ?? "",
  }));

  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: context || undefined,
    messages: coreMessages,
  });

  return result.toTextStreamResponse();
}
