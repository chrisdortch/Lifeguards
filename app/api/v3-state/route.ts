import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/auth";
import { getStateV3, hasDatabase, saveStateV3 } from "../../../lib/store-v3";
import type { AppState } from "../../../lib/schedule-v3";
import { legacyAnonymousState } from "../../../lib/state-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = await getStateV3();
    const admin = isAdminRequest(request);
    return NextResponse.json({ ok: true, admin, shared: hasDatabase(), state: admin ? state : legacyAnonymousState(state) });
  }
  catch (error) { return NextResponse.json({ ok: false, shared: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ ok: false, error: "Admin login required." }, { status: 401 });
    const body = (await request.json()) as { state?: AppState; replace?: boolean; hardReplace?: boolean };
    if (!body.state || !Array.isArray(body.state.shifts) || !Array.isArray(body.state.requests)) return NextResponse.json({ ok: false, error: "Invalid schedule state." }, { status: 400 });
    return NextResponse.json({ ok: true, shared: hasDatabase(), state: await saveStateV3(body.state, { replace: Boolean(body.replace), hardReplace: Boolean(body.hardReplace) }) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }); }
}
