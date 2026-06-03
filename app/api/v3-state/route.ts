import { NextResponse } from "next/server";
import { getStateV3, hasDatabase, saveStateV3 } from "../../../lib/store-v3";
import type { AppState } from "../../../lib/schedule-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ ok: true, shared: hasDatabase(), state: await getStateV3() }); }
  catch (error) { return NextResponse.json({ ok: false, shared: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { state?: AppState; replace?: boolean; hardReplace?: boolean };
    if (!body.state || !Array.isArray(body.state.shifts) || !Array.isArray(body.state.requests)) return NextResponse.json({ ok: false, error: "Invalid schedule state." }, { status: 400 });
    return NextResponse.json({ ok: true, shared: hasDatabase(), state: await saveStateV3(body.state, { replace: Boolean(body.replace), hardReplace: Boolean(body.hardReplace) }) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }); }
}
