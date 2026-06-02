import { NextResponse } from "next/server";
import { getStateV2, hasDatabase, saveStateV2 } from "../../../lib/store-v2";
import type { AppState } from "../../../lib/schedule-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getStateV2();
    return NextResponse.json({ ok: true, shared: hasDatabase(), state });
  } catch (error) {
    return NextResponse.json({ ok: false, shared: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { state?: AppState; replace?: boolean; hardReplace?: boolean };
    if (!body.state || !Array.isArray(body.state.shifts) || !Array.isArray(body.state.requests)) {
      return NextResponse.json({ ok: false, error: "Invalid schedule state." }, { status: 400 });
    }
    const state = await saveStateV2(body.state, { replace: Boolean(body.replace), hardReplace: Boolean(body.hardReplace) });
    return NextResponse.json({ ok: true, shared: hasDatabase(), state });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
