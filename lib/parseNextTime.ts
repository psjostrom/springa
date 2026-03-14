/**
 * Extract "Next Time" bullet points from a Run Analysis markdown string.
 * Returns an array of bullet text (without the leading "- ").
 */
export function parseNextTime(markdown: string | null | undefined): string[] {
  if (!markdown) return [];

  const match = markdown.match(/\*\*Next Time\*\*:?\s*\n([\s\S]*?)(?=\n\*\*|\n##|$)/);
  if (!match) return [];

  const block = match[1].trim();
  return block
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line.length > 0);
}
