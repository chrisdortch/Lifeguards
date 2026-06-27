import { neon } from "@neondatabase/serverless";
import { AppState, blankState, buildInitialShifts } from "./schedule-v3";
import { getState as getStateV1 } from "./store";

const KEY = "v3-preview";
type Row = { data: AppState };
type SaveOptions = { replace?: boolean; hardReplace?: boolean };

function databaseUrl() {
  const explicit = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_PGUSER || process.env.DATABASE_URL_POOLED || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || "";
  if (explicit) return explicit;
  const dynamic = Object.entries(process.env).find(([key, value]) => /^(DATABASE_URL|POSTGRES_URL)/.test(key) && typeof value === "string" && value.startsWith("postgres"));
  if (dynamic?.[1]) return dynamic[1];
  const host = process.env.PGHOST, database = process.env.PGDATABASE, user = process.env.PGUSER, password = process.env.PGPASSWORD;
  if (host && database && user && password) return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
  return "";
}
export function hasDatabase() { return Boolean(databaseUrl()); }
function getSql() { const url = databaseUrl(); return url ? neon(url) : null; }

function normalizeState(state: AppState): AppState {
  const initial = blankState();
  const incomingShiftMap = new Map((state.shifts || []).map((shift) => [shift.id, shift]));
  const shifts = buildInitialShifts().map((base) => {
    const incoming = incomingShiftMap.get(base.id);
    return incoming ? { ...base, ...incoming, type: base.type, start: base.start, end: base.end, assignments: incoming.assignments || [] } : base;
  });
  return { ...initial, ...state, shifts, requests: Array.isArray(state.requests) ? state.requests : [], lifeguards: Array.isArray(state.lifeguards) ? state.lifeguards : [], history: Array.isArray(state.history) ? state.history : [], updatedAt: state.updatedAt || new Date().toISOString() };
}
async function seedFromV1(): Promise<AppState> {
  try {
    const v1 = await getStateV1();
    return normalizeState({ ...blankState(), ...(v1 as unknown as Partial<AppState>), history: [], updatedAt: new Date().toISOString() });
  } catch { return blankState(); }
}
function hasAssignments(state: AppState) { return state.shifts.some((s) => s.assignments.length > 0); }
function mergeRequests(existing: AppState["requests"], incoming: AppState["requests"]) {
  const map = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming) map.set(r.id, r);
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function mergeHistory(existing: AppState["history"] = [], incoming: AppState["history"] = []) {
  const map = new Map(existing.map((h) => [h.id, h]));
  for (const h of incoming) map.set(h.id, h);
  return Array.from(map.values()).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2000);
}
function mergeStates(existing: AppState, incoming: AppState, options: SaveOptions = {}): AppState {
  const current = normalizeState(existing), next = normalizeState(incoming);
  return { shifts: options.replace ? next.shifts : current.shifts, requests: mergeRequests(current.requests, next.requests), lifeguards: options.replace || options.hardReplace ? next.lifeguards : current.lifeguards, history: mergeHistory(current.history, next.history), updatedAt: new Date().toISOString() };
}

export async function getStateV3(): Promise<AppState> {
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
    const repaired = normalizeState({ ...current, lifeguards: seeded.lifeguards, requests: current.requests.length ? current.requests : seeded.requests, shifts: hasAssignments(current) ? current.shifts : seeded.shifts, updatedAt: new Date().toISOString() });
    await sql`update schedule_state set data = ${JSON.stringify(repaired)}::jsonb, updated_at = now() where id = ${KEY}`;
    return repaired;
  }
  return current;
}

export async function saveStateV3(state: AppState, options: SaveOptions = {}): Promise<AppState> {
  const sql = getSql();
  const incoming = normalizeState({ ...state, updatedAt: new Date().toISOString() });
  if (!sql) return incoming;
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  const rows = await sql`select data from schedule_state where id = ${KEY} limit 1` as Row[];
  const clean = options.hardReplace || !rows.length ? incoming : mergeStates(rows[0].data, incoming, options);
  await sql`insert into schedule_state (id, data, updated_at) values (${KEY}, ${JSON.stringify(clean)}::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()`;
  return clean;
}
