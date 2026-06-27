import { NextResponse } from "next/server";
import { guardNameForRequest } from "../../../lib/auth";
import { addDaysIso, openCount, todayIso } from "../../../lib/schedule";
import type { AppState, RequestItem } from "../../../lib/schedule";
import { getState, hasDatabase, saveState } from "../../../lib/store";
import { guardState } from "../../../lib/state-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function nameKey(value: string) {
  return value.trim().toLowerCase();
}

function requestKey(request: Pick<RequestItem, "shiftId" | "name">) {
  return `${request.shiftId}|${nameKey(request.name)}`;
}

function upsertAvailabilityRequest(state: AppState, shiftId: string, guardName: string) {
  const key = `${shiftId}|${nameKey(guardName)}`;
  let found = false;
  const requests = state.requests.map((request) => {
    if (requestKey(request) !== key) return request;
    found = true;
    return { ...request, name: guardName, status: "pending" as const, createdAt: request.createdAt || new Date().toISOString() };
  });
  if (!found) {
    requests.push({
      id: `${shiftId}-${guardName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      shiftId,
      name: guardName,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }
  return requests;
}

export async function POST(request: Request) {
  try {
    const sessionGuardName = guardNameForRequest(request);
    if (!sessionGuardName) {
      return NextResponse.json({ ok: false, error: "Lifeguard login required." }, { status: 401 });
    }

    const body = (await request.json()) as { shiftIds?: string[] };
    const shiftIds = Array.from(new Set((body.shiftIds || []).filter((id) => typeof id === "string")));
    if (!shiftIds.length) {
      return NextResponse.json({ ok: false, error: "No shifts selected." }, { status: 400 });
    }

    const state = await getState();
    const guard = state.lifeguards.find((item) => sameName(item.name, sessionGuardName));
    if (!guard) {
      return NextResponse.json({ ok: false, error: "Lifeguard account is no longer active." }, { status: 401 });
    }

    const today = todayIso();
    const selectableEnd = addDaysIso(14);
    let next: AppState = { ...state, requests: [...state.requests], updatedAt: new Date().toISOString() };

    for (const shiftId of shiftIds) {
      const shift = state.shifts.find((item) => item.id === shiftId);
      if (!shift || shift.date < today || shift.date > selectableEnd || openCount(shift) <= 0) continue;
      if (shift.assignments.some((assignment) => sameName(assignment.name, guard.name))) continue;
      const active = next.requests.some((item) => item.shiftId === shiftId && sameName(item.name, guard.name) && item.status !== "rejected");
      if (!active) next = { ...next, requests: upsertAvailabilityRequest(next, shiftId, guard.name) };
    }

    const saved = await saveState(next);
    return NextResponse.json({ ok: true, shared: hasDatabase(), state: guardState(saved, guard.name) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
