import { APICallError } from "@ai-sdk/provider";

export function formatAIError(err: unknown): { message: string; status: number } {
  if (APICallError.isInstance(err)) {
    if (err.statusCode === 402)
      return { message: "Anthropic API credits exhausted. Top up at console.anthropic.com.", status: 402 };
    if (err.statusCode === 429)
      return { message: "Anthropic rate limit hit. Try again in a minute.", status: 429 };
    if (err.statusCode === 401)
      return { message: "Anthropic API key is invalid.", status: 401 };
    return { message: err.message || "Anthropic API error.", status: err.statusCode ?? 500 };
  }
  return { message: "Unexpected AI error.", status: 500 };
}
