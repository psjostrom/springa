import { NextResponse } from "next/server";
import { AuthError, errorResponse, requireAuth, unauthorized } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { isOnDemandCategory, isWorkoutDate, previewSingleWorkout, singleWorkoutErrorResponse } from "@/lib/singleWorkout";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    throw error;
  }
  const query = new URL(req.url).searchParams;
  const date = query.get("date");
  const category = query.get("category");
  if (
    !isWorkoutDate(date) ||
    (category !== null && !isOnDemandCategory(category)) ||
    [...query.keys()].some(key => (key !== "date" && key !== "category") || query.getAll(key).length !== 1)
  ) {
    return errorResponse("Invalid input", "INVALID_INPUT", 400);
  }
  const credentials = await getUserCredentials(email);
  if (!credentials?.intervalsApiKey) {
    return errorResponse("Intervals.icu not configured", "MISSING_CREDENTIALS", 400);
  }
  try {
    const { preview } = await previewSingleWorkout(email, credentials.intervalsApiKey, date, category ?? undefined);
    return NextResponse.json(preview);
  } catch (error) {
    return singleWorkoutErrorResponse(error);
  }
}
