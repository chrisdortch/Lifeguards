import { NextResponse } from "next/server";
import type { AppState } from "../../../lib/schedule-v4";
import { getStateV4, hasDatabase, saveStateV4 } from "../../../lib/store-v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getStateV4();
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
    const state = await saveStateV4(body.state, { replace: Boolean(body.replace), hardReplace: Boolean(body.hardReplace) });
    return NextResponse.json({ ok: true, shared: hasDatabase(), state });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
