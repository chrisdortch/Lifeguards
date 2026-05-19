"use client";

import { useEffect, useMemo, useState } from "react";
import { AppState, Lifeguard, RequestItem, Shift, ShiftType, addDaysIso, blankState, csvSafe, longDate, niceDate, openCount, todayIso } from "../lib/schedule";

type View = "entry" | "select" | "confirm" | "adminPin" | "admin";
type ReportRow = { dateIso: string; date: string; am: string; pm: string; open: number };

const ADMIN_CODE = "7900";
const STORAGE_KEY = "serenity-shores-lifeguard-scheduler-v3";
const SCHEDULE_LIMIT_DAYS = 14;

function normalizeState(input: AppState): AppState {
  return { ...blankState(), ...input, lifeguards: Array.isArray(input.lifeguards) ? input.lifeguards : [] };
}

function startOfWeekIso(offsetDays = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function endFromStart(start: string, days: number) {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function guardList(shift: Shift | undefined) {
  if (!shift) return "OPEN";
  const names = shift.assignments.map((a) => a.name.trim()).filter(Boolean);
  return names.length ? names.join(", ") : "OPEN";
}

function shiftText(shift: Shift | undefined) {
  if (!shift) return "OPEN - 3 needed";
  const needed = openCount(shift);
  return `${guardList(shift)}${needed > 0 ? ` - ${needed} needed` : " - Full"}`;
}

function rowsBetween(shifts: Shift[], start: string, end: string): ReportRow[] {
  const byDate = new Map<string, ReportRow>();
  shifts.filter((s) => s.date >= start && s.date <= end).forEach((s) => {
    const existing = byDate.get(s.date) || { dateIso: s.date, date: longDate(s.date), am: "", pm: "", open: 0 };
    if (s.type === "AM") existing.am = shiftText(s);
    if (s.type === "PM") existing.pm = shiftText(s);
    existing.open += openCount(s);
    byDate.set(s.date, existing);
  });
  return Array.from(byDate.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

function cleanPin(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
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
  const [filter, setFilter] = useState<"all" | "open" | "mine">("open");
  const [pin, setPin] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminDate, setAdminDate] = useState(() => todayIso());
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
      if (!res.ok) throw new Error("Shared state unavailable");
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

  async function persist(nextInput: AppState) {
    const next = normalizeState({ ...nextInput, updatedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    try {
      const res = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: next }) });
      const data = await res.json();
      if (data.ok) {
        setShared(Boolean(data.shared));
        setSyncStatus(data.shared ? "Shared database connected" : "Testing mode: browser storage only");
      }
    } catch {
      setSyncStatus("Offline fallback: browser storage only");
    }
  }

  useEffect(() => { void loadShared(); }, []);

  const selectedName = name.trim();
  const statusText = `${syncStatus} · ${shared ? "shared" : "local"}`;
  const selectableEnd = addDaysIso(SCHEDULE_LIMIT_DAYS);
  const openShifts = useMemo(() => state.shifts.filter((shift) => shift.date >= todayIso() && shift.date <= selectableEnd).slice(0, 80), [state.shifts, selectableEnd]);
  const myRequests = useMemo(() => state.requests.filter((r) => r.name.toLowerCase() === selectedName.toLowerCase()), [state.requests, selectedName]);
  const pendingRequests = state.requests.filter((r) => r.status === "pending");
  const reportRows = rowsBetween(state.shifts, reportStart, reportEnd);
  const currentStart = startOfWeekIso(scheduleWindow === "current" ? 0 : 7);
  const currentEnd = endFromStart(currentStart, 6);
  const adminRows = rowsBetween(state.shifts, currentStart, currentEnd);

  function updateState(updater: (current: AppState) => AppState) { void persist(updater(state)); }

  function submitName() {
    const cleanName = selectedName;
    const cleanGuardPin = cleanPin(lifeguardPin);
    const match = state.lifeguards.find((g) => g.name.trim().toLowerCase() === cleanName.toLowerCase() && g.pin === cleanGuardPin);
    if (!cleanName || cleanGuardPin.length !== 4) {
      setLoginError("Enter your first name and four digit PIN.");
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

  function selectedSameDay(shiftId: string) {
    const shift = state.shifts.find((s) => s.id === shiftId);
    if (!shift) return false;
    return selected.some((id) => {
      const selectedShift = state.shifts.find((s) => s.id === id);
      return Boolean(selectedShift && selectedShift.date === shift.date && selectedShift.id !== shift.id);
    });
  }

  function toggleShift(shiftId: string) {
    const shift = state.shifts.find((s) => s.id === shiftId);
    if (!shift || openCount(shift) <= 0) return;
    if (shift.date < todayIso() || shift.date > selectableEnd) return;
    if (!selected.includes(shiftId) && selectedSameDay(shiftId)) return;
    setSelected((current) => (current.includes(shiftId) ? current.filter((id) => id !== shiftId) : [...current, shiftId]));
  }

  function submitRequests() {
    if (!selectedName || selected.length === 0) return;
    const validSelected = selected.filter((shiftId) => {
      const shift = state.shifts.find((s) => s.id === shiftId);
      return Boolean(shift && shift.date >= todayIso() && shift.date <= selectableEnd && openCount(shift) > 0);
    });
    if (validSelected.length === 0) { setSelected([]); return; }
    const now = new Date().toISOString();
    const newRequests: RequestItem[] = validSelected.map((shiftId) => ({ id: `${shiftId}-${selectedName}-${Date.now()}-${Math.random().toString(16).slice(2)}`, shiftId, name: selectedName, status: "pending", createdAt: now }));
    updateState((current) => ({ ...current, requests: [...current.requests, ...newRequests] }));
    setSelected([]);
    setView("confirm");
  }

  function approveRequest(request: RequestItem) {
    updateState((current) => {
      const shift = current.shifts.find((s) => s.id === request.shiftId);
      if (!shift || openCount(shift) <= 0) return current;
      return { ...current, shifts: current.shifts.map((s) => s.id === request.shiftId ? { ...s, assignments: [...s.assignments, { name: request.name, source: "request" as const }] } : s), requests: current.requests.map((r) => (r.id === request.id ? { ...r, status: "approved" as const } : r)) };
    });
  }

  function rejectRequest(request: RequestItem) { updateState((current) => ({ ...current, requests: current.requests.map((r) => (r.id === request.id ? { ...r, status: "rejected" as const } : r)) })); }

  function addManual(shiftId: string) {
    const clean = manualName.trim();
    if (!clean) return;
    updateState((current) => ({ ...current, shifts: current.shifts.map((s) => s.id === shiftId && openCount(s) > 0 ? { ...s, assignments: [...s.assignments, { name: clean, source: "manual" as const }] } : s) }));
    setManualName("");
  }

  function removeAssignment(shiftId: string, oldName: string) { updateState((current) => ({ ...current, shifts: current.shifts.map((s) => s.id === shiftId ? { ...s, assignments: s.assignments.filter((a) => a.name !== oldName) } : s) })); }

  function saveEdit() {
    if (!edit || !edit.value.trim()) return;
    updateState((current) => ({ ...current, shifts: current.shifts.map((s) => s.id === edit.shiftId ? { ...s, assignments: s.assignments.map((a) => (a.name === edit.oldName ? { ...a, name: edit.value.trim() } : a)) } : s) }));
    setEdit(null);
  }

  function saveLifeguard() {
    const cleanName = guardForm.name.trim();
    const cleanGuardPin = cleanPin(guardForm.pin);
    if (!cleanName || cleanGuardPin.length !== 4) return;
    updateState((current) => {
      const guard: Lifeguard = { id: guardForm.id || `${cleanName.toLowerCase()}-${Date.now()}`, name: cleanName, pin: cleanGuardPin };
      const exists = current.lifeguards.some((g) => g.id === guard.id);
      return { ...current, lifeguards: exists ? current.lifeguards.map((g) => g.id === guard.id ? guard : g) : [...current.lifeguards, guard] };
    });
    setGuardForm({ id: "", name: "", pin: "" });
  }

  function deleteLifeguard(id: string) { updateState((current) => ({ ...current, lifeguards: current.lifeguards.filter((g) => g.id !== id) })); }

  function resetAll() {
    if (resetText !== "RESET SCHEDULE") return;
    const next = blankState();
    void persist({ ...next, lifeguards: state.lifeguards });
    setResetText("");
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

  async function exportPdf() {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 792, pageHeight = 612, margin = 32;
    const cols = { date: { x: margin, w: 145 }, am: { x: 182, w: 240 }, pm: { x: 432, w: 240 }, open: { x: 682, w: 78 } };
    const rowFontSize = 8, lineHeight = 10;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    function wrapText(text: string, maxWidth: number, size = rowFontSize) {
      const words = text.replace(/\s+/g, " ").trim().split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) current = test;
        else { if (current) lines.push(current); current = word; }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [""];
    }
    function drawTextLines(lines: string[], x: number, startY: number, size = rowFontSize) { lines.forEach((line, index) => page.drawText(line, { x, y: startY - index * lineHeight, size, font, color: rgb(0.03, 0.16, 0.22) })); }
    function drawCell(x: number, yBottom: number, width: number, height: number, fill = false) { page.drawRectangle({ x, y: yBottom, width, height, color: fill ? rgb(0.92, 0.96, 0.97) : undefined, borderColor: rgb(0, 0, 0), borderWidth: 0.45 }); }
    function drawPageHeader() {
      y = pageHeight - margin;
      page.drawText("Serenity Shores Pool Schedule", { x: margin, y, size: 18, font: bold, color: rgb(0.03, 0.16, 0.22) });
      y -= 18;
      page.drawText(`${longDate(reportStart)} through ${longDate(reportEnd)}`, { x: margin, y, size: 10, font, color: rgb(0.22, 0.34, 0.4) });
      y -= 18;
      const headerHeight = 18;
      drawCell(cols.date.x, y - headerHeight + 4, cols.date.w, headerHeight, true); drawCell(cols.am.x, y - headerHeight + 4, cols.am.w, headerHeight, true); drawCell(cols.pm.x, y - headerHeight + 4, cols.pm.w, headerHeight, true); drawCell(cols.open.x, y - headerHeight + 4, cols.open.w, headerHeight, true);
      page.drawText("Date", { x: cols.date.x + 5, y: y - 9, size: 8, font: bold, color: rgb(0, 0, 0) }); page.drawText("AM 10-3:30", { x: cols.am.x + 5, y: y - 9, size: 8, font: bold, color: rgb(0, 0, 0) }); page.drawText("PM 3:30-10", { x: cols.pm.x + 5, y: y - 9, size: 8, font: bold, color: rgb(0, 0, 0) }); page.drawText("Open", { x: cols.open.x + 5, y: y - 9, size: 8, font: bold, color: rgb(0, 0, 0) });
      y -= headerHeight;
    }
    drawPageHeader();
    reportRows.forEach((row, index) => {
      const dateLines = wrapText(row.date, cols.date.w - 10), amLines = wrapText(row.am || "OPEN - 3 needed", cols.am.w - 10), pmLines = wrapText(row.pm || "OPEN - 3 needed", cols.pm.w - 10);
      const height = Math.max(dateLines.length, amLines.length, pmLines.length, 1) * lineHeight + 10;
      if (y - height < margin) { page = pdf.addPage([pageWidth, pageHeight]); drawPageHeader(); }
      const yBottom = y - height + 4, fill = index % 2 === 0;
      drawCell(cols.date.x, yBottom, cols.date.w, height, fill); drawCell(cols.am.x, yBottom, cols.am.w, height, fill); drawCell(cols.pm.x, yBottom, cols.pm.w, height, fill); drawCell(cols.open.x, yBottom, cols.open.w, height, fill);
      drawTextLines(dateLines, cols.date.x + 5, y - 8); drawTextLines(amLines, cols.am.x + 5, y - 8); drawTextLines(pmLines, cols.pm.x + 5, y - 8);
      page.drawText(String(row.open), { x: cols.open.x + 5, y: y - 8, size: 9, font: bold, color: rgb(0.03, 0.16, 0.22) });
      y -= height;
    });
    const bytes = await pdf.save();
    const arrayBuffer = new ArrayBuffer(bytes.length);
    new Uint8Array(arrayBuffer).set(bytes);
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `serenity-shores-pool-schedule-${reportStart}-to-${reportEnd}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderShiftButton(shift: Shift) {
    const requested = myRequests.some((r) => r.shiftId === shift.id && r.status !== "rejected");
    const isSelected = selected.includes(shift.id);
    const isMine = requested || isSelected;
    if (filter === "open" && openCount(shift) <= 0) return null;
    if (filter === "mine" && !isMine) return null;
    return <button key={shift.id} className="shiftBtn" data-selected={isSelected} disabled={openCount(shift) <= 0 || requested} onClick={() => toggleShift(shift.id)}><span className="shiftTitle"><span>{shift.type === "AM" ? "Morning" : "Afternoon"}</span><span>{shift.start} - {shift.end}</span></span><span className="shiftMeta">{shift.assignments.length}/{shift.required} scheduled · {openCount(shift)} needed</span><span>{openCount(shift) > 0 ? <span className="badge badgeOpen">Open</span> : <span className="badge badgeFull">Full</span>} {requested ? <span className="badge badgePending">Requested</span> : null}</span></button>;
  }

  function findShift(date: string, type: ShiftType) { return state.shifts.find((s) => s.date === date && s.type === type); }

  function renderAdminShiftCell(date: string, type: ShiftType) {
    const shift = findShift(date, type);
    if (!shift) return <span className="small">No shift</span>;
    return <div className="adminShiftCell"><div className="cellTime">{shift.start} - {shift.end}</div><div className="nameWrap">{shift.assignments.length === 0 ? <span className="openText">OPEN</span> : null}{shift.assignments.map((a) => <button className="namePill" key={`${shift.id}-${a.name}`} onClick={() => setEdit({ shiftId: shift.id, oldName: a.name, value: a.name })}>{a.name}</button>)}</div><span className={openCount(shift) > 0 ? "badge badgeOpen" : "badge badgeFull"}>{openCount(shift) > 0 ? `${openCount(shift)} open` : "Full"}</span></div>;
  }

  return <main className="appShell">
    <div className="topStrip">Serenity Shores pool · Lifeguard schedule</div>
    <header className="header"><div className="brand"><div className="brandText">Lifeguard Schedule</div></div><button className="adminBtn" onClick={() => setView(adminAuthed ? "admin" : "adminPin")}>Admin</button></header>
    <section className="main"><p className="small" style={{ marginTop: 0 }}>{statusText}</p>
      {view === "entry" ? <div className="card hero stack"><span className="kicker">Lifeguard check-in</span><h1>Help fill the pool schedule.</h1><p className="lead">Enter your first name and your four digit PIN, then choose the morning or afternoon shifts you can cover. Hollie/admin approves the final schedule.</p><input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input" inputMode="numeric" placeholder="Four digit PIN" value={lifeguardPin} onChange={(e) => setLifeguardPin(cleanPin(e.target.value))} onKeyDown={(e) => e.key === "Enter" && submitName()} />{loginError ? <p className="small" style={{ color: "#b42318" }}>{loginError}</p> : null}<button className="primaryBtn" onClick={submitName}>See Open Shifts</button><p className="small">Lifeguards can request shifts from today through {niceDate(selectableEnd)}. New shifts unlock automatically each day. Morning is 10:00 AM-3:30 PM. Afternoon is 3:30 PM-10:00 PM.</p></div> : null}
      {view === "select" ? <div className="stack"><div className="card stack"><div className="row"><div><h2>Hi, {selectedName}</h2><p className="small">Select openings through {niceDate(selectableEnd)}. Later shifts unlock automatically each day.</p></div><button className="ghostBtn" onClick={() => setView("entry")}>Change</button></div><div className="tabs"><button className="tab" data-active={filter === "open"} onClick={() => setFilter("open")}>Open</button><button className="tab" data-active={filter === "all"} onClick={() => setFilter("all")}>All</button><button className="tab" data-active={filter === "mine"} onClick={() => setFilter("mine")}>Mine</button></div></div>{openShifts.map((shift, index, all) => { const prev = all[index - 1]; const showDate = !prev || prev.date !== shift.date; return <div key={shift.id} className={showDate ? "shiftCard" : ""} style={showDate ? undefined : { display: "contents" }}>{showDate ? <div className="dateLine">{niceDate(shift.date)}</div> : null}<div className="shiftGrid">{renderShiftButton(shift)}</div></div>; })}<div className="stickySubmit"><div className="stickySubmitInner"><button className="primaryBtn" disabled={selected.length === 0} onClick={submitRequests}>Submit {selected.length || ""} shift request{selected.length === 1 ? "" : "s"}</button><span className="small">Hollie/admin must approve before names appear on the final schedule.</span></div></div></div> : null}
      {view === "confirm" ? <div className="card hero stack"><span className="kicker">Submitted</span><h1>Thank you.</h1><p className="lead">Your available shifts were sent to admin for approval.</p><button className="primaryBtn" onClick={() => setView("entry")}>Done</button></div> : null}
      {view === "adminPin" ? <div className="card hero stack"><span className="kicker">Admin access</span><h1>Enter code.</h1><input className="input" inputMode="numeric" placeholder="Admin code" value={pin} onChange={(e) => setPin(e.target.value)} /><button className="primaryBtn" onClick={() => { if (pin === ADMIN_CODE) { setAdminAuthed(true); setView("admin"); } }}>Open Admin</button><button className="ghostBtn" onClick={() => setView("entry")}>Back</button></div> : null}
      {view === "admin" ? <div className="stack"><div className="card stack"><span className="kicker">Admin dashboard</span><h2>Schedule control</h2><div className="panelGrid"><div className="stat"><div className="statNum">{pendingRequests.length}</div><div className="statLabel">Pending</div></div><div className="stat"><div className="statNum">{state.lifeguards.length}</div><div className="statLabel">Lifeguards</div></div><div className="stat"><div className="statNum">{state.shifts.reduce((n, s) => n + openCount(s), 0)}</div><div className="statLabel">Open spots</div></div></div></div>
        <div className="card stack"><h3>Lifeguards and PINs</h3><p className="small">Add or edit each lifeguard here. Lifeguards must enter their first name and matching four digit PIN before requesting shifts.</p><input className="input" placeholder="Lifeguard first name" value={guardForm.name} onChange={(e) => setGuardForm({ ...guardForm, name: e.target.value })} /><input className="input" inputMode="numeric" placeholder="Four digit PIN" value={guardForm.pin} onChange={(e) => setGuardForm({ ...guardForm, pin: cleanPin(e.target.value) })} /><div className="actions"><button className="primaryBtn" onClick={saveLifeguard}>{guardForm.id ? "Save Lifeguard" : "Add Lifeguard"}</button>{guardForm.id ? <button className="ghostBtn" onClick={() => setGuardForm({ id: "", name: "", pin: "" })}>Cancel</button> : null}</div><table className="table"><thead><tr><th>Name</th><th>PIN</th><th>Action</th></tr></thead><tbody>{state.lifeguards.map((g) => <tr key={g.id}><td>{g.name}</td><td>{g.pin}</td><td><div className="actions"><button className="secondaryBtn" onClick={() => setGuardForm(g)}>Edit</button><button className="dangerBtn" onClick={() => deleteLifeguard(g.id)}>Delete</button></div></td></tr>)}</tbody></table></div>
        <div className="card stack"><div className="row"><div><h3>Current and next schedule</h3><p className="small">Tap a name to edit it.</p></div><div className="tabs"><button className="tab" data-active={scheduleWindow === "current"} onClick={() => setScheduleWindow("current")}>Current</button><button className="tab" data-active={scheduleWindow === "next"} onClick={() => setScheduleWindow("next")}>Next</button></div></div><table className="table scheduleTable"><thead><tr><th>Date</th><th>AM</th><th>PM</th></tr></thead><tbody>{adminRows.map((row) => <tr key={row.dateIso}><td>{row.date}</td><td>{renderAdminShiftCell(row.dateIso, "AM")}</td><td>{renderAdminShiftCell(row.dateIso, "PM")}</td></tr>)}</tbody></table></div>
        <div className="card stack"><h3>Pending requests</h3>{pendingRequests.length === 0 ? <p className="small">No pending requests.</p> : null}{pendingRequests.map((request) => { const shift = state.shifts.find((s) => s.id === request.shiftId); return <div className="shiftCard" key={request.id}><div className="dateLine">{request.name}</div><p className="small">{shift ? `${niceDate(shift.date)} · ${shift.type} · ${shift.start}-${shift.end}` : "Shift not found"}</p><div className="actions"><button className="primaryBtn" onClick={() => approveRequest(request)}>Approve</button><button className="dangerBtn" onClick={() => rejectRequest(request)}>Reject</button></div></div>; })}</div>
        <div className="card stack"><h3>Manual add</h3><input className="input" placeholder="Name to add" value={manualName} onChange={(e) => setManualName(e.target.value)} /><input className="input" type="date" value={adminDate} onChange={(e) => setAdminDate(e.target.value)} /><div className="actions"><button className="secondaryBtn" onClick={() => { const s = findShift(adminDate, "AM"); if (s) addManual(s.id); }}>Add to AM</button><button className="secondaryBtn" onClick={() => { const s = findShift(adminDate, "PM"); if (s) addManual(s.id); }}>Add to PM</button></div></div>
        <div className="card stack"><h3>Reports</h3><input className="input" type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} /><input className="input" type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} /><div className="actions"><button className="primaryBtn" onClick={() => void exportPdf()}>Download PDF</button><button className="secondaryBtn" onClick={exportReport}>Download CSV</button></div><table className="table"><thead><tr><th>Date</th><th>AM</th><th>PM</th><th>Open</th></tr></thead><tbody>{reportRows.slice(0, 14).map((r) => <tr key={r.dateIso}><td>{r.date}</td><td>{r.am}</td><td>{r.pm}</td><td>{r.open}</td></tr>)}</tbody></table></div>
        <div className="card stack"><h3>Reset schedule</h3><p className="small">Type RESET SCHEDULE exactly. This clears requests and assignments but keeps lifeguard names and PINs.</p><input className="input" placeholder="RESET SCHEDULE" value={resetText} onChange={(e) => setResetText(e.target.value)} /><button className="dangerBtn" disabled={resetText !== "RESET SCHEDULE"} onClick={resetAll}>Reset Schedule</button></div>
      </div> : null}
    </section>
    {edit ? <div className="modalBackdrop"><div className="modal stack"><h3>Edit scheduled name</h3><input className="input" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /><div className="actions"><button className="primaryBtn" onClick={saveEdit}>Save</button><button className="secondaryBtn" onClick={() => removeAssignment(edit.shiftId, edit.oldName)}>Remove</button><button className="ghostBtn" onClick={() => setEdit(null)}>Cancel</button></div></div></div> : null}
  </main>;
}
