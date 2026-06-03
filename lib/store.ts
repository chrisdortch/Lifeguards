import { neon } from "@neondatabase/serverless";
import { AppState, Assignment, RequestItem, blankState, buildInitialShifts } from "./schedule";

const KEY = "main";

type Row = { data: AppState };
type SaveOptions = { replace?: boolean; hardReplace?: boolean };

function databaseUrl() {
  const explicit =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL_PGUSER ||
    process.env.DATABASE_URL_POOLED ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";

  if (explicit) return explicit;

  const dynamic = Object.entries(process.env).find(([key, value]) => {
    return /^(DATABASE_URL|POSTGRES_URL)/.test(key) && typeof value === "string" && value.startsWith("postgres");
  });

  if (dynamic?.[1]) return dynamic[1];

  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  if (host && database && user && password) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
  }

  return "";
}

export function hasDatabase() {
  return Boolean(databaseUrl());
}

function getSql() {
  const url = databaseUrl();
  if (!url) return null;
  return neon(url);
}

function nameKey(value: string) {
  return value.trim().toLowerCase();
}

function requestKey(request: Pick<RequestItem, "shiftId" | "name">) {
  return `${request.shiftId}|${nameKey(request.name)}`;
}

function requestRank(status: RequestItem["status"]) {
  if (status === "approved") return 3;
  if (status === "pending") return 2;
  return 1;
}

function dedupeAssignments(assignments: Assignment[] = []) {
  const byName = new Map<string, Assignment>();
  for (const assignment of assignments) {
    const cleanName = assignment.name.trim();
    if (!cleanName) continue;
    const key = nameKey(cleanName);
    const existing = byName.get(key);
    byName.set(key, {
      name: existing?.name || cleanName,
      source: existing?.source || assignment.source,
      lead: Boolean(existing?.lead || assignment.lead),
    });
  }
  return Array.from(byName.values());
}

function dedupeRequests(requests: RequestItem[] = []) {
  const byShiftAndGuard = new Map<string, RequestItem>();
  for (const request of requests) {
    const cleanName = request.name.trim();
    if (!cleanName || !request.shiftId) continue;
    const cleaned: RequestItem = {
      ...request,
      name: cleanName,
      status: request.status || "pending",
      createdAt: request.createdAt || new Date().toISOString(),
    };
    const key = requestKey(cleaned);
    const existing = byShiftAndGuard.get(key);
    if (!existing) {
      byShiftAndGuard.set(key, cleaned);
      continue;
    }
    const existingRank = requestRank(existing.status);
    const nextRank = requestRank(cleaned.status);
    if (nextRank > existingRank || (nextRank === existingRank && cleaned.createdAt > existing.createdAt)) {
      byShiftAndGuard.set(key, { ...cleaned, id: existing.id || cleaned.id });
    }
  }
  return Array.from(byShiftAndGuard.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function normalizeState(state: AppState): AppState {
  const initialShifts = buildInitialShifts();
  const incomingShiftMap = new Map((state.shifts || []).map((shift) => [shift.id, shift]));
  const shifts = initialShifts.map((base) => {
    const incoming = incomingShiftMap.get(base.id);
    return incoming ? { ...base, ...incoming, assignments: dedupeAssignments(incoming.assignments || []) } : base;
  });

  return {
    shifts,
    requests: dedupeRequests(Array.isArray(state.requests) ? state.requests : []),
    lifeguards: Array.isArray(state.lifeguards) ? state.lifeguards : [],
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
}

function mergeRequests(existingRequests: AppState["requests"], incomingRequests: AppState["requests"]) {
  return dedupeRequests([...(existingRequests || []), ...(incomingRequests || [])]);
}

function mergeStates(existing: AppState, incoming: AppState, options: SaveOptions = {}): AppState {
  const current = normalizeState(existing);
  const next = normalizeState(incoming);

  return normalizeState({
    // Normal lifeguard submissions should only merge request records so a stale phone cannot overwrite Hollie's live schedule.
    // Admin schedule edits pass replace=true, which replaces assignments while still merging any newly submitted requests.
    shifts: options.replace ? next.shifts : current.shifts,
    requests: mergeRequests(current.requests, next.requests),
    lifeguards: next.lifeguards,
    updatedAt: new Date().toISOString(),
  });
}

export async function getState(): Promise<AppState> {
  const sql = getSql();
  if (!sql) return blankState();
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  const rows = (await sql`select data from schedule_state where id = ${KEY} limit 1`) as Row[];
  if (!rows.length) {
    const initial = blankState();
    await sql`insert into schedule_state (id, data) values (${KEY}, ${JSON.stringify(initial)}::jsonb)`;
    return initial;
  }
  return normalizeState(rows[0].data);
}

export async function saveState(state: AppState, options: SaveOptions = {}): Promise<AppState> {
  const sql = getSql();
  const incoming = normalizeState({ ...state, updatedAt: new Date().toISOString() });
  if (!sql) return incoming;
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;

  const existingRows = (await sql`select data from schedule_state where id = ${KEY} limit 1`) as Row[];
  const clean = options.hardReplace || !existingRows.length ? incoming : mergeStates(existingRows[0].data, incoming, options);

  await sql`
    insert into schedule_state (id, data, updated_at)
    values (${KEY}, ${JSON.stringify(clean)}::jsonb, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;
  return clean;
}
