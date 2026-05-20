"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  Lifeguard,
  RequestItem,
  Shift,
  ShiftType,
  addDaysIso,
  blankState,
  csvSafe,
  longDate,
  niceDate,
  openCount,
  todayIso,
} from "../lib/schedule";

type View = "entry" | "select" | "confirm" | "adminPin" | "admin";
type ReportRow = { dateIso: string; date: string; am: string; pm: string; open: number };

type GuardColor = { background: string; borderColor: string };

const ADMIN_CODE = "7900";
const STORAGE_KEY = "serenity-shores-lifeguard-scheduler-v6";
const SCHEDULE_LIMIT_DAYS = 14;
const PIN_DIGITS = 6;

const GUARD_PALETTE: GuardColor[] = [
  { background: "#e8f2ff", borderColor: "#1f67b1" },
  { background: "#e7fff0", borderColor: "#17824a" },
  { background: "#fff0e3", borderColor: "#b35a20" },
  { background: "#f2e9ff", borderColor: "#6e35b9" },
  { background: "#e6fbff", borderColor: "#0b8798" },
  { background: "#fff0f6", borderColor: "#ba2e73" },
  { background: "#f4ffd9", borderColor: "#7c9b13" },
  { background: "#fff6d8", borderColor: "#ad7b05" },
  { background: "#edeaff", borderColor: "#5140b0" },
  { background: "#e7fff8", borderColor: "#168167" },
  { background: "#ffe9e9", borderColor: "#b92929" },
  { background: "#eaf6ff", borderColor: "#2b7bb6" },
  { background: "#fdeaff", borderColor: "#a436b5" },
  { background: "#eef9e6", borderColor: "#4f8f19" },
  { background: "#f4ebe3", borderColor: "#87502d" },
  { background: "#e7fbfa", borderColor: "#1a8686" },
  { background: "#f5eaff", borderColor: "#8a3fb8" },
  { background: "#fff1e8", borderColor: "#c25316" },
  { background: "#e8eeff", borderColor: "#3853c7" },
  { background: "#efffe8", borderColor: "#23a03a" },
  { background: "#fff2f2", borderColor: "#cc3d3d" },
  { background: "#e9f7ff", borderColor: "#006f9f" },
  { background: "#faf0ff", borderColor: "#8b2fc6" },
  { background: "#fff9e6", borderColor: "#9c7a00" },
  { background: "#ebfff1", borderColor: "#2d7e32" },
  { background: "#f0f4ff", borderColor: "#2d56a3" },
  { background: "#fff0ea", borderColor: "#a94920" },
  { background: "#f0fffc", borderColor: "#087967" },
  { background: "#fff0fb", borderColor: "#a7278b" },
  { background: "#f6f0e8", borderColor: "#7b5d2a" },
  { background: "#edf6ff", borderColor: "#0069c7" },
  { background: "#f1ffe8", borderColor: "#5d9828" },
];

