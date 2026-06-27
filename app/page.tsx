"use client";

import { useEffect, useMemo, useState } from "react";
import { AppState, Lifeguard, RequestItem, Shift, ShiftType, addDaysIso, blankState, csvSafe, longDate, niceDate, openCount, todayIso } from "../lib/schedule";

type View = "entry" | "select" | "confirm" | "adminPin" | "admin";
type ReportRow = { dateIso: string; date: string; am: string; mid: string; pm: string; open: number };
type GuardColor = { background: string; borderColor: string };

type AvailableGuard = { name: string; request: RequestItem };

const VERSION = "V7";
const STORAGE_KEY = "serenity-shores-lifeguard-scheduler-v9";
const SCHEDULE_LIMIT_DAYS = 14;
const PIN_DIGITS = 6;
const SHIFT_TYPES: ShiftType[] = ["AM", "MID", "PM"];

const GUARD_PALETTE: GuardColor[] = [
  { background: "#e8f2ff", borderColor: "#1f67b1" }, { background: "#e7fff0", borderColor: "#17824a" }, { background: "#fff0e3", borderColor: "#b35a20" }, { background: "#f2e9ff", borderColor: "#6e35b9" },
  { background: "#e6fbff", borderColor: "#0b8798" }, { background: "#fff0f6", borderColor: "#ba2e73" }, { background: "#f4ffd9", borderColor: "#7c9b13" }, { background: "#fff6d8", borderColor: "#ad7b05" },
  { background: "#edeaff", borderColor: "#5140b0" }, { background: "#e7fff8", borderColor: "#168167" }, { background: "#ffe9e9", borderColor: "#b92929" }, { background: "#eaf6ff", borderColor: "#2b7bb6" },
  { background: "#fdeaff", borderColor: "#a436b5" }, { background: "#eef9e6", borderColor: "#4f8f19" }, { background: "#f4ebe3", borderColor: "#87502d" }, { background: "#e7fbfa", borderColor: "#1a8686" },
  { background: "#f5eaff", borderColor: "#8a3fb8" }, { background: "#fff1e8", borderColor: "#c25316" }, { background: "#e8eeff", borderColor: "#3853c7" }, { background: "#efffe8", borderColor: "#23a03a" },
  { background: "#fff2f2", borderColor: "#cc3d3d" }, { background: "#e9f7ff", borderColor: "#006f9f" }, { background: "#faf0ff", borderColor: "#8b2fc6" }, { background: "#fff9e6", borderColor: "#9c7a00" },
];

