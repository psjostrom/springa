import { NextResponse } from "next/server";
import { AuthError, errorResponse, requireAuth, unauthorized } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { replaceWorkoutOnDate } from "@/lib/intervalsApi";
import { isOnDemandCategory, isWorkoutDate, previewSingleWorkout, singleWorkoutErrorResponse } from "@/lib/singleWorkout";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    throw error;
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", "INVALID_INPUT", 400);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Invalid input", "INVALID_INPUT", 400);
  }
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length !== 3 ||
    !isWorkoutDate(input.date) ||
    !isOnDemandCategory(input.category) ||
    typeof input.previewHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.previewHash)
  ) {
    return errorResponse("Invalid input", "INVALID_INPUT", 400);
  }
  const credentials = await getUserCredentials(email);
  if (!credentials?.intervalsApiKey) {
    return errorResponse("Intervals.icu not configured", "MISSING_CREDENTIALS", 400);
  }
  try {
    const { preview, workout } = await previewSingleWorkout(email, credentials.intervalsApiKey, input.date, input.category);
    if (preview.previewHash !== input.previewHash) {
      return errorResponse("Workout preview has changed. Preview it again before saving.", "WORKOUT_PREVIEW_STALE", 409);
    }
    const newId = await replaceWorkoutOnDate(credentials.intervalsApiKey, undefined, workout);
    return NextResponse.json({ newId });
  } catch (error) {
    return singleWorkoutErrorResponse(error);
  }
}