function normalizeState(input: AppState): AppState {
  return {
    ...blankState(),
    ...input,
    lifeguards: Array.isArray(input.lifeguards) ? input.lifeguards : [],
    requests: Array.isArray(input.requests) ? input.requests : [],
    shifts: Array.isArray(input.shifts) ? input.shifts : blankState().shifts,
  };
}
function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
function cleanPin(value: string) {
  return value.replace(/\D/g, "").slice(0, PIN_DIGITS);
}
function overCount(shift: Shift) {
  return Math.max(0, shift.assignments.length - shift.required);
}
function guardList(shift?: Shift) {
  const names = shift?.assignments.map((a) => `${a.lead ? "★ " : ""}${a.name.trim()}`).filter(Boolean) || [];
  return names.length ? names.join(", ") : "OPEN";
}
function shiftText(shift?: Shift) {
  if (!shift) return "OPEN - 3 needed";
  const needed = openCount(shift);
  const over = overCount(shift);
  return `${guardList(shift)}${over > 0 ? ` - ${over} over` : needed > 0 ? ` - ${needed} needed` : " - Full"}`;
}
function rowsBetween(shifts: Shift[], start: string, end: string): ReportRow[] {
  const byDate = new Map<string, ReportRow>();
  shifts
    .filter((s) => s.date >= start && s.date <= end)
    .forEach((s) => {
      const row = byDate.get(s.date) || { dateIso: s.date, date: longDate(s.date), am: "", pm: "", open: 0 };
      if (s.type === "AM") row.am = shiftText(s);
      else row.pm = shiftText(s);
      row.open += openCount(s);
      byDate.set(s.date, row);
    });
  return Array.from(byDate.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
function addDaysFromIso(startIso: string, days: number) {
  const d = new Date(`${startIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function hashName(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => blankState());
  const [shared, setShared] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading schedule...");
  const [view, setView] = useState<View>("entry");
  const [name, setName] = useState("");
  const [lifeguardPin, setLifeguardPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [reportStart, setReportStart] = useState(() => todayIso());
  const [reportEnd, setReportEnd] = useState(() => addDaysIso(14));
  const [manualName, setManualName] = useState("");
  const [edit, setEdit] = useState<{ shiftId: string; oldName: string; value: string } | null>(null);
  const [resetText, setResetText] = useState("");
  const [scheduleWindow, setScheduleWindow] = useState<"current" | "next">("current");
  const [guardForm, setGuardForm] = useState<{ id: string; name: string; pin: string }>({ id: "", name: "", pin: "" });

  async function loadShared() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("state");
      const data = await res.json();
      const next = normalizeState(data.state as AppState);
      setState(next);
      setShared(Boolean(data.shared));
      setSyncStatus(data.shared ? "Shared database connected" : "Testing mode: browser storage only");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(normalizeState(JSON.parse(saved) as AppState));
      setSyncStatus("Offline fallback: browser storage only");
    }
  }

  async function persist(nextInput: AppState, replace = false, hardReplace = false) {
    const next = normalizeState({ ...nextInput, updatedAt: new Date().toISOString() });
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next, replace, hardReplace }),
      });
      const data = await res.json();
      if (data.ok) {
        const saved = normalizeState(data.state as AppState);
        setState(saved);
        setShared(Boolean(data.shared));
        setSyncStatus(data.shared ? "Shared database connected" : "Testing mode: browser storage only");
      }
    } catch {
      setSyncStatus("Offline fallback: browser storage only");
    }
  }

  useEffect(() => {
    void loadShared();
  }, []);

  function updateState(updater: (current: AppState) => AppState, replace = false) {
    void persist(updater(state), replace);
  }

  const selectedName = name.trim();
  const today = todayIso();
  const selectableEnd = addDaysIso(SCHEDULE_LIMIT_DAYS);
  const adminStart = scheduleWindow === "current" ? today : addDaysFromIso(selectableEnd, 1);
  const adminEnd = scheduleWindow === "current" ? selectableEnd : addDaysFromIso(selectableEnd, SCHEDULE_LIMIT_DAYS + 1);

  const twoWeekDates = useMemo(
    () => Array.from(new Set(state.shifts.filter((s) => s.date >= today && s.date <= selectableEnd).map((s) => s.date))).sort(),
    [state.shifts, today, selectableEnd],
  );
  const myRequests = useMemo(() => state.requests.filter((r) => sameName(r.name, selectedName)), [state.requests, selectedName]);
  const myApprovedShifts = useMemo(
    () =>
      state.shifts
        .filter((s) => s.date >= today && s.date <= selectableEnd && s.assignments.some((a) => sameName(a.name, selectedName)))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.shifts, selectedName, today, selectableEnd],
  );
  const pendingRequests = state.requests.filter((r) => r.status === "pending");
  const adminRows = rowsBetween(state.shifts, adminStart, adminEnd);

  const allGuardNames = useMemo(() => {
    const names = new Map<string, string>();
    const add = (value: string) => {
      const clean = value.trim();
      if (clean && !names.has(clean.toLowerCase())) names.set(clean.toLowerCase(), clean);
    };
    state.lifeguards.forEach((g) => add(g.name));
    state.requests.forEach((r) => add(r.name));
    state.shifts.forEach((s) => s.assignments.forEach((a) => add(a.name)));
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [state]);

  const colorMap = useMemo(() => {
    const used = new Set<number>();
    const map = new Map<string, GuardColor>();
    allGuardNames.forEach((guardName) => {
      let index = hashName(guardName.toLowerCase()) % GUARD_PALETTE.length;
      let safety = 0;
      while (used.has(index) && safety < GUARD_PALETTE.length) {
        index = (index + 1) % GUARD_PALETTE.length;
        safety += 1;
      }
      used.add(index);
      map.set(guardName.toLowerCase(), GUARD_PALETTE[index]);
    });
    return map;
  }, [allGuardNames]);

  const balanceRows = useMemo(() => {
    const approved = new Map<string, number>();
    const requested = new Map<string, number>();
    const displayNames = new Map<string, string>();
    const addDisplayName = (value: string) => {
      const clean = value.trim();
      if (clean && !displayNames.has(clean.toLowerCase())) displayNames.set(clean.toLowerCase(), clean);
    };

    allGuardNames.forEach(addDisplayName);

    const shiftsById = new Map(state.shifts.map((s) => [s.id, s]));
    state.shifts
      .filter((s) => s.date >= adminStart && s.date <= adminEnd)
      .forEach((s) => {
        s.assignments.forEach((a) => {
          addDisplayName(a.name);
          const key = a.name.trim().toLowerCase();
          approved.set(key, (approved.get(key) || 0) + 1);
        });
      });

    state.requests.forEach((r) => {
      const shift = shiftsById.get(r.shiftId);
      if (!shift || shift.date < adminStart || shift.date > adminEnd || r.status === "rejected") return;
      addDisplayName(r.name);
      const key = r.name.trim().toLowerCase();
      requested.set(key, (requested.get(key) || 0) + 1);
    });

    return Array.from(displayNames.entries())
      .map(([key, display]) => ({ name: display, approved: approved.get(key) || 0, requests: requested.get(key) || 0 }))
      .sort((a, b) => b.approved - a.approved || b.requests - a.requests || a.name.localeCompare(b.name));
  }, [state.shifts, state.requests, allGuardNames, adminStart, adminEnd]);

  const maxBalanceValue = Math.max(1, ...balanceRows.map((r) => Math.max(r.approved, r.requests)));

  function guardStyle(guardName: string): GuardColor {
    const fallback = GUARD_PALETTE[hashName(guardName.toLowerCase()) % GUARD_PALETTE.length];
    return colorMap.get(guardName.trim().toLowerCase()) || fallback;
  }
  function findShift(date: string, type: ShiftType) {
    return state.shifts.find((s) => s.date === date && s.type === type);
  }
  function alreadyAssigned(shift: Shift, guardName: string) {
    return shift.assignments.some((a) => sameName(a.name, guardName));
  }
  function isLeadForShift(shift: Shift, guardName: string) {
    return shift.assignments.some((a) => sameName(a.name, guardName) && Boolean(a.lead));
  }
  function isDoubleForDate(date: string, guardName: string) {
    return state.shifts.filter((s) => s.date === date).reduce((n, s) => n + s.assignments.filter((a) => sameName(a.name, guardName)).length, 0) > 1;
  }
  function wouldCreateDouble(shift: Shift, guardName: string) {
    return state.shifts.some((s) => s.date === shift.date && s.id !== shift.id && s.assignments.some((a) => sameName(a.name, guardName)));
  }
  function doubleNamesInWindow() {
    const map = new Map<string, Set<string>>();
    state.shifts
      .filter((s) => s.date >= adminStart && s.date <= adminEnd)
      .forEach((s) =>
        s.assignments.forEach((a) => {
          const key = `${s.date}|${a.name.toLowerCase()}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(s.type);
        }),
      );
    return Array.from(map.entries()).filter(([, types]) => types.size > 1);
  }

  function submitName() {
    const cleanName = selectedName;
    const cleanGuardPin = cleanPin(lifeguardPin);
    const match = state.lifeguards.find((g) => sameName(g.name, cleanName) && g.pin === cleanGuardPin);
    if (!cleanName || cleanGuardPin.length !== PIN_DIGITS) {
      setLoginError("Enter your first name and six digit PIN.");
      return;
    }
    if (!match) {
      setLoginError("That name and PIN do not match an active lifeguard record. Ask Hollie/admin to add or correct your PIN.");
      return;
    }
    setName(match.name);
    setLoginError("");
    setView("select");
  }

  function toggleShift(shiftId: string) {
    const shift = state.shifts.find((s) => s.id === shiftId);
    if (!shift || shift.date < today || shift.date > selectableEnd || openCount(shift) <= 0) return;
    setSelected((cur) => (cur.includes(shiftId) ? cur.filter((id) => id !== shiftId) : [...cur, shiftId]));
  }

  function submitRequests() {
    if (!selectedName || !selected.length) return;
    const existing = new Set(state.requests.filter((r) => sameName(r.name, selectedName) && r.status !== "rejected").map((r) => r.shiftId));
    const now = new Date().toISOString();
    const newRequests = selected
      .filter((shiftId) => !existing.has(shiftId))
      .map((shiftId) => ({
        id: `${shiftId}-${selectedName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        shiftId,
        name: selectedName,
        status: "pending" as const,
        createdAt: now,
      }));
    if (newRequests.length) updateState((cur) => ({ ...cur, requests: [...cur.requests, ...newRequests] }));
    setSelected([]);
    setView("confirm");
  }

  function approveRequest(request: RequestItem) {
    updateState((cur) => {
      const shift = cur.shifts.find((s) => s.id === request.shiftId);
      if (!shift) return { ...cur, requests: cur.requests.map((r) => (r.id === request.id ? { ...r, status: "approved" as const } : r)) };
      const nextShifts = alreadyAssigned(shift, request.name)
        ? cur.shifts
        : cur.shifts.map((s) => (s.id === request.shiftId ? { ...s, assignments: [...s.assignments, { name: request.name, source: "request" as const }] } : s));
      return { ...cur, shifts: nextShifts, requests: cur.requests.map((r) => (r.id === request.id ? { ...r, status: "approved" as const } : r)) };
    }, true);
  }

  function rejectRequest(request: RequestItem) {
    updateState((cur) => ({ ...cur, requests: cur.requests.map((r) => (r.id === request.id ? { ...r, status: "rejected" as const } : r)) }), true);
  }

  function approveAll() {
    updateState((cur) => {
      const shifts = cur.shifts.map((s) => ({ ...s, assignments: [...s.assignments] }));
      const requests = cur.requests.map((r) => ({ ...r }));
      for (const r of requests.filter((x) => x.status === "pending")) {
        const idx = shifts.findIndex((s) => s.id === r.shiftId);
        if (idx >= 0 && !alreadyAssigned(shifts[idx], r.name)) shifts[idx] = { ...shifts[idx], assignments: [...shifts[idx].assignments, { name: r.name, source: "request" as const }] };
        r.status = "approved";
      }
      return { ...cur, shifts, requests };
    }, true);
  }

  function addManualToShift(shiftId: string, guardName: string) {
    const clean = guardName.trim();
    if (!clean) return;
    updateState(
      (cur) => ({
        ...cur,
        shifts: cur.shifts.map((s) => (s.id === shiftId && !alreadyAssigned(s, clean) ? { ...s, assignments: [...s.assignments, { name: clean, source: "manual" as const }] } : s)),
        requests: cur.requests.map((r) => (r.shiftId === shiftId && sameName(r.name, clean) ? { ...r, status: "approved" as const } : r)),
      }),
      true,
    );
  }

  function addManual(shiftId: string) {
    addManualToShift(shiftId, manualName);
    setManualName("");
  }
  function removeAssignment(shiftId: string, oldName: string) {
    updateState((cur) => ({ ...cur, shifts: cur.shifts.map((s) => (s.id === shiftId ? { ...s, assignments: s.assignments.filter((a) => !sameName(a.name, oldName)) } : s)) }), true);
  }
  function toggleLead(shiftId: string, guardName: string) {
    updateState(
      (cur) => ({
        ...cur,
        shifts: cur.shifts.map((s) => {
          if (s.id !== shiftId) return s;
          const currentlyLead = isLeadForShift(s, guardName);
          return {
            ...s,
            assignments: s.assignments.map((a) => (sameName(a.name, guardName) ? { ...a, lead: !currentlyLead } : { ...a, lead: false })),
          };
        }),
      }),
      true,
    );
  }
  function saveEdit() {
    if (!edit || !edit.value.trim()) return;
    updateState((cur) => ({ ...cur, shifts: cur.shifts.map((s) => (s.id === edit.shiftId ? { ...s, assignments: s.assignments.map((a) => (sameName(a.name, edit.oldName) ? { ...a, name: edit.value.trim() } : a)) } : s)) }), true);
    setEdit(null);
  }
  function saveLifeguard() {
    const cleanName = guardForm.name.trim();
    const cleanGuardPin = cleanPin(guardForm.pin);
    if (!cleanName || cleanGuardPin.length !== PIN_DIGITS) return;
    updateState((cur) => {
      const guard: Lifeguard = { id: guardForm.id || `${cleanName.toLowerCase()}-${Date.now()}`, name: cleanName, pin: cleanGuardPin };
      const exists = cur.lifeguards.some((g) => g.id === guard.id);
      return { ...cur, lifeguards: exists ? cur.lifeguards.map((g) => (g.id === guard.id ? guard : g)) : [...cur.lifeguards, guard] };
    }, true);
    setGuardForm({ id: "", name: "", pin: "" });
  }
  function deleteLifeguard(id: string) {
    updateState((cur) => ({ ...cur, lifeguards: cur.lifeguards.filter((g) => g.id !== id) }), true);
  }
  function resetAll() {
    if (resetText !== "RESET SCHEDULE") return;
    void persist({ ...blankState(), lifeguards: state.lifeguards }, false, true);
    setResetText("");
  }

  function potentialRequestsForShift(shift: Shift) {
    const seen = new Set<string>();
    return state.requests
      .filter((r) => r.shiftId === shift.id && !alreadyAssigned(shift, r.name))
      .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "pending" ? -1 : 1))
      .filter((r) => {
        const k = r.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  function renderNameChip(guardName: string, action?: "add" | "remove", onClick?: () => void, status?: string, doubleFlag = false, lead = false, onLeadClick?: () => void) {
    return (
      <span className={doubleFlag ? "guardChip doubleChip" : lead ? "guardChip leadChip" : "guardChip"} style={guardStyle(guardName)}>
        <strong>{guardName}</strong>
        {doubleFlag ? <em className="doubleFlag">DOUBLE</em> : null}
        {lead ? <em className="leadBadge">Lead</em> : null}
        {status ? <em>{status}</em> : null}
        {onLeadClick ? (
          <button className={lead ? "leadStarBtn active" : "leadStarBtn"} onClick={onLeadClick} type="button" aria-label={`${lead ? "Remove" : "Make"} ${guardName} Lead`}>
            {lead ? "★" : "☆"}
          </button>
        ) : null}
        {action ? (
          <button className={action === "add" ? "chipAction add" : "chipAction remove"} onClick={onClick} type="button" aria-label={`${action === "add" ? "Add" : "Remove"} ${guardName}`}>
            {action === "add" ? "+" : "−"}
          </button>
        ) : null}
      </span>
    );
  }

  function renderApprovedShiftForMe(shift: Shift) {
    const names = shift.assignments.map((a) => a.name).filter(Boolean);
    const coworkers = names.filter((n) => !sameName(n, selectedName));
    const isLead = isLeadForShift(shift, selectedName);
    return (
      <div key={shift.id} className={isLead ? "shiftBtn approvedOnly leadApproved" : "shiftBtn approvedOnly"}>
        <span className="shiftTitle">
          <span>
            {niceDate(shift.date)} · {shift.type === "AM" ? "Morning" : "Afternoon"}
          </span>
          <span>
            {shift.start} - {shift.end}
          </span>
        </span>
        <span className="shiftMeta">
          {isLead ? "★ You are Lead for this shift" : "You are approved for this shift"}
          {coworkers.length ? ` with ${coworkers.join(", ")}` : "."}
        </span>
        {isLead ? <span className="leadCallout">★ Lead shift</span> : null}
      </div>
    );
  }

  function renderSelectableShift(shift: Shift) {
    const requested = myRequests.some((r) => r.shiftId === shift.id && r.status !== "rejected");
    const isSelected = selected.includes(shift.id);
    const meAssigned = shift.assignments.some((a) => sameName(a.name, selectedName));
    const spots = openCount(shift);
    const full = spots <= 0;
    return (
      <button key={shift.id} className="shiftBtn" data-selected={isSelected} disabled={requested || meAssigned || full} onClick={() => toggleShift(shift.id)}>
        <span className="shiftTitle">
          <span>{shift.type === "AM" ? "Morning" : "Afternoon"}</span>
          <span>
            {shift.start} - {shift.end}
          </span>
        </span>
        <span>
          {meAssigned ? <span className="badge badgeFull">You work</span> : null} {requested ? <span className="badge badgePending">Already requested</span> : null} {isSelected ? <span className="badge badgePending">Selected</span> : null} {full ? <span className="badge badgeDanger">Full</span> : <span className="badge badgeOpen">{spots} open</span>}
        </span>
      </button>
    );
  }

  function renderAdminCell(date: string, type: ShiftType) {
    const shift = findShift(date, type);
    if (!shift) return <span className="small">No shift</span>;
    const potentials = potentialRequestsForShift(shift);
    return (
      <div className="adminShiftCell">
        <div className="cellTime">
          {type} · {shift.start} - {shift.end}
        </div>
        <div className="nameWrap">
          {shift.assignments.length === 0 ? <span className="openText">OPEN</span> : null}
          {shift.assignments.map((a) => renderNameChip(a.name, "remove", () => removeAssignment(shift.id, a.name), undefined, isDoubleForDate(date, a.name), Boolean(a.lead), () => toggleLead(shift.id, a.name)))}
        </div>
        <span className={overCount(shift) > 0 ? "badge badgeDanger" : openCount(shift) > 0 ? "badge badgeOpen" : "badge badgeFull"}>{overCount(shift) > 0 ? `${overCount(shift)} overfilled` : openCount(shift) > 0 ? `${openCount(shift)} open` : "Full"}</span>
        {potentials.length ? (
          <div className="alternateBox">
            <div className="small">Available alternates</div>
            <div className="nameWrap">{potentials.map((r) => renderNameChip(r.name, "add", () => approveRequest(r), wouldCreateDouble(shift, r.name) ? `${r.status} · double` : r.status, wouldCreateDouble(shift, r.name)))}</div>
          </div>
        ) : null}
      </div>
    );
  }

  function exportReport() {
    const rows = rowsBetween(state.shifts, reportStart, reportEnd);
    const csv = ["Serenity Shores Pool Schedule", `${longDate(reportStart)} through ${longDate(reportEnd)}`, "", "Date,AM 10-3:30,PM 3:30-10,Open Spots", ...rows.map((r) => [r.date, r.am, r.pm, String(r.open)].map(csvSafe).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `serenity-shores-pool-schedule-${reportStart}-to-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const doubleFlags = doubleNamesInWindow();

  return (
    <main className="appShell">
      <div className="topStrip">Serenity Shores pool · Lifeguard schedule</div>
      <header className="header">
        <button className="brand" onClick={() => setView("entry")} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
          <div className="brandText">Lifeguard Schedule</div>
        </button>
        <button className="adminBtn" onClick={() => setView(adminAuthed ? "admin" : "adminPin")}>
          Admin
        </button>
      </header>
      <section className="main">
        <p className="small" style={{ marginTop: 0 }}>
          {syncStatus} · {shared ? "shared" : "local"}
        </p>

        {view === "entry" ? (
          <div className="card hero stack">
            <span className="kicker">Lifeguard check-in</span>
            <h1>Help fill the pool schedule.</h1>
            <p className="lead">Enter your first name and your six digit PIN, then select ALL SHIFTS YOU ARE AVAILABLE TO COVER. (You will not get all of the shifts you select, and no one will have a double shift).</p>
            <input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" inputMode="numeric" placeholder="Six digit PIN" value={lifeguardPin} onChange={(e) => setLifeguardPin(cleanPin(e.target.value))} onKeyDown={(e) => e.key === "Enter" && submitName()} />
            {loginError ? (
              <p className="small" style={{ color: "#b42318" }}>
                {loginError}
              </p>
            ) : null}
            <button className="primaryBtn" onClick={submitName}>
              See Open Shifts
            </button>
            <p className="small">Lifeguards can request shifts from today through {niceDate(selectableEnd)}. New shifts unlock automatically each day.</p>
          </div>
        ) : null}

        {view === "select" ? (
          <div className="stack">
            <div className="card stack">
              <h2>Hi, {selectedName}</h2>
              <p className="small">Select every AM and PM shift you are available to cover. You may select both shifts on the same day if you are available all day. Hollie will approve the final schedule.</p>
            </div>
            <div className="card stack">
              <h3>Your approved schedule: next two weeks</h3>
              {myApprovedShifts.length ? myApprovedShifts.map((s) => renderApprovedShiftForMe(s)) : <p className="small">You do not have any approved shifts in the next two weeks yet.</p>}
            </div>
            <div className="card stack">
              <h3>Select availability: next two weeks</h3>
              {twoWeekDates.map((date) => (
                <div className="shiftCard" key={date}>
                  <div className="dateLine">{niceDate(date)}</div>
                  <div className="shiftGrid">
                    {["AM", "PM"].map((t) => {
                      const s = findShift(date, t as ShiftType);
                      return s ? renderSelectableShift(s) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="stickySubmit">
              <div className="stickySubmitInner">
                <button className="primaryBtn" disabled={!selected.length} onClick={submitRequests}>
                  Submit {selected.length || ""} shift request{selected.length === 1 ? "" : "s"}
                </button>
                <span className="small">Hollie/admin must approve before names appear on your final schedule.</span>
              </div>
            </div>
          </div>
        ) : null}

        {view === "confirm" ? (
          <div className="card hero stack">
            <span className="kicker">Submitted</span>
            <h1>Thank you.</h1>
            <p className="lead">Your available shifts were sent to admin for approval.</p>
            <button className="primaryBtn" onClick={() => setView("entry")}>
              Done
            </button>
          </div>
        ) : null}

        {view === "adminPin" ? (
          <div className="card hero stack">
            <span className="kicker">Admin access</span>
            <h1>Enter code.</h1>
            <input className="input" inputMode="numeric" placeholder="Admin code" value={pin} onChange={(e) => setPin(e.target.value)} />
            <button
              className="primaryBtn"
              onClick={() => {
                if (pin === ADMIN_CODE) {
                  setAdminAuthed(true);
                  setView("admin");
                }
              }}
            >
              Open Admin
            </button>
            <button className="ghostBtn" onClick={() => setView("entry")}>
              Back
            </button>
          </div>
        ) : null}

        {view === "admin" ? (
          <div className="stack">
            <div className="card stack">
              <span className="kicker">Admin dashboard</span>
              <h2>Schedule control</h2>
              <div className="panelGrid">
                <div className="stat">
                  <div className="statNum">{pendingRequests.length}</div>
                  <div className="statLabel">Pending</div>
                </div>
                <div className="stat">
                  <div className="statNum">{state.lifeguards.length}</div>
                  <div className="statLabel">Lifeguards</div>
                </div>
                <div className="stat">
                  <div className="statNum">{state.shifts.filter((s) => s.date >= adminStart && s.date <= adminEnd && overCount(s) > 0).length}</div>
                  <div className="statLabel">Overfilled shifts</div>
                </div>
                <div className="stat">
                  <div className="statNum">{doubleFlags.length}</div>
                  <div className="statLabel">Double flags</div>
                </div>
              </div>
              <div className="actions">
                <button className="primaryBtn" onClick={approveAll}>
                  Approve All Pending
                </button>
                <button className="ghostBtn" onClick={() => void loadShared()}>
                  Refresh
                </button>
              </div>
              <p className="small">Approve All approves every pending request and intentionally allows overfilled shifts. Use the colored + and − buttons below to balance the final schedule. DOUBLE flags mark a lifeguard assigned to both AM and PM on the same day.</p>
            </div>

            <div className="card stack">
              <div className="row">
                <div>
                  <h3>{scheduleWindow === "current" ? "Current" : "Following"} two-week schedule</h3>
                  <p className="small">{longDate(adminStart)} through {longDate(adminEnd)}</p>
                </div>
                <button className="ghostBtn" onClick={() => setScheduleWindow(scheduleWindow === "current" ? "next" : "current")}>
                  {scheduleWindow === "current" ? "Show following two weeks" : "Show current two weeks"}
                </button>
              </div>
              {adminRows.map((r) => (
                <div className="adminDay" key={r.dateIso}>
                  <div className="dateLine">{niceDate(r.dateIso)}</div>
                  <div className="adminGrid">
                    <div>{renderAdminCell(r.dateIso, "AM")}</div>
                    <div>{renderAdminCell(r.dateIso, "PM")}</div>
                  </div>
                </div>
              ))}
              <div className="stack">
                <h3>Balance graph</h3>
                <p className="small">This compares approved shifts against submitted availability requests for the visible two-week schedule. Each lifeguard color is unique and updates when names, approvals, removals, or new availability requests change.</p>
                <div className="balanceLegend">
                  <span className="legendItem approvedLegend">Approved shifts</span>
                  <span className="legendItem requestLegend">Availability requests</span>
                </div>
                <div className="balanceGraph">
                  {balanceRows.map((row) => {
                    const color = guardStyle(row.name);
                    return (
                      <div className="balanceGraphRow" key={row.name}>
                        <span className="guardChip balanceName" style={color}>
                          <strong>{row.name}</strong>
                        </span>
                        <div className="balanceBars">
                          <div className="barLine">
                            <span className="barLabel">Approved {row.approved}</span>
                            <span className="barTrack">
                              <span className="barFill approvedFill" style={{ width: `${(row.approved / maxBalanceValue) * 100}%`, background: color.borderColor }} />
                            </span>
                          </div>
                          <div className="barLine">
                            <span className="barLabel">Requests {row.requests}</span>
                            <span className="barTrack">
                              <span className="barFill requestFill" style={{ width: `${(row.requests / maxBalanceValue) * 100}%`, background: color.background, borderColor: color.borderColor }} />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card stack">
              <h3>Approve or deny requests</h3>
              <p className="small">The two-week calendar above is the main approval tool. This list is only for individual review.</p>
              {pendingRequests.length === 0 ? (
                <p className="small">No pending requests.</p>
              ) : (
                pendingRequests.map((r) => {
                  const s = state.shifts.find((x) => x.id === r.shiftId);
                  return (
                    <div className="requestRow" key={r.id}>
                      <div>
                        {renderNameChip(r.name)}
                        <br />
                        <span className="small">{s ? `${niceDate(s.date)} · ${s.type} · ${s.start}-${s.end}` : r.shiftId}</span>
                      </div>
                      <div className="actions">
                        <button className="primaryBtn" onClick={() => approveRequest(r)}>
                          Approve
                        </button>
                        <button className="ghostBtn" onClick={() => rejectRequest(r)}>
                          Deny
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="card stack">
              <h3>Lifeguards and PINs</h3>
              <input className="input" placeholder="Lifeguard first name" value={guardForm.name} onChange={(e) => setGuardForm({ ...guardForm, name: e.target.value })} />
              <input className="input" inputMode="numeric" placeholder="Six digit PIN" value={guardForm.pin} onChange={(e) => setGuardForm({ ...guardForm, pin: cleanPin(e.target.value) })} />
              <div className="actions">
                <button className="primaryBtn" onClick={saveLifeguard}>
                  {guardForm.id ? "Save Lifeguard" : "Add Lifeguard"}
                </button>
                {guardForm.id ? (
                  <button className="ghostBtn" onClick={() => setGuardForm({ id: "", name: "", pin: "" })}>
                    Cancel
                  </button>
                ) : null}
              </div>
              <div className="nameWrap">
                {[...state.lifeguards].sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
                  <span className="guardChip" style={guardStyle(g.name)} key={g.id}>
                    <strong>{g.name}</strong>
                    <em>{g.pin}</em>
                    <button className="miniBtn" onClick={() => setGuardForm(g)}>
                      Edit
                    </button>
                    <button className="miniBtn danger" onClick={() => deleteLifeguard(g.id)}>
                      Delete
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="card stack">
              <h3>Manual schedule tools</h3>
              <input className="input" placeholder="Name to add manually" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              {adminRows.map((r) => (
                <div className="requestRow" key={`add-${r.dateIso}`}>
                  <span>{niceDate(r.dateIso)}</span>
                  <div className="actions">
                    <button
                      className="ghostBtn"
                      onClick={() => {
                        const s = findShift(r.dateIso, "AM");
                        if (s) addManual(s.id);
                      }}
                    >
                      Add AM
                    </button>
                    <button
                      className="ghostBtn"
                      onClick={() => {
                        const s = findShift(r.dateIso, "PM");
                        if (s) addManual(s.id);
                      }}
                    >
                      Add PM
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card stack">
              <h3>Export report</h3>
              <div className="row">
                <input className="input" type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
                <input className="input" type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
              </div>
              <button className="primaryBtn" onClick={exportReport}>
                Download CSV
              </button>
            </div>

            <div className="card stack dangerZone">
              <h3>Reset schedule</h3>
              <p className="small">This clears schedule and requests but keeps lifeguard names/PINs. Type RESET SCHEDULE.</p>
              <input className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} />
              <button className="dangerBtn" onClick={resetAll}>
                Reset Everything
              </button>
            </div>
          </div>
        ) : null}

        {edit ? (
          <div className="modal">
            <div className="modalCard stack">
              <h3>Edit approved guard</h3>
              <input className="input" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
              <div className="actions">
                <button className="primaryBtn" onClick={saveEdit}>
                  Save
                </button>
                <button className="ghostBtn" onClick={() => removeAssignment(edit.shiftId, edit.oldName)}>
                  Remove
                </button>
                <button className="ghostBtn" onClick={() => setEdit(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
