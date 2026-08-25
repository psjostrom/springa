import { NextResponse } from "next/server";
import { AuthError, requireAuth, unauthorized } from "@/lib/apiHelpers";
import {
  parsePlannerPreviewRequest,
  PlannerError,
} from "@/lib/plannerConfig";
import { buildPlannerPreview } from "@/lib/plannerService";
import { invalidPlannerBody, plannerErrorResponse } from "../_helpers";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (error) {
    if (error instanceof AuthError) return unauthorized();
    throw error;
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw invalidPlannerBody();
    }
    const request = parsePlannerPreviewRequest(body);
    const preview = await buildPlannerPreview(email, request);
    return NextResponse.json(preview.response);
  } catch (error) {
    if (error instanceof PlannerError) return plannerErrorResponse(error);
    console.error("[planner] preview failed", error);
    throw error;
  }
}
