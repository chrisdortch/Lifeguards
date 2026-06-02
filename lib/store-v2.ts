import { neon } from "@neondatabase/serverless";
import { AppState, blankState, buildInitialShifts } from "./schedule-v2";
import { getState as getStateV1 } from "./store";

const KEY = "v2-preview";

type Row = { data: AppState };
type SaveOptions = { replace?: boolean; hardReplace?: boolean };

function databaseUrl() {
  const explicit = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_PGUSER || process.env.DATABASE_URL_POOLED || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || "";
  if (explicit) return explicit;
  const dynamic = Object.entries(process.env).find(([key, value]) => /^(DATABASE_URL|POSTGRES_URL)/.test(key) && typeof value === "string" && value.startsWith("postgres"));
  if (dynamic?.[1]) return dynamic[1];
  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  if (host && database && user && password) return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
  return "";
}

export function hasDatabase() {
  return Boolean(databaseUrl());
}

function getSql() {
  const url = databaseUrl();
  return url ? neon(url) : null;
}

function normalizeState(state: AppState): AppState {
  const initial = blankState();
  const incomingShiftMap = new Map((state.shifts || []).map((shift) => [shift.id, shift]));
  const shifts = buildInitialShifts().map((base) => {
    const incoming = incomingShiftMap.get(base.id);
    return incoming ? { ...base, ...incoming, type: base.type, start: base.start, end: base.end, assignments: incoming.assignments || [] } : base;
  });
  return {
    ...initial,
    ...state,
    shifts,
    requests: Array.isArray(state.requests) ? state.requests : [],
    lifeguards: Array.isArray(state.lifeguards) ? state.lifeguards : [],
    settings: { ...initial.settings, ...(state.settings || {}) },
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
}

async function seedFromV1(): Promise<AppState> {
  try {
    const v1 = await getStateV1();
    const seeded = normalizeState({
      ...blankState(),
      ...(v1 as unknown as Partial<AppState>),
      settings: { nextWeekUnlocked: false },
      updatedAt: new Date().toISOString(),
    });
    return seeded;
  } catch {
    return blankState();
  }
}

function hasAnyAssignments(state: AppState) {
  return state.shifts.some((shift) => shift.assignments.length > 0);
}

function mergeRequests(existingRequests: AppState["requests"], incomingRequests: AppState["requests"]) {
  const requestMap = new Map(existingRequests.map((request) => [request.id, request]));
  for (const request of incomingRequests) requestMap.set(request.id, request);
  return Array.from(requestMap.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeStates(existing: AppState, incoming: AppState, options: SaveOptions = {}): AppState {
  const current = normalizeState(existing);
  const next = normalizeState(incoming);
  return {
    shifts: options.replace ? next.shifts : current.shifts,
    requests: mergeRequests(current.requests, next.requests),
    lifeguards: options.hardReplace || next.lifeguards.length > 0 ? next.lifeguards : current.lifeguards,
    settings: options.replace ? next.settings : { ...current.settings, ...next.settings },
    updatedAt: new Date().toISOString(),
  };
}

export async function getStateV2(): Promise<AppState> {
  const sql = getSql();
  if (!sql) return seedFromV1();
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  const rows = await sql`select data from schedule_state where id = ${KEY} limit 1` as Row[];
  if (!rows.length) {
    const initial = await seedFromV1();
    await sql`insert into schedule_state (id, data) values (${KEY}, ${JSON.stringify(initial)}::jsonb)`;
    return initial;
  }

  const current = normalizeState(rows[0].data);
  if (current.lifeguards.length === 0) {
    const seeded = await seedFromV1();
    const repaired = normalizeState({
      ...current,
      lifeguards: seeded.lifeguards,
      requests: current.requests.length > 0 ? current.requests : seeded.requests,
      shifts: hasAnyAssignments(current) ? current.shifts : seeded.shifts,
      settings: current.settings,
      updatedAt: new Date().toISOString(),
    });
    await sql`update schedule_state set data = ${JSON.stringify(repaired)}::jsonb, updated_at = now() where id = ${KEY}`;
    return repaired;
  }

  return current;
}

export async function saveStateV2(state: AppState, options: SaveOptions = {}): Promise<AppState> {
  const sql = getSql();
  const incoming = normalizeState({ ...state, updatedAt: new Date().toISOString() });
  if (!sql) return incoming;
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  const existingRows = await sql`select data from schedule_state where id = ${KEY} limit 1` as Row[];
  const clean = options.hardReplace || !existingRows.length ? incoming : mergeStates(existingRows[0].data, incoming, options);
  await sql`insert into schedule_state (id, data, updated_at) values (${KEY}, ${JSON.stringify(clean)}::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()`;
  return clean;
}
