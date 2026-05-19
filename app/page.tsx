"use client";

import { useEffect, useMemo, useState } from "react";

type ShiftType = "AM" | "PM";
type RequestStatus = "pending" | "approved" | "rejected";
type Assignment = { name: string; source?: "admin" | "request" };
type Shift = { id: string; date: string; type: ShiftType; start: string; end: string; required: number; assignments: Assignment[] };
type RequestItem = { id: string; name: string; shiftId: string; status: RequestStatus; createdAt: string };
type AppState = { shifts: Shift[]; requests: RequestItem[]; updatedAt: string };
type View = "entry" | "select" | "confirm" | "adminPin" | "admin";

const ADMIN_CODE = "7900";
const STORAGE_KEY = "serenity-shores-lifeguard-scheduler-v1";
const END_DATE = new Date("2026-10-10T12:00:00");

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return isoDate(new Date());
}
function niceDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}
function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function buildInitialShifts(): Shift[] {
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
function blankState(): AppState {
  return { shifts: buildInitialShifts(), requests: [], updatedAt: new Date().toISOString() };
}
function openCount(shift: Shift) {
  return Math.max(0, shift.required - shift.assignments.length);
}
function sameDayDouble(shifts: Shift[], shift: Shift, name: string) {
  return shifts.some((s) => s.date === shift.date && s.id !== shift.id && s.assignments.some((a) => a.name.toLowerCase() === name.toLowerCase()));
}
function csvSafe(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => blankState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("entry");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "mine">("open");
  const [pin, setPin] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminDate, setAdminDate] = useState(() => todayIso());
  const [reportStart, setReportStart] = useState(() => todayIso());
  const [reportEnd, setReportEnd] = useState(() => addDaysIso(14));
  const [manualName, setManualName] = useState("");
  const [resetText, setResetText] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved) as AppState);
    } catch (error) {
      console.warn("Could not load saved lifeguard schedule.", error);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const byDate = useMemo(() => {
    const grouped = new Map<string, Shift[]>();
    state.shifts.forEach((shift) => {
      if (!grouped.has(shift.date)) grouped.set(shift.date, []);
      grouped.get(shift.date)?.push(shift);
    });
    return grouped;
  }, [state.shifts]);

  const visibleDates = useMemo(() => Array.from(byDate.keys()).slice(0, 45), [byDate]);
  const selectedName = name.trim();
  const myRequests = state.requests.filter((r) => r.name.toLowerCase() === selectedName.toLowerCase());
  const openShifts = state.shifts.filter((s) => openCount(s) > 0);
  const pendingRequests = state.requests.filter((r) => r.status === "pending");
  const totalOpen = state.shifts.reduce((sum, s) => sum + openCount(s), 0);
  const filledSlots = state.shifts.reduce((sum, s) => sum + s.assignments.length, 0);

  function updateState(mutator: (draft: AppState) => AppState) {
    setState((current) => ({ ...mutator(current), updatedAt: new Date().toISOString() }));
  }
  function submitName() {
    if (selectedName) setView("select");
  }
  function toggleShift(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }
  function submitRequests() {
    if (!selectedName || selected.length === 0) return;
    updateState((current) => {
      const existing = new Set(current.requests.map((r) => `${r.name.toLowerCase()}|${r.shiftId}`));
      const additions: RequestItem[] = selected
        .filter((shiftId) => !existing.has(`${selectedName.toLowerCase()}|${shiftId}`))
        .map((shiftId) => ({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: selectedName, shiftId, status: "pending", createdAt: new Date().toISOString() }));
      return { ...current, requests: [...current.requests, ...additions] };
    });
    setSelected([]);
    setView("confirm");
  }
  function adminLogin() {
    if (pin === ADMIN_CODE) {
      setAdminAuthed(true);
      setView("admin");
      setPin("");
    }
  }
  function approveRequest(req: RequestItem) {
    updateState((current) => {
      const shift = current.shifts.find((s) => s.id === req.shiftId);
      if (!shift) return current;
      const canAssign = openCount(shift) > 0 && !shift.assignments.some((a) => a.name.toLowerCase() === req.name.toLowerCase()) && !sameDayDouble(current.shifts, shift, req.name);
      return {
        ...current,
        shifts: current.shifts.map((s) => (s.id === req.shiftId && canAssign ? { ...s, assignments: [...s.assignments, { name: req.name, source: "request" }] } : s)),
        requests: current.requests.map((r) => (r.id === req.id ? { ...r, status: canAssign ? "approved" : "rejected" } : r))
      };
    });
  }
  function rejectRequest(id: string) {
    updateState((current) => ({ ...current, requests: current.requests.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)) }));
  }
  function addManual(shiftId: string) {
    const clean = manualName.trim();
    if (!clean) return;
    updateState((current) => ({
      ...current,
      shifts: current.shifts.map((s) => {
        if (s.id !== shiftId || openCount(s) <= 0 || s.assignments.some((a) => a.name.toLowerCase() === clean.toLowerCase())) return s;
        return { ...s, assignments: [...s.assignments, { name: clean, source: "admin" }] };
      })
    }));
    setManualName("");
  }
  function removeAssignment(shiftId: string, guardName: string) {
    updateState((current) => ({ ...current, shifts: current.shifts.map((s) => (s.id === shiftId ? { ...s, assignments: s.assignments.filter((a) => a.name !== guardName) } : s)) }));
  }
  function resetAll() {
    if (resetText !== "RESET SCHEDULE") return;
    setState(blankState());
    setResetText("");
  }
  function exportPdf() {
    const rows = state.shifts
      .filter((s) => s.date >= reportStart && s.date <= reportEnd)
      .reduce<Record<string, { date: string; am: string; pm: string; open: number }>>((acc, s) => {
        if (!acc[s.date]) acc[s.date] = { date: longDate(s.date), am: "", pm: "", open: 0 };
        const names = s.assignments.map((a) => a.name).join(", ") || "OPEN";
        if (s.type === "AM") acc[s.date].am = `${names} (${openCount(s)} open)`;
        if (s.type === "PM") acc[s.date].pm = `${names} (${openCount(s)} open)`;
        acc[s.date].open += openCount(s);
        return acc;
      }, {});
    const csv = ["Date,AM 10-3:30,PM 3:30-10,Open Spots", ...Object.values(rows).map((r) => [r.date, r.am, r.pm, String(r.open)].map(csvSafe).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `serenity-shores-pool-schedule-${reportStart}-to-${reportEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function renderShiftButton(shift: Shift) {
    const requested = myRequests.some((r) => r.shiftId === shift.id && r.status !== "rejected");
    const isSelected = selected.includes(shift.id);
    const isMine = requested || isSelected;
    if (filter === "open" && openCount(shift) <= 0) return null;
    if (filter === "mine" && !isMine) return null;
    return (
      <button key={shift.id} className="shiftBtn" data-selected={isSelected} disabled={openCount(shift) <= 0 || requested} onClick={() => toggleShift(shift.id)}>
        <span className="shiftTitle"><span>{shift.type === "AM" ? "Morning" : "Afternoon"}</span><span>{shift.start} - {shift.end}</span></span>
        <span className="shiftMeta">{shift.assignments.length}/{shift.required} scheduled · {openCount(shift)} needed</span>
        <span>{openCount(shift) > 0 ? <span className="badge badgeOpen">Open</span> : <span className="badge badgeFull">Full</span>} {requested ? <span className="badge badgePending">Requested</span> : null}</span>
      </button>
    );
  }

  return (
    <main className="appShell">
      <div className="topStrip">Serenity Shores pool · Lifeguard schedule</div>
      <header className="header"><div className="brand"><p className="brandTitle">Pool Schedule</p><p className="brandSub">Serenity Shores</p></div><button className="adminBtn" onClick={() => setView(adminAuthed ? "admin" : "adminPin")}>Admin</button></header>
      <section className="main">
        {view === "entry" ? <div className="card hero stack"><span className="kicker">Lifeguard check-in</span><h1>Help fill the pool schedule.</h1><p className="lead">Enter your first name, choose the morning or afternoon shifts you can cover, then submit. Holly/admin approves the final schedule.</p><input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitName()} /><button className="primaryBtn" onClick={submitName}>See Open Shifts</button><p className="small">Shifts run from now through Oct. 10, 2026. Morning is 10:00 AM-3:30 PM. Afternoon is 3:30 PM-10:00 PM.</p></div> : null}
        {view === "select" ? <div className="stack"><div className="card stack"><div className="row"><div><h2>Hi, {selectedName}</h2><p className="small">Select openings you are available to cover.</p></div><button className="ghostBtn" onClick={() => setView("entry")}>Change</button></div><div className="panelGrid"><div className="stat"><div className="statNum">{totalOpen}</div><div className="statLabel">Open spots</div></div><div className="stat"><div className="statNum">{selected.length}</div><div className="statLabel">Selected</div></div></div><div className="tabs"><button className="tab" data-active={filter === "open"} onClick={() => setFilter("open")}>Open only</button><button className="tab" data-active={filter === "all"} onClick={() => setFilter("all")}>All shifts</button><button className="tab" data-active={filter === "mine"} onClick={() => setFilter("mine")}>Mine</button></div></div>{visibleDates.map((date) => <div className="shiftCard" key={date}><div className="dateLine">{niceDate(date)}</div><div className="shiftGrid">{(byDate.get(date) || []).map(renderShiftButton)}</div></div>)}<div className="stickySubmit"><div className="stickySubmitInner"><button className="primaryBtn" disabled={selected.length === 0} onClick={submitRequests}>Submit {selected.length || ""} Shift Request{selected.length === 1 ? "" : "s"}</button><span className="small">Requests wait for admin approval before becoming final.</span></div></div></div> : null}
        {view === "confirm" ? <div className="card hero stack"><span className="kicker">Submitted</span><h1>Thank you.</h1><p className="lead">Your shift request was sent to the admin queue. The official schedule only changes after admin approval.</p><button className="primaryBtn" onClick={() => setView("select")}>Choose More Shifts</button></div> : null}
        {view === "adminPin" ? <div className="card hero stack"><span className="kicker">Admin access</span><h1>Enter the code.</h1><input className="input" inputMode="numeric" placeholder="Admin code" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adminLogin()} /><button className="primaryBtn" onClick={adminLogin}>Open Admin</button><p className="small">Admin controls approvals, final schedule edits, reset, and PDF reports.</p></div> : null}
        {view === "admin" ? <div className="stack"><div className="card stack"><span className="kicker">Admin dashboard</span><h2>Coverage control center</h2><div className="panelGrid"><div className="stat"><div className="statNum">{pendingRequests.length}</div><div className="statLabel">Pending</div></div><div className="stat"><div className="statNum">{totalOpen}</div><div className="statLabel">Open spots</div></div><div className="stat"><div className="statNum">{filledSlots}</div><div className="statLabel">Scheduled</div></div><div className="stat"><div className="statNum">{openShifts.length}</div><div className="statLabel">Shifts with gaps</div></div></div></div><div className="card stack"><h3>Pending requests</h3>{pendingRequests.length === 0 ? <p className="small">No pending requests right now.</p> : null}{pendingRequests.map((r) => { const s = state.shifts.find((x) => x.id === r.shiftId); return <div className="shiftCard" key={r.id}><div className="row"><div><strong>{r.name}</strong><div className="small">{s ? `${longDate(s.date)} · ${s.type} · ${s.start}-${s.end}` : r.shiftId}</div></div><span className="badge badgePending">Pending</span></div><div className="actions"><button className="secondaryBtn" onClick={() => approveRequest(r)}>Approve</button><button className="dangerBtn" onClick={() => rejectRequest(r.id)}>Reject</button></div></div>; })}</div><div className="card stack"><h3>Schedule editor</h3><label className="small">Date</label><input className="input" type="date" value={adminDate} onChange={(e) => setAdminDate(e.target.value)} /><label className="small">Add lifeguard manually</label><input className="input" placeholder="Name to add" value={manualName} onChange={(e) => setManualName(e.target.value)} />{(byDate.get(adminDate) || []).map((s) => <div className="shiftCard" key={s.id}><div className="row"><div><strong>{s.type} · {s.start}-{s.end}</strong><div className="small">{openCount(s)} open spot{openCount(s) === 1 ? "" : "s"}</div></div>{openCount(s) > 0 ? <span className="badge badgeOpen">Needs help</span> : <span className="badge badgeFull">Full</span>}</div><div>{s.assignments.map((a) => <span className="namePill" key={`${s.id}-${a.name}`}>{a.name} <button className="noPrint" style={{ marginLeft: 6, border: 0, background: "transparent", fontWeight: 900 }} onClick={() => removeAssignment(s.id, a.name)}>×</button></span>)}</div><button className="secondaryBtn" disabled={!manualName.trim() || openCount(s) <= 0} onClick={() => addManual(s.id)}>Add to this shift</button></div>)}</div><div className="card stack"><h3>Report export</h3><div className="shiftGrid"><div><label className="small">Start date</label><input className="input" type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} /></div><div><label className="small">End date</label><input className="input" type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} /></div></div><button className="primaryBtn" onClick={exportPdf}>Download Schedule Report</button></div><div className="card stack"><h3>Danger zone</h3><p className="small">To reset all requests and schedule assignments, type RESET SCHEDULE exactly.</p><input className="input" placeholder="RESET SCHEDULE" value={resetText} onChange={(e) => setResetText(e.target.value)} /><button className="dangerBtn" disabled={resetText !== "RESET SCHEDULE"} onClick={resetAll}>Reset Everything</button></div></div> : null}
      </section>
    </main>
  );
}
