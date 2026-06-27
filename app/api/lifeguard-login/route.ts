import { NextResponse } from "next/server";
import { setGuardSession } from "../../../lib/auth";
import { getState, hasDatabase } from "../../../lib/store";
import { guardState } from "../../../lib/state-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanPin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; pin?: string };
    const name = (body.name || "").trim();
    const pin = cleanPin(body.pin || "");
    const state = await getState();
    const guard = state.lifeguards.find((item) => sameName(item.name, name) && item.pin === pin);

    if (!guard) {
      return NextResponse.json({ ok: false, error: "That name and PIN do not match an active lifeguard record." }, { status: 401 });
    }

    const response = NextResponse.json({
      ok: true,
      guardName: guard.name,
      shared: hasDatabase(),
      state: guardState(state, guard.name),
    });
    setGuardSession(response, guard.name);
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
