import { NextResponse } from "next/server";
import { getState, hasDatabase, saveState } from "../../../lib/store";
import type { AppState } from "../../../lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getState();
    return NextResponse.json({ ok: true, shared: hasDatabase(), state });
  } catch (error) {
    return NextResponse.json({ ok: false, shared: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { state?: AppState };
    if (!body.state || !Array.isArray(body.state.shifts) || !Array.isArray(body.state.requests)) {
      return NextResponse.json({ ok: false, error: "Invalid schedule state." }, { status: 400 });
    }
    const state = await saveState(body.state);
    return NextResponse.json({ ok: true, shared: hasDatabase(), state });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
