export type ShiftType = "AM" | "PM";
export type RequestStatus = "pending" | "approved" | "rejected";
export type Assignment = { name: string; source?: "admin" | "request" | "manual" };
export type Shift = { id: string; date: string; type: ShiftType; start: string; end: string; required: number; assignments: Assignment[] };
export type RequestItem = { id: string; name: string; shiftId: string; status: RequestStatus; createdAt: string };
export type AppState = { shifts: Shift[]; requests: RequestItem[]; updatedAt: string };

export const END_DATE = new Date("2026-10-10T12:00:00");

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return isoDate(new Date());
}

export function niceDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

export function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function buildInitialShifts(): Shift[] {
  const shifts: Shift[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (cursor <= END_DATE) {
    const date = isoDate(cursor);
    shifts.push({ id: `${date}-AM`, date, type: "AM", start: "10:00 AM", end: "3:30 PM", required: 3, assignments: [] });
    shifts.push({ id: `${date}-PM`, date, type: "PM", start: "3:30 PM", end: "10:00 PM", required: 3, assignments: [] });
    cursor.setDate(cursor.getDate() + 1);
  }
  return shifts;
}

export function blankState(): AppState {
  return { shifts: buildInitialShifts(), requests: [], updatedAt: new Date().toISOString() };
}

export function openCount(shift: Shift) {
  return Math.max(0, shift.required - shift.assignments.length);
}

export function sameDayDouble(shifts: Shift[], shift: Shift, name: string) {
  return shifts.some((s) => s.date === shift.date && s.id !== shift.id && s.assignments.some((a) => a.name.toLowerCase() === name.toLowerCase()));
}

export function csvSafe(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