function sameName(a: string, b: string) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
function nameKey(value: string) { return value.trim().toLowerCase(); }
function cleanPin(value: string) { return value.replace(/\D/g, "").slice(0, PIN_DIGITS); }
function overCount(shift: Shift) { return Math.max(0, shift.assignments.length - shift.required); }
function shiftLabel(type: ShiftType) { return type === "MID" ? "MID" : type; }
function shiftFriendly(type: ShiftType) { return type === "AM" ? "Morning" : type === "MID" ? "Mid" : "Afternoon"; }
function requestKey(r: Pick<RequestItem, "shiftId" | "name">) { return `${r.shiftId}|${nameKey(r.name)}`; }
function requestRank(status: RequestItem["status"]) { return status === "approved" ? 3 : status === "pending" ? 2 : 1; }
function hashName(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function addDaysFromIso(startIso: string, days: number) { const d = new Date(`${startIso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function guardList(shift?: Shift) { const names = shift?.assignments.map((a) => `${a.lead ? "★ " : ""}${a.name.trim()}`).filter(Boolean) || []; return names.length ? names.join(", ") : "OPEN"; }
function shiftText(shift?: Shift) { if (!shift) return "OPEN"; const needed = openCount(shift); const over = overCount(shift); return `${guardList(shift)}${over > 0 ? ` - ${over} over` : needed > 0 ? ` - ${needed} needed` : " - Full"}`; }
function rowsBetween(shifts: Shift[], start: string, end: string): ReportRow[] {
  const byDate = new Map<string, ReportRow>();
  shifts.filter((s) => s.date >= start && s.date <= end).forEach((s) => {
    const row = byDate.get(s.date) || { dateIso: s.date, date: longDate(s.date), am: "", mid: "", pm: "", open: 0 };
    if (s.type === "AM") row.am = shiftText(s); else if (s.type === "MID") row.mid = shiftText(s); else row.pm = shiftText(s);
    row.open += openCount(s);
    byDate.set(s.date, row);
  });
  return Array.from(byDate.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
function dedupeRequests(requests: RequestItem[]) {
  const map = new Map<string, RequestItem>();
  for (const request of requests) {
    const cleanName = request.name.trim();
    if (!cleanName || !request.shiftId) continue;
    const next = { ...request, name: cleanName, createdAt: request.createdAt || new Date().toISOString() };
    const key = requestKey(next);
    const current = map.get(key);
    if (!current || requestRank(next.status) > requestRank(current.status) || (requestRank(next.status) === requestRank(current.status) && next.createdAt > current.createdAt)) map.set(key, current ? { ...next, id: current.id } : next);
  }
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function normalizeState(input: AppState): AppState {
  const base = blankState();
  const shiftMap = new Map((Array.isArray(input.shifts) ? input.shifts : []).map((s) => [s.id, s]));
  return {
    ...base,
    ...input,
    lifeguards: Array.isArray(input.lifeguards) ? input.lifeguards : [],
    requests: dedupeRequests(Array.isArray(input.requests) ? input.requests : []),
    shifts: base.shifts.map((shift) => {
      const incoming = shiftMap.get(shift.id);
      if (!incoming) return shift;
      const seen = new Set<string>();
      const assignments = (incoming.assignments || []).filter((a) => { const key = nameKey(a.name); if (!key || seen.has(key)) return false; seen.add(key); return true; });
      return { ...shift, ...incoming, assignments };
    }),
  };
}

function browserCacheState(input: AppState): AppState {
  return {
    ...input,
    lifeguards: [],
  };
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
  const [adminError, setAdminError] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [reportStart, setReportStart] = useState(() => todayIso());
  const [reportEnd, setReportEnd] = useState(() => addDaysIso(14));
  const [manualName, setManualName] = useState("");
  const [resetText, setResetText] = useState("");
  const [scheduleWindow, setScheduleWindow] = useState<"current" | "next">("current");
  const [guardForm, setGuardForm] = useState<{ id: string; name: string; pin: string }>({ id: "", name: "", pin: "" });
  const [clearConfirm, setClearConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadShared() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("state");
      const data = await res.json();
      const next = normalizeState(data.state as AppState);
      setState(next);
      setShared(Boolean(data.shared));
      setAdminAuthed(Boolean(data.admin));
      if (data.guardName) {
        setName(String(data.guardName));
        setView("select");
      }
      setSyncStatus(data.shared ? `Shared database connected · ${VERSION}` : `Testing mode: browser storage only · ${VERSION}`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(browserCacheState(next)));
    } catch {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(normalizeState(JSON.parse(saved) as AppState));
      setSyncStatus(`Offline fallback: browser storage only · ${VERSION}`);
    }
  }
  async function persist(nextInput: AppState, replace = false, hardReplace = false) {
    const next = normalizeState({ ...nextInput, updatedAt: new Date().toISOString() });
    try {
      const res = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: next, replace, hardReplace }) });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          setAdminAuthed(false);
          setView("adminPin");
          setAdminError("Admin session expired. Enter the admin code again.");
        }
        setSyncStatus(data.error || `Could not save changes · ${VERSION}`);
        return;
      }
      if (data.ok) {
        const saved = normalizeState(data.state as AppState);
        setState(saved);
        setShared(Boolean(data.shared));
        setAdminAuthed(Boolean(data.admin));
        setSyncStatus(data.shared ? `Shared database connected · ${VERSION}` : `Testing mode: browser storage only · ${VERSION}`);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(browserCacheState(saved)));
      }
    } catch { setSyncStatus(`Could not save changes. Check the connection and try again · ${VERSION}`); }
  }
  useEffect(() => { void loadShared(); }, []);
  function updateState(updater: (current: AppState) => AppState, replace = false) { void persist(updater(state), replace); }

  const selectedName = name.trim();
  const today = todayIso();
  const selectableEnd = addDaysIso(SCHEDULE_LIMIT_DAYS);
  const adminStart = scheduleWindow === "current" ? today : addDaysFromIso(selectableEnd, 1);
  const adminEnd = scheduleWindow === "current" ? selectableEnd : addDaysFromIso(selectableEnd, SCHEDULE_LIMIT_DAYS + 1);
  const requests = useMemo(() => dedupeRequests(state.requests), [state.requests]);
  const availabilityRequests = requests.filter((r) => r.status === "pending");
  const adminRows = rowsBetween(state.shifts, adminStart, adminEnd);
  const twoWeekDates = useMemo(() => Array.from(new Set(state.shifts.filter((s) => s.date >= today && s.date <= selectableEnd).map((s) => s.date))).sort(), [state.shifts, today, selectableEnd]);
  const myRequests = useMemo(() => requests.filter((r) => sameName(r.name, selectedName)), [requests, selectedName]);
  const myApprovedShifts = useMemo(() => state.shifts.filter((s) => s.date >= today && s.date <= selectableEnd && s.assignments.some((a) => sameName(a.name, selectedName))).sort((a, b) => a.id.localeCompare(b.id)), [state.shifts, selectedName, today, selectableEnd]);
  const allGuardNames = useMemo(() => {
    const names = new Map<string, string>();
    const add = (value: string) => { const clean = value.trim(); if (clean && !names.has(nameKey(clean))) names.set(nameKey(clean), clean); };
    state.lifeguards.forEach((g) => add(g.name));
    requests.forEach((r) => add(r.name));
    state.shifts.forEach((s) => s.assignments.forEach((a) => add(a.name)));
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [state.lifeguards, state.shifts, requests]);
  const colorMap = useMemo(() => {
    const used = new Set<number>();
    const map = new Map<string, GuardColor>();
    allGuardNames.forEach((guardName) => { let index = hashName(nameKey(guardName)) % GUARD_PALETTE.length; let safety = 0; while (used.has(index) && safety < GUARD_PALETTE.length) { index = (index + 1) % GUARD_PALETTE.length; safety += 1; } used.add(index); map.set(nameKey(guardName), GUARD_PALETTE[index]); });
    return map;
  }, [allGuardNames]);
  const balanceRows = useMemo(() => {
    const approved = new Map<string, number>();
    const available = new Map<string, number>();
    const displayNames = new Map<string, string>();
    const addDisplayName = (value: string) => { const clean = value.trim(); if (clean && !displayNames.has(nameKey(clean))) displayNames.set(nameKey(clean), clean); };
    allGuardNames.forEach(addDisplayName);
    state.shifts.filter((s) => s.date >= adminStart && s.date <= adminEnd).forEach((s) => s.assignments.forEach((a) => { addDisplayName(a.name); approved.set(nameKey(a.name), (approved.get(nameKey(a.name)) || 0) + 1); }));
    requests.forEach((r) => { const shift = state.shifts.find((s) => s.id === r.shiftId); if (!shift || shift.date < adminStart || shift.date > adminEnd || r.status !== "pending") return; addDisplayName(r.name); available.set(nameKey(r.name), (available.get(nameKey(r.name)) || 0) + 1); });
    return Array.from(displayNames.entries()).map(([key, display]) => ({ name: display, approved: approved.get(key) || 0, available: available.get(key) || 0 })).sort((a, b) => b.approved - a.approved || b.available - a.available || a.name.localeCompare(b.name));
  }, [state.shifts, requests, allGuardNames, adminStart, adminEnd]);
  const maxBalanceValue = Math.max(1, ...balanceRows.map((r) => Math.max(r.approved, r.available)));

  function guardStyle(guardName: string): GuardColor { return colorMap.get(nameKey(guardName)) || GUARD_PALETTE[hashName(nameKey(guardName)) % GUARD_PALETTE.length]; }
  function findShift(date: string, type: ShiftType) { return state.shifts.find((s) => s.date === date && s.type === type); }
  function alreadyAssigned(shift: Shift, guardName: string) { return shift.assignments.some((a) => sameName(a.name, guardName)); }
  function isLeadForShift(shift: Shift, guardName: string) { return shift.assignments.some((a) => sameName(a.name, guardName) && Boolean(a.lead)); }
  function isDoubleForDate(date: string, guardName: string) { return state.shifts.filter((s) => s.date === date).reduce((n, s) => n + s.assignments.filter((a) => sameName(a.name, guardName)).length, 0) > 1; }
  function wouldCreateDouble(shift: Shift, guardName: string) { return state.shifts.some((s) => s.date === shift.date && s.id !== shift.id && s.assignments.some((a) => sameName(a.name, guardName))); }
  function doubleNamesInWindow() { const map = new Map<string, Set<string>>(); state.shifts.filter((s) => s.date >= adminStart && s.date <= adminEnd).forEach((s) => s.assignments.forEach((a) => { const key = `${s.date}|${nameKey(a.name)}`; if (!map.has(key)) map.set(key, new Set()); map.get(key)!.add(s.type); })); return Array.from(map.entries()).filter(([, types]) => types.size > 1); }
  function upsertRequest(list: RequestItem[], shiftId: string, guardName: string, status: RequestItem["status"] = "pending") { const clean = guardName.trim(); const key = `${shiftId}|${nameKey(clean)}`; let found = false; const updated = list.map((r) => { if (requestKey(r) !== key) return r; found = true; return { ...r, name: clean, status, createdAt: r.createdAt || new Date().toISOString() }; }); if (!found) updated.push({ id: `${shiftId}-${clean}-${Date.now()}-${Math.random().toString(16).slice(2)}`, shiftId, name: clean, status, createdAt: new Date().toISOString() }); return dedupeRequests(updated); }
  async function submitName() {
    const cleanName = selectedName;
    const cleanGuardPin = cleanPin(lifeguardPin);
    if (!cleanName || cleanGuardPin.length !== PIN_DIGITS) return setLoginError("Enter your first name and six digit PIN.");
    try {
      const res = await fetch("/api/lifeguard-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: cleanName, pin: cleanGuardPin }) });
      const data = await res.json();
      if (!res.ok || !data.ok) return setLoginError(data.error || "That name and PIN do not match an active lifeguard record. Ask Hollie/admin to add or correct your PIN.");
      const next = normalizeState(data.state as AppState);
      setState(next);
      setName(String(data.guardName || cleanName));
      setLifeguardPin("");
      setLoginError("");
      setShared(Boolean(data.shared));
      setSyncStatus(data.shared ? `Shared database connected · ${VERSION}` : `Testing mode: browser storage only · ${VERSION}`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(browserCacheState(next)));
      setView("select");
    } catch {
      setLoginError("Could not verify your PIN. Check the connection and try again.");
    }
  }
  function toggleShift(shiftId: string) { const shift = state.shifts.find((s) => s.id === shiftId); if (!shift || shift.date < today || shift.date > selectableEnd) return; setSelected((cur) => (cur.includes(shiftId) ? cur.filter((id) => id !== shiftId) : [...cur, shiftId])); }
  async function submitAvailability() {
    if (!selectedName || !selected.length) return;
    try {
      const res = await fetch("/api/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftIds: selected }) });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSyncStatus(data.error || `Could not submit availability · ${VERSION}`);
        if (res.status === 401) setView("entry");
        return;
      }
      const next = normalizeState(data.state as AppState);
      setState(next);
      setSelected([]);
      setShared(Boolean(data.shared));
      setSyncStatus(data.shared ? `Shared database connected · ${VERSION}` : `Testing mode: browser storage only · ${VERSION}`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(browserCacheState(next)));
      setView("confirm");
    } catch {
      setSyncStatus(`Could not submit availability. Check the connection and try again · ${VERSION}`);
    }
  }
  async function openAdmin() {
    if (!pin.trim()) return setAdminError("Enter the admin code.");
    try {
      const res = await fetch("/api/admin-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: pin.trim() }) });
      const data = await res.json();
      if (!res.ok || !data.ok) return setAdminError(data.error || "Admin code not accepted.");
      const next = normalizeState(data.state as AppState);
      setState(next);
      setShared(Boolean(data.shared));
      setAdminAuthed(true);
      setAdminError("");
      setPin("");
      setSyncStatus(data.shared ? `Shared database connected · ${VERSION}` : `Testing mode: browser storage only · ${VERSION}`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(browserCacheState(next)));
      setView("admin");
    } catch {
      setAdminError("Could not verify admin access. Check the connection and try again.");
    }
  }
  function approveAvailable(request: RequestItem) { updateState((cur) => { const shift = cur.shifts.find((s) => s.id === request.shiftId); const shifts = shift && !alreadyAssigned(shift, request.name) ? cur.shifts.map((s) => (s.id === request.shiftId ? { ...s, assignments: [...s.assignments, { name: request.name, source: "request" as const }] } : s)) : cur.shifts; return { ...cur, shifts, requests: upsertRequest(cur.requests, request.shiftId, request.name, "approved") }; }, true); }
  function clearAllAvailability() { if (!clearConfirm) { setClearConfirm(true); return; } const next = normalizeState({ ...state, requests: requests.filter((r) => r.status !== "pending"), updatedAt: new Date().toISOString() }); void persist(next, false, true); setClearConfirm(false); }
  function addManualToShift(shiftId: string, guardName: string, source: "manual" | "request" = "manual") { const clean = guardName.trim(); if (!clean) return; updateState((cur) => ({ ...cur, shifts: cur.shifts.map((s) => (s.id === shiftId && !alreadyAssigned(s, clean) ? { ...s, assignments: [...s.assignments, { name: clean, source }] } : s)), requests: upsertRequest(cur.requests, shiftId, clean, "approved") }), true); }
  function addManual(shiftId: string) { addManualToShift(shiftId, manualName); setManualName(""); }
  function removeAssignment(shiftId: string, oldName: string) { updateState((cur) => ({ ...cur, shifts: cur.shifts.map((s) => (s.id === shiftId ? { ...s, assignments: s.assignments.filter((a) => !sameName(a.name, oldName)) } : s)), requests: upsertRequest(cur.requests, shiftId, oldName, "pending") }), true); }
  function toggleLead(shiftId: string, guardName: string) { updateState((cur) => ({ ...cur, shifts: cur.shifts.map((s) => { if (s.id !== shiftId) return s; const currentlyLead = isLeadForShift(s, guardName); return { ...s, assignments: s.assignments.map((a) => (sameName(a.name, guardName) ? { ...a, lead: !currentlyLead } : { ...a, lead: false })) }; }) }), true); }
  function saveLifeguard() { const cleanName = guardForm.name.trim(); const cleanGuardPin = cleanPin(guardForm.pin); if (!cleanName || cleanGuardPin.length !== PIN_DIGITS) return; updateState((cur) => { const guard: Lifeguard = { id: guardForm.id || `${cleanName.toLowerCase()}-${Date.now()}`, name: cleanName, pin: cleanGuardPin }; const exists = cur.lifeguards.some((g) => g.id === guard.id); return { ...cur, lifeguards: exists ? cur.lifeguards.map((g) => (g.id === guard.id ? guard : g)) : [...cur.lifeguards, guard] }; }, true); setGuardForm({ id: "", name: "", pin: "" }); }
  function deleteLifeguard(id: string) { updateState((cur) => ({ ...cur, lifeguards: cur.lifeguards.filter((g) => g.id !== id) }), true); }
  function resetAll() { if (resetText !== "RESET SCHEDULE") return; void persist({ ...blankState(), lifeguards: state.lifeguards }, false, true); setResetText(""); }
  function availableForShift(shift: Shift): AvailableGuard[] { const byName = new Map<string, AvailableGuard>(); for (const r of requests.filter((x) => x.shiftId === shift.id && x.status === "pending" && !alreadyAssigned(shift, x.name))) byName.set(nameKey(r.name), { name: r.name, request: r }); return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)); }
  function renderNameChip(guardName: string, action?: "add" | "remove", onClick?: () => void, status?: string, doubleFlag = false, lead = false, onLeadClick?: () => void) { return <span className={doubleFlag ? "guardChip doubleChip" : lead ? "guardChip leadChip" : "guardChip"} style={guardStyle(guardName)}><strong>{guardName}</strong>{doubleFlag ? <em className="doubleFlag">DOUBLE</em> : null}{lead ? <em className="leadBadge">Lead</em> : null}{status ? <em>{status}</em> : null}{onLeadClick ? <button className={lead ? "leadStarBtn active" : "leadStarBtn"} onClick={onLeadClick} type="button" aria-label={`${lead ? "Remove" : "Make"} ${guardName} Lead`}>{lead ? "★" : "☆"}</button> : null}{action ? <button className={action === "add" ? "chipAction add" : "chipAction remove"} onClick={onClick} type="button" aria-label={`${action === "add" ? "Add" : "Remove"} ${guardName}`}>{action === "add" ? "+" : "×"}</button> : null}</span>; }
  function renderApprovedShiftForMe(shift: Shift) { const coworkers = shift.assignments.map((a) => a.name).filter((n) => !sameName(n, selectedName)); const isLead = isLeadForShift(shift, selectedName); return <div key={shift.id} className={isLead ? "shiftBtn approvedOnly leadApproved" : "shiftBtn approvedOnly"}><span className="shiftTitle"><span>{niceDate(shift.date)} · {shiftLabel(shift.type)}</span><span>{shift.start} - {shift.end}</span></span><span className="shiftMeta">{isLead ? "★ You are Lead for this shift" : "You are approved for this shift"}{coworkers.length ? ` with ${coworkers.join(", ")}` : "."}</span></div>; }
  function renderSelectableShift(shift: Shift) { const available = myRequests.some((r) => r.shiftId === shift.id && r.status !== "rejected"); const isSelected = selected.includes(shift.id); const meAssigned = shift.assignments.some((a) => sameName(a.name, selectedName)); const spots = openCount(shift); const full = spots <= 0; return <button key={shift.id} className="shiftBtn" data-selected={isSelected} disabled={available || meAssigned} onClick={() => toggleShift(shift.id)}><span className="shiftTitle"><span>{shiftFriendly(shift.type)}</span><span>{shift.start} - {shift.end}</span></span><span>{meAssigned ? <span className="badge badgeFull">You work</span> : null} {available ? <span className="badge badgePending">Available</span> : null} {isSelected ? <span className="badge badgePending">Selected</span> : null} {full ? <span className="badge badgeDanger">Full</span> : <span className="badge badgeOpen">{spots} open</span>}</span></button>; }
  function renderAdminCell(date: string, type: ShiftType) { const shift = findShift(date, type); if (!shift) return <span className="small">No shift</span>; const available = availableForShift(shift); return <div className="adminShiftCell"><div className="row"><div><h3>{shiftLabel(type)}</h3><div className="cellTime">{shift.start} - {shift.end}</div></div><span className={overCount(shift) > 0 ? "badge badgeDanger" : openCount(shift) > 0 ? "badge badgeOpen" : "badge badgeFull"}>{overCount(shift) > 0 ? `${overCount(shift)} overfilled` : openCount(shift) > 0 ? `${openCount(shift)} open` : "Full"}</span></div><div className="nameWrap">{shift.assignments.length === 0 ? <span className="openText">No one assigned.</span> : shift.assignments.map((a) => renderNameChip(a.name, "remove", () => removeAssignment(shift.id, a.name), undefined, isDoubleForDate(date, a.name), Boolean(a.lead), () => toggleLead(shift.id, a.name)))}</div><div className="alternateBox"><div className="small">Available for this {shiftLabel(type)} shift</div><div className="nameWrap">{available.length ? available.map((item) => renderNameChip(item.name, "add", () => approveAvailable(item.request), wouldCreateDouble(shift, item.name) ? "double" : undefined, wouldCreateDouble(shift, item.name))) : <span className="small">No lifeguards have marked themselves available for this shift.</span>}</div></div><div className="actions"><input className="input" placeholder="Type lifeguard name" value={manualName} onChange={(e) => setManualName(e.target.value)} /><button className="primaryBtn" onClick={() => addManual(shift.id)}>Add</button></div></div>; }
  function exportReport() { const rows = rowsBetween(state.shifts, reportStart, reportEnd); const csv = [`Serenity Shores Pool Schedule ${VERSION}`, `${longDate(reportStart)} through ${longDate(reportEnd)}`, "", "Date,AM 10-3:30,MID 12-6,PM 3:30-10,Open Spots", ...rows.map((r) => [r.date, r.am, r.mid, r.pm, String(r.open)].map(csvSafe).join(","))].join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `serenity-shores-pool-schedule-${reportStart}-to-${reportEnd}.csv`; link.click(); URL.revokeObjectURL(url); }
  function navTo(id: string) { if (!adminAuthed) return; setMenuOpen(false); setView("admin"); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
  const doubleFlags = doubleNamesInWindow();

  return <main className="appShell"><div className="topStrip">Serenity Shores pool · Lifeguard schedule · {VERSION}</div><header className="header"><button className="brand" onClick={() => setView("entry")} style={{ border: 0, background: "transparent", cursor: "pointer" }}><div className="brandText">Lifeguard Schedule {VERSION}</div></button>{adminAuthed ? <button className="ghostBtn" onClick={() => setMenuOpen(true)} type="button">☰ Menu</button> : null}<button className="adminBtn" onClick={() => setView(adminAuthed ? "admin" : "adminPin")}>Admin</button></header>{adminAuthed && menuOpen ? <div className="modal"><div className="modalCard stack"><h3>Admin navigation</h3><button className="ghostBtn" onClick={() => navTo("admin-schedule")}>Schedule</button><button className="ghostBtn" onClick={() => navTo("admin-lifeguards")}>Lifeguards and PINs</button><button className="ghostBtn" onClick={() => navTo("admin-balance")}>Balance graph</button><button className="ghostBtn" onClick={() => navTo("admin-export")}>Export report</button><button className="ghostBtn" onClick={() => navTo("admin-reset")}>Reset schedule</button><button className="primaryBtn" onClick={() => setMenuOpen(false)}>Close</button></div></div> : null}<section className="main"><p className="small" style={{ marginTop: 0 }}>{syncStatus} · {shared ? "shared" : "local"}</p>{view === "entry" ? <div className="card hero stack"><span className="kicker">Lifeguard check-in · {VERSION}</span><h1>Help fill the pool schedule.</h1><p className="lead">Enter your first name and your six digit PIN, then select every shift you are available to cover. You will appear as available for those shifts until admin adds you to the schedule.</p><input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input" inputMode="numeric" placeholder="Six digit PIN" value={lifeguardPin} onChange={(e) => setLifeguardPin(cleanPin(e.target.value))} onKeyDown={(e) => e.key === "Enter" && void submitName()} />{loginError ? <p className="small" style={{ color: "#b42318" }}>{loginError}</p> : null}<button className="primaryBtn" onClick={() => void submitName()}>See Shifts</button><p className="small">Lifeguards can mark availability from today through {niceDate(selectableEnd)}.</p></div> : null}{view === "select" ? <div className="stack"><div className="card stack"><h2>Hi, {selectedName}</h2><p className="small">Select every AM, MID, and PM shift you are available to cover. You will show up in admin as available, not as a separate pending item.</p></div><div className="card stack"><h3>Your approved schedule: next two weeks</h3>{myApprovedShifts.length ? myApprovedShifts.map((s) => renderApprovedShiftForMe(s)) : <p className="small">You do not have any approved shifts in the next two weeks yet.</p>}</div><div className="card stack"><h3>Select availability: next two weeks</h3>{twoWeekDates.map((date) => <div className="shiftCard" key={date}><div className="dateLine">{niceDate(date)}</div><div className="shiftGrid">{SHIFT_TYPES.map((t) => { const s = findShift(date, t); return s ? renderSelectableShift(s) : null; })}</div></div>)}</div><div className="stickySubmit"><div className="stickySubmitInner"><button className="primaryBtn" disabled={!selected.length} onClick={() => void submitAvailability()}>Submit {selected.length || ""} available shift{selected.length === 1 ? "" : "s"}</button><span className="small">Admin will choose available lifeguards and add them to the schedule.</span></div></div></div> : null}{view === "confirm" ? <div className="card hero stack"><span className="kicker">Submitted · {VERSION}</span><h1>Thank you.</h1><p className="lead">You are now listed as available for the shifts you selected.</p><button className="primaryBtn" onClick={() => setView("entry")}>Done</button></div> : null}{view === "adminPin" ? <div className="card hero stack"><span className="kicker">Admin access · {VERSION}</span><h1>Enter code.</h1><input className="input" inputMode="numeric" placeholder="Admin code" value={pin} onChange={(e) => { setPin(e.target.value); setAdminError(""); }} onKeyDown={(e) => e.key === "Enter" && void openAdmin()} />{adminError ? <p className="small" style={{ color: "#b42318" }}>{adminError}</p> : null}<button className="primaryBtn" onClick={() => void openAdmin()}>Open Admin</button><button className="ghostBtn" onClick={() => setView("entry")}>Back</button></div> : null}{view === "admin" && adminAuthed ? <div className="stack"><div className="card stack" id="admin-top"><span className="kicker">Admin dashboard · {VERSION}</span><h2>Schedule control</h2><div className="panelGrid"><div className="stat"><div className="statNum">{availabilityRequests.length}</div><div className="statLabel">Available entries</div></div><div className="stat"><div className="statNum">{state.lifeguards.length}</div><div className="statLabel">Lifeguards</div></div><div className="stat"><div className="statNum">{state.shifts.filter((s) => s.date >= adminStart && s.date <= adminEnd && overCount(s) > 0).length}</div><div className="statLabel">Overfilled shifts</div></div><div className="stat"><div className="statNum">{doubleFlags.length}</div><div className="statLabel">Double flags</div></div></div><div className="actions"><button className={clearConfirm ? "dangerBtn" : "ghostBtn"} onClick={clearAllAvailability}>{clearConfirm ? "Confirm Clear All Availability" : "Clear All Availability"}</button><button className="ghostBtn" onClick={() => { setClearConfirm(false); void loadShared(); }}>Refresh</button></div>{clearConfirm ? <p className="small" style={{ color: "#a91f1f" }}>Second step required: press Confirm Clear All Availability to remove available entries only. Approved schedule assignments stay untouched.</p> : null}<p className="small">{VERSION} removes the redundant pending section. Lifeguard submissions now appear only as available guards under each shift.</p></div><div className="card stack" id="admin-schedule"><div className="row"><div><h3>{scheduleWindow === "current" ? "Current" : "Following"} two-week schedule</h3><p className="small">{longDate(adminStart)} through {longDate(adminEnd)}</p></div><button className="ghostBtn" onClick={() => setScheduleWindow(scheduleWindow === "current" ? "next" : "current")}>{scheduleWindow === "current" ? "Show following two weeks" : "Show current two weeks"}</button></div>{adminRows.map((r) => <div className="adminDay" key={r.dateIso}><div className="dateLine">{longDate(r.dateIso)}</div><div className="adminGrid threeShiftGrid">{SHIFT_TYPES.map((t) => <div key={`${r.dateIso}-${t}`}>{renderAdminCell(r.dateIso, t)}</div>)}</div></div>)}</div><div className="card stack" id="admin-balance"><h3>Balance graph</h3><p className="small">Approved shifts compared against available entries for the visible two-week schedule.</p><div className="balanceLegend"><span className="legendItem approvedLegend">Approved shifts</span><span className="legendItem requestLegend">Available entries</span></div><div className="balanceGraph">{balanceRows.map((row) => { const color = guardStyle(row.name); return <div className="balanceGraphRow" key={row.name}><span className="guardChip balanceName" style={color}><strong>{row.name}</strong></span><div className="balanceBars"><div className="barLine"><span className="barLabel">Approved {row.approved}</span><span className="barTrack"><span className="barFill approvedFill" style={{ width: `${(row.approved / maxBalanceValue) * 100}%`, background: color.borderColor }} /></span></div><div className="barLine"><span className="barLabel">Available {row.available}</span><span className="barTrack"><span className="barFill requestFill" style={{ width: `${(row.available / maxBalanceValue) * 100}%`, background: color.background, borderColor: color.borderColor }} /></span></div></div></div>; })}</div></div><div className="card stack" id="admin-lifeguards"><h3>Lifeguards and PINs</h3><input className="input" placeholder="Lifeguard first name" value={guardForm.name} onChange={(e) => setGuardForm({ ...guardForm, name: e.target.value })} /><input className="input" inputMode="numeric" placeholder="Six digit PIN" value={guardForm.pin} onChange={(e) => setGuardForm({ ...guardForm, pin: cleanPin(e.target.value) })} /><div className="actions"><button className="primaryBtn" onClick={saveLifeguard}>{guardForm.id ? "Save Lifeguard" : "Add Lifeguard"}</button>{guardForm.id ? <button className="ghostBtn" onClick={() => setGuardForm({ id: "", name: "", pin: "" })}>Cancel</button> : null}</div><div className="nameWrap">{[...state.lifeguards].sort((a, b) => a.name.localeCompare(b.name)).map((g) => <span className="guardChip" style={guardStyle(g.name)} key={g.id}><strong>{g.name}</strong><em>{g.pin}</em><button className="miniBtn" onClick={() => setGuardForm(g)}>Edit</button><button className="miniBtn danger" onClick={() => deleteLifeguard(g.id)}>Delete</button></span>)}</div></div><div className="card stack" id="admin-export"><h3>Export report</h3><div className="row"><input className="input" type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} /><input className="input" type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} /></div><button className="primaryBtn" onClick={exportReport}>Download CSV</button></div><div className="card stack dangerZone" id="admin-reset"><h3>Reset schedule</h3><p className="small">This clears schedule and availability entries but keeps lifeguard names/PINs. Type RESET SCHEDULE.</p><input className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} /><button className="dangerBtn" onClick={resetAll}>Reset Everything</button></div></div> : null}</section></main>;
}
