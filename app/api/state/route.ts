import { NextResponse } from "next/server";
import { guardNameForRequest, isAdminRequest } from "../../../lib/auth";
import { getState, hasDatabase, saveState } from "../../../lib/store";
import type { AppState } from "../../../lib/schedule";
import { anonymousState, guardState } from "../../../lib/state-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = await getState();
    const admin = isAdminRequest(request);
    const guardName = guardNameForRequest(request);
    const clientState = admin ? state : guardName ? guardState(state, guardName) : anonymousState(state);
    return NextResponse.json({ ok: true, admin, guardName: admin ? "" : guardName, shared: hasDatabase(), state: clientState });
  } catch (error) {
    return NextResponse.json({ ok: false, shared: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ ok: false, error: "Admin login required." }, { status: 401 });
    }
    const body = (await request.json()) as { state?: AppState; replace?: boolean; hardReplace?: boolean };
    if (!body.state || !Array.isArray(body.state.shifts) || !Array.isArray(body.state.requests)) {
      return NextResponse.json({ ok: false, error: "Invalid schedule state." }, { status: 400 });
    }
    const state = await saveState(body.state, { replace: Boolean(body.replace), hardReplace: Boolean(body.hardReplace) });
    return NextResponse.json({ ok: true, admin: true, shared: hasDatabase(), state });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
