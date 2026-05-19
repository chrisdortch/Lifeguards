"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  RequestItem,
  Shift,
  ShiftType,
  addDaysIso,
  blankState,
  csvSafe,
  longDate,
  niceDate,
  openCount,
  sameDayDouble,
  todayIso,
} from "../lib/schedule";

type View = "entry" | "select" | "confirm" | "adminPin" | "admin";
type ReportRow = { dateIso: string; date: string; am: string; pm: string; open: number };

const ADMIN_CODE = "7900";
const STORAGE_KEY = "serenity-shores-lifeguard-scheduler-v2";

function startOfWeekIso(offsetDays = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
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
  const suffix = needed > 0 ? ` - ${needed} needed` : " - Full";
  return `${guardList(shift)}${suffix}`;
}

function rowsBetween(shifts: Shift[], start: string, end: string): ReportRow[] {
  const byDate = new Map<string, ReportRow>();
  shifts
    .filter((s) => s.date >= start && s.date <= end)
    .forEach((s) => {
      const existing = byDate.get(s.date) || {
        dateIso: s.date,
        date: longDate(s.date),
        am: "",
        pm: "",
        open: 0,
      };
      if (s.type === "AM") existing.am = shiftText(s);
      if (s.type === "PM") existing.pm = shiftText(s);
      existing.open += openCount(s);
      byDate.set(s.date, existing);
    });
  return Array.from(byDate.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => blankState());
  const [hydrated, setHydrated] = useState(false);
  const [shared, setShared] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading schedule...");
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
  const [edit, setEdit] = useState<{ shiftId: string; oldName: string; value: string } | null>(null);
  const [resetText, setResetText] = useState("");
  const [scheduleWindow, setScheduleWindow] = useState<"current" | "next">("current");

  async function loadShared() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Shared state unavailable");
      const data = await res.json();
      setState(data.state as AppState);
      setShared(Boolean(data.shared));
      setSyncStatus(data.shared ? "Shared database connected" : "Testing mode: browser storage only");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
    } catch {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved) as AppState);
      setSyncStatus("Offline fallback: browser storage only");
    } finally {
      setHydrated(true);
    }
  }

  async function persist(next: AppState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setShared(Boolean(data.shared));
        setSyncStatus(data.shared ? "Saved to shared database" : "Saved in testing mode");
        setState(data.state as AppState);
      }
    } catch {
      setSyncStatus("Saved locally; shared database unavailable");
    }
  }

  useEffect(() => {
    void loadShared();
  }, []);

  function updateState(mutator: (draft: AppState) => AppState) {
    void persist({ ...mutator(state), updatedAt: new Date().toISOString() });
  }

  const byDate = useMemo(() => {
    const grouped = new Map<string, Shift[]>();
    state.shifts.forEach((shift) => {
      if (!grouped.has(shift.date)) grouped.set(shift.date, []);
      grouped.get(shift.date)?.push(shift);
    });
    return grouped;
  }, [state.shifts]);

  const selectedName = name.trim();
  const myRequests = state.requests.filter((r) => r.name.toLowerCase() === selectedName.toLowerCase());
  const pendingRequests = state.requests.filter((r) => r.status === "pending");
  const openShifts = state.shifts.filter((s) => openCount(s) > 0);
  const totalOpen = state.shifts.reduce((sum, s) => sum + openCount(s), 0);
  const filledSlots = state.shifts.reduce((sum, s) => sum + s.assignments.length, 0);
  const visibleDates = useMemo(() => Array.from(byDate.keys()).slice(0, 45), [byDate]);
  const windowStart = scheduleWindow === "current" ? startOfWeekIso(0) : startOfWeekIso(7);
  const windowEnd = endFromStart(windowStart, 6);
  const windowDates = useMemo(
    () => Array.from(byDate.keys()).filter((date) => date >= windowStart && date <= windowEnd),
    [byDate, windowStart, windowEnd]
  );
  const statusText = `${hydrated ? syncStatus : "Loading schedule..."} · ${shared ? "shared" : "local"}`;

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
        .map((shiftId) => ({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: selectedName,
          shiftId,
          status: "pending",
          createdAt: new Date().toISOString(),
        }));
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
      const canAssign =
        openCount(shift) > 0 &&
        !shift.assignments.some((a) => a.name.toLowerCase() === req.name.toLowerCase()) &&
        !sameDayDouble(current.shifts, shift, req.name);
      return {
        ...current,
        shifts: current.shifts.map((s) =>
          s.id === req.shiftId && canAssign
            ? { ...s, assignments: [...s.assignments, { name: req.name, source: "request" }] }
            : s
        ),
        requests: current.requests.map((r) =>
          r.id === req.id ? { ...r, status: canAssign ? "approved" : "rejected" } : r
        ),
      };
    });
  }

  function rejectRequest(id: string) {
    updateState((current) => ({
      ...current,
      requests: current.requests.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)),
    }));
  }

  function addManual(shiftId: string) {
    const clean = manualName.trim();
    if (!clean) return;
    updateState((current) => ({
      ...current,
      shifts: current.shifts.map((s) =>
        s.id === shiftId && openCount(s) > 0 && !s.assignments.some((a) => a.name.toLowerCase() === clean.toLowerCase())
          ? { ...s, assignments: [...s.assignments, { name: clean, source: "admin" }] }
          : s
      ),
    }));
    setManualName("");
  }

  function removeAssignment(shiftId: string, guardName: string) {
    updateState((current) => ({
      ...current,
      shifts: current.shifts.map((s) =>
        s.id === shiftId ? { ...s, assignments: s.assignments.filter((a) => a.name !== guardName) } : s
      ),
    }));
  }

  function saveEditedName() {
    if (!edit || !edit.value.trim()) return;
    updateState((current) => ({
      ...current,
      shifts: current.shifts.map((s) =>
        s.id === edit.shiftId
          ? { ...s, assignments: s.assignments.map((a) => (a.name === edit.oldName ? { ...a, name: edit.value.trim() } : a)) }
          : s
      ),
    }));
    setEdit(null);
  }

  function resetAll() {
    if (resetText !== "RESET SCHEDULE") return;
    void persist(blankState());
    setResetText("");
  }

  function exportReport() {
    const rows = rowsBetween(state.shifts, reportStart, reportEnd);
    const csv = [
      "Serenity Shores Pool Schedule",
      `${longDate(reportStart)} through ${longDate(reportEnd)}`,
      "",
      "Date,AM 10-3:30,PM 3:30-10,Open Spots",
      ...rows.map((r) => [r.date, r.am, r.pm, String(r.open)].map(csvSafe).join(",")),
    ].join("\n");
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
    const pageWidth = 792;
    const pageHeight = 612;
    const margin = 32;
    const cols = {
      date: { x: margin, w: 145 },
      am: { x: 182, w: 240 },
      pm: { x: 432, w: 240 },
      open: { x: 682, w: 78 },
    };
    const rowFontSize = 8;
    const lineHeight = 10;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    function wrapText(text: string, maxWidth: number, size = rowFontSize) {
      const words = text.replace(/\s+/g, " ").trim().split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [""];
    }

    function drawTextLines(lines: string[], x: number, startY: number, size = rowFontSize) {
      lines.forEach((line, index) => {
        page.drawText(line, {
          x,
          y: startY - index * lineHeight,
          size,
          font,
          color: rgb(0.03, 0.16, 0.22),
        });
      });
    }

    function drawCell(x: number, yBottom: number, width: number, height: number, fill = false) {
      page.drawRectangle({
        x,
        y: yBottom,
        width,
        height,
        color: fill ? rgb(0.92, 0.96, 0.97) : undefined,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.45,
      });
    }

    function drawPageHeader() {
      y = pageHeight - margin;
      page.drawText("Serenity Shores Pool Schedule", {
        x: margin,
        y,
        size: 18,
        font: bold,
        color: rgb(0.03, 0.16, 0.22),
      });
      y -= 18;
      page.drawText(`${longDate(reportStart)} through ${longDate(reportEnd)}`, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.16, 0.31, 0.38),
      });
      y -= 24;
      const headerHeight = 20;
      const yBottom = y - headerHeight;
      drawCell(cols.date.x, yBottom, cols.date.w, headerHeight, true);
      drawCell(cols.am.x, yBottom, cols.am.w, headerHeight, true);
      drawCell(cols.pm.x, yBottom, cols.pm.w, headerHeight, true);
      drawCell(cols.open.x, yBottom, cols.open.w, headerHeight, true);
      page.drawText("Date", { x: cols.date.x + 5, y: yBottom + 7, size: 8, font: bold });
      page.drawText("AM Shift: 10:00 AM - 3:30 PM", { x: cols.am.x + 5, y: yBottom + 7, size: 8, font: bold });
      page.drawText("PM Shift: 3:30 PM - 10:00 PM", { x: cols.pm.x + 5, y: yBottom + 7, size: 8, font: bold });
      page.drawText("Open", { x: cols.open.x + 5, y: yBottom + 7, size: 8, font: bold });
      y = yBottom;
    }

    const rows = rowsBetween(state.shifts, reportStart, reportEnd);
    drawPageHeader();

    for (const row of rows) {
      const dateLines = wrapText(row.date, cols.date.w - 10);
      const amLines = wrapText(row.am || "OPEN - 3 needed", cols.am.w - 10);
      const pmLines = wrapText(row.pm || "OPEN - 3 needed", cols.pm.w - 10);
      const openLines = wrapText(String(row.open), cols.open.w - 10);
      const maxLines = Math.max(dateLines.length, amLines.length, pmLines.length, openLines.length);
      const rowHeight = Math.max(34, 14 + maxLines * lineHeight);

      if (y - rowHeight < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        drawPageHeader();
      }

      const yBottom = y - rowHeight;
      drawCell(cols.date.x, yBottom, cols.date.w, rowHeight);
      drawCell(cols.am.x, yBottom, cols.am.w, rowHeight);
      drawCell(cols.pm.x, yBottom, cols.pm.w, rowHeight);
      drawCell(cols.open.x, yBottom, cols.open.w, rowHeight);
      const textY = yBottom + rowHeight - 14;
      drawTextLines(dateLines, cols.date.x + 5, textY);
      drawTextLines(amLines, cols.am.x + 5, textY);
      drawTextLines(pmLines, cols.pm.x + 5, textY);
      drawTextLines(openLines, cols.open.x + 5, textY);
      y = yBottom;
    }

    page.drawText(`Generated ${new Date().toLocaleString()}`, {
      x: margin,
      y: 16,
      size: 7,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });

    const bytes = await pdf.save();
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
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
    return (
      <button
        key={shift.id}
        className="shiftBtn"
        data-selected={isSelected}
        disabled={openCount(shift) <= 0 || requested}
        onClick={() => toggleShift(shift.id)}
      >
        <span className="shiftTitle">
          <span>{shift.type === "AM" ? "Morning" : "Afternoon"}</span>
          <span>
            {shift.start} - {shift.end}
          </span>
        </span>
        <span className="shiftMeta">
          {shift.assignments.length}/{shift.required} scheduled · {openCount(shift)} needed
        </span>
        <span>
          {openCount(shift) > 0 ? <span className="badge badgeOpen">Open</span> : <span className="badge badgeFull">Full</span>} {requested ? <span className="badge badgePending">Requested</span> : null}
        </span>
      </button>
    );
  }

  function findShift(date: string, type: ShiftType) {
    return state.shifts.find((s) => s.date === date && s.type === type);
  }

  function renderAdminShiftCell(date: string, type: ShiftType) {
    const shift = findShift(date, type);
    if (!shift) return <span className="small">No shift</span>;
    return (
      <div className="adminShiftCell">
        <div className="cellTime">
          {shift.start} - {shift.end}
        </div>
        <div className="nameWrap">
          {shift.assignments.length === 0 ? <span className="openText">OPEN</span> : null}
          {shift.assignments.map((a) => (
            <button
              className="namePill"
              key={`${shift.id}-${a.name}`}
              onClick={() => setEdit({ shiftId: shift.id, oldName: a.name, value: a.name })}
            >
              {a.name}
            </button>
          ))}
        </div>
        <span className={openCount(shift) > 0 ? "badge badgeOpen" : "badge badgeFull"}>
          {openCount(shift) > 0 ? `${openCount(shift)} open` : "Full"}
        </span>
      </div>
    );
  }

  return (
    <main className="appShell">
      <div className="topStrip">Serenity Shores pool · Lifeguard schedule</div>
      <header className="header">
        <div className="brand">
          <img className="brandLogo" src="/serenity-shores-logo.svg" alt="Serenity Shores Table Rock Lake" decoding="async" />
        </div>
        <button className="adminBtn" onClick={() => setView(adminAuthed ? "admin" : "adminPin")}>Admin</button>
      </header>
      <section className="main">
        <p className="small" style={{ marginTop: 0 }}>{statusText}</p>

        {view === "entry" ? (
          <div className="card hero stack">
            <span className="kicker">Lifeguard check-in</span>
            <h1>Help fill the pool schedule.</h1>
            <p className="lead">Enter your first name, choose the morning or afternoon shifts you can cover, then submit. Hollie/admin approves the final schedule.</p>
            <input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitName()} />
            <button className="primaryBtn" onClick={submitName}>See Open Shifts</button>
            <p className="small">Shifts run from now through Oct. 10, 2026. Morning is 10:00 AM-3:30 PM. Afternoon is 3:30 PM-10:00 PM.</p>
          </div>
        ) : null}

        {view === "select" ? (
          <div className="stack">
            <div className="card stack">
              <div className="row">
                <div>
                  <h2>Hi, {selectedName}</h2>
                  <p className="small">Select openings you are available to cover.</p>
                </div>
                <button className="ghostBtn" onClick={() => setView("entry")}>Change</button>
              </div>
              <div className="panelGrid">
                <div className="stat"><div className="statNum">{totalOpen}</div><div className="statLabel">Open spots</div></div>
                <div className="stat"><div className="statNum">{selected.length}</div><div className="statLabel">Selected</div></div>
              </div>
              <div className="tabs">
                <button className="tab" data-active={filter === "open"} onClick={() => setFilter("open")}>Open only</button>
                <button className="tab" data-active={filter === "all"} onClick={() => setFilter("all")}>All shifts</button>
                <button className="tab" data-active={filter === "mine"} onClick={() => setFilter("mine")}>Mine</button>
              </div>
            </div>
            {visibleDates.map((date) => (
              <div className="shiftCard" key={date}>
                <div className="dateLine">{niceDate(date)}</div>
                <div className="shiftGrid">{(byDate.get(date) || []).map(renderShiftButton)}</div>
              </div>
            ))}
            <div className="stickySubmit">
              <div className="stickySubmitInner">
                <button className="primaryBtn" disabled={selected.length === 0} onClick={submitRequests}>Submit {selected.length || ""} Shift Request{selected.length === 1 ? "" : "s"}</button>
                <span className="small">Requests wait for admin approval before becoming final.</span>
              </div>
            </div>
          </div>
        ) : null}

        {view === "confirm" ? (
          <div className="card hero stack">
            <span className="kicker">Submitted</span>
            <h1>Thank you.</h1>
            <p className="lead">Your shift request was sent to the admin queue. The official schedule only changes after admin approval.</p>
            <button className="primaryBtn" onClick={() => setView("select")}>Choose More Shifts</button>
          </div>
        ) : null}

        {view === "adminPin" ? (
          <div className="card hero stack">
            <span className="kicker">Admin access</span>
            <h1>Enter the code.</h1>
            <input className="input" inputMode="numeric" placeholder="Admin code" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adminLogin()} />
            <button className="primaryBtn" onClick={adminLogin}>Open Admin</button>
            <p className="small">Admin controls approvals, final schedule edits, reset, and PDF reports.</p>
          </div>
        ) : null}

        {view === "admin" ? (
          <div className="stack">
            <div className="card stack">
              <span className="kicker">Admin dashboard</span>
              <h2>Coverage control center</h2>
              <div className="panelGrid">
                <div className="stat"><div className="statNum">{pendingRequests.length}</div><div className="statLabel">Pending</div></div>
                <div className="stat"><div className="statNum">{totalOpen}</div><div className="statLabel">Open spots</div></div>
                <div className="stat"><div className="statNum">{filledSlots}</div><div className="statLabel">Scheduled</div></div>
                <div className="stat"><div className="statNum">{openShifts.length}</div><div className="statLabel">Shifts with gaps</div></div>
              </div>
            </div>

            <div className="card stack">
              <div className="row">
                <div>
                  <h3>Current and next schedule</h3>
                  <p className="small">Tap any scheduled name to edit or remove it.</p>
                </div>
                <div className="tabs">
                  <button className="tab" data-active={scheduleWindow === "current"} onClick={() => setScheduleWindow("current")}>Current</button>
                  <button className="tab" data-active={scheduleWindow === "next"} onClick={() => setScheduleWindow("next")}>Next</button>
                </div>
              </div>
              <table className="table scheduleTable">
                <thead><tr><th>Date</th><th>AM</th><th>PM</th></tr></thead>
                <tbody>
                  {windowDates.map((date) => (
                    <tr key={date}>
                      <td>{longDate(date)}</td>
                      <td>{renderAdminShiftCell(date, "AM")}</td>
                      <td>{renderAdminShiftCell(date, "PM")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card stack">
              <h3>Pending requests</h3>
              {pendingRequests.length === 0 ? <p className="small">No pending requests right now.</p> : null}
              {pendingRequests.map((r) => {
                const s = state.shifts.find((x) => x.id === r.shiftId);
                return (
                  <div className="shiftCard" key={r.id}>
                    <div className="row">
                      <div><strong>{r.name}</strong><div className="small">{s ? `${longDate(s.date)} · ${s.type} · ${s.start}-${s.end}` : r.shiftId}</div></div>
                      <span className="badge badgePending">Pending</span>
                    </div>
                    <div className="actions"><button className="secondaryBtn" onClick={() => approveRequest(r)}>Approve</button><button className="dangerBtn" onClick={() => rejectRequest(r.id)}>Reject</button></div>
                  </div>
                );
              })}
            </div>

            <div className="card stack">
              <h3>Schedule editor</h3>
              <label className="small">Date</label>
              <input className="input" type="date" value={adminDate} onChange={(e) => setAdminDate(e.target.value)} />
              <label className="small">Add lifeguard manually</label>
              <input className="input" placeholder="Name to add" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              {(byDate.get(adminDate) || []).map((s) => (
                <div className="shiftCard" key={s.id}>
                  <div className="row">
                    <div><strong>{s.type} · {s.start}-{s.end}</strong><div className="small">{openCount(s)} open spot{openCount(s) === 1 ? "" : "s"}</div></div>
                    {openCount(s) > 0 ? <span className="badge badgeOpen">Needs help</span> : <span className="badge badgeFull">Full</span>}
                  </div>
                  <div className="nameWrap">{s.assignments.map((a) => <button className="namePill" key={`${s.id}-${a.name}`} onClick={() => setEdit({ shiftId: s.id, oldName: a.name, value: a.name })}>{a.name}</button>)}</div>
                  <button className="secondaryBtn" disabled={!manualName.trim() || openCount(s) <= 0} onClick={() => addManual(s.id)}>Add to this shift</button>
                </div>
              ))}
            </div>

            <div className="card stack">
              <h3>Report export</h3>
              <div className="shiftGrid">
                <div><label className="small">Start date</label><input className="input" type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} /></div>
                <div><label className="small">End date</label><input className="input" type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} /></div>
              </div>
              <div className="actions"><button className="primaryBtn" onClick={exportPdf}>Download PDF Report</button><button className="secondaryBtn" onClick={exportReport}>Download CSV Backup</button></div>
            </div>

            <div className="card stack">
              <h3>Danger zone</h3>
              <p className="small">To reset all requests and schedule assignments, type RESET SCHEDULE exactly.</p>
              <input className="input" placeholder="RESET SCHEDULE" value={resetText} onChange={(e) => setResetText(e.target.value)} />
              <button className="dangerBtn" disabled={resetText !== "RESET SCHEDULE"} onClick={resetAll}>Reset Everything</button>
            </div>
          </div>
        ) : null}

        {edit ? (
          <div className="modalBackdrop">
            <div className="modal stack">
              <h3>Edit scheduled lifeguard</h3>
              <p className="small">Change or remove this name from the selected shift.</p>
              <input className="input" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
              <div className="actions"><button className="primaryBtn" onClick={saveEditedName}>Save Name</button><button className="dangerBtn" onClick={() => { removeAssignment(edit.shiftId, edit.oldName); setEdit(null); }}>Remove</button><button className="secondaryBtn" onClick={() => setEdit(null)}>Cancel</button></div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
