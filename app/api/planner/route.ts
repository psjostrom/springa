import { NextResponse } from "next/server";
import { AuthError, requireAuth, unauthorized } from "@/lib/apiHelpers";
import { PlannerError } from "@/lib/plannerConfig";
import { getPlannerState } from "@/lib/plannerService";
import { plannerErrorResponse } from "./_helpers";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    throw error;
  }

  try {
    return NextResponse.json(await getPlannerState(email));
  } catch (error) {
    if (error instanceof PlannerError) return plannerErrorResponse(error);
    console.error("[planner] state failed", error);
    throw error;
  }
}
