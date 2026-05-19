import { neon } from "@neondatabase/serverless";
import { AppState, blankState, buildInitialShifts } from "./schedule";

const KEY = "main";

type Row = { data: AppState };

type SaveOptions = { replace?: boolean };

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

function normalizeState(state: AppState): AppState {
  const initialShifts = buildInitialShifts();
  const incomingShiftMap = new Map((state.shifts || []).map((shift) => [shift.id, shift]));
  const shifts = initialShifts.map((base) => {
    const incoming = incomingShiftMap.get(base.id);
    return incoming ? { ...base, ...incoming, assignments: incoming.assignments || [] } : base;
  });

  return {
    shifts,
    requests: Array.isArray(state.requests) ? state.requests : [],
    lifeguards: Array.isArray(state.lifeguards) ? state.lifeguards : [],
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
}

function mergeStates(existing: AppState, incoming: AppState): AppState {
  const current = normalizeState(existing);
  const next = normalizeState(incoming);

  const shiftMap = new Map(current.shifts.map((shift) => [shift.id, shift]));
  for (const shift of next.shifts) {
    shiftMap.set(shift.id, shift);
  }

  const requestMap = new Map(current.requests.map((request) => [request.id, request]));
  for (const request of next.requests) {
    requestMap.set(request.id, request);
  }

  return {
    shifts: Array.from(shiftMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    requests: Array.from(requestMap.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    lifeguards: next.lifeguards,
    updatedAt: new Date().toISOString(),
  };
}

export async function getState(): Promise<AppState> {
  const sql = getSql();
  if (!sql) return blankState();
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  const rows = await sql`select data from schedule_state where id = ${KEY} limit 1` as Row[];
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

  const existingRows = await sql`select data from schedule_state where id = ${KEY} limit 1` as Row[];
  const clean = options.replace || !existingRows.length ? incoming : mergeStates(existingRows[0].data, incoming);

  await sql`
    insert into schedule_state (id, data, updated_at)
    values (${KEY}, ${JSON.stringify(clean)}::jsonb, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;
  return clean;
}