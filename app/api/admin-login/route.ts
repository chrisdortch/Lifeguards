import { NextResponse } from "next/server";
import { adminCode, setAdminSession } from "../../../lib/auth";
import { getState, hasDatabase } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    if (!body.code || body.code !== adminCode()) {
      return NextResponse.json({ ok: false, error: "Invalid admin code." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, admin: true, shared: hasDatabase(), state: await getState() });
    setAdminSession(response);
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
