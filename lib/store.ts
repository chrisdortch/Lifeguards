import { neon } from "@neondatabase/serverless";
import { AppState, blankState } from "./schedule";

const KEY = "main";

type Row = { data: AppState };

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

export function hasDatabase() {
  return Boolean(databaseUrl());
}

function getSql() {
  const url = databaseUrl();
  if (!url) return null;
  return neon(url);
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
  return rows[0].data;
}

export async function saveState(state: AppState): Promise<AppState> {
  const sql = getSql();
  const clean = { ...state, updatedAt: new Date().toISOString() };
  if (!sql) return clean;
  await sql`create table if not exists schedule_state (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  await sql`
    insert into schedule_state (id, data, updated_at)
    values (${KEY}, ${JSON.stringify(clean)}::jsonb, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;
  return clean;
}
