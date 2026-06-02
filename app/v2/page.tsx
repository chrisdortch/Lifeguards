"use client";

import { useEffect, useMemo, useState } from "react";
import { AppState, Lifeguard, RequestItem, Shift, ShiftType, blankState, csvSafe, longDate, niceDate, openCount, todayIso } from "../../lib/schedule-v2";

type View = "entry" | "guard" | "adminPin" | "admin";
type AdminTab = "schedule" | "balance" | "guards" | "tools";
type GuardTab = "requests" | "calendar";

const ADMIN_CODE = "7900";
const PIN_DIGITS = 6;
const WEEK_DAYS = 8;
const STORAGE_KEY = "serenity-shores-lifeguard-v2-public";
const COLORS = [
  ["#e8f2ff", "#1f67b1"], ["#e7fff0", "#17824a"], ["#fff0e3", "#b35a20"], ["#f2e9ff", "#6e35b9"],
  ["#e6fbff", "#0b8798"], ["#fff0f6", "#ba2e73"], ["#f4ffd9", "#7c9b13"], ["#fff6d8", "#ad7b05"],
];

function cleanPin(v: string) { return v.replace(/\D/g, "").slice(0, PIN_DIGITS); }
function sameName(a: string, b: string) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
function addDays(iso: string, days: number) { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function startWednesday(iso: string) { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() - 3 + 7) % 7)); return d.toISOString().slice(0, 10); }
function weekDates(start: string) { return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(start, i)); }
function shiftOrder(t: ShiftType) { return t === "AM" ? 1 : t === "MID" ? 2 : 3; }
function shiftLabel(t: ShiftType) { return t === "AM" ? "AM" : t === "MID" ? "Midshift" : "PM"; }
function hashName(v: string) { let h = 0; for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0; return h; }
function guardStyle(name: string) { const c = COLORS[hashName(name.toLowerCase()) % COLORS.length]; return { background: c[0], borderColor: c[1] }; }
function guardList(s?: Shift) { const names = s?.assignments.map((a) => `${a.lead ? "★ " : ""}${a.name.trim()}`).filter(Boolean) || []; return names.length ? names.join(", ") : "OPEN"; }
function normalize(input?: Partial<AppState> | null): AppState {
  const base = blankState();
  const incoming = input || {};
  const map = new Map((Array.isArray(incoming.shifts) ? incoming.shifts : []).map((s) => [s.id, s]));
  const shifts = base.shifts.map((b) => {
    const x = map.get(b.id);
    return x ? { ...b, ...x, type: b.type, start: b.start, end: b.end, assignments: Array.isArray(x.assignments) ? x.assignments : [] } : b;
  });
  return { ...base, ...incoming, shifts, requests: Array.isArray(incoming.requests) ? incoming.requests : [], lifeguards: Array.isArray(incoming.lifeguards) ? incoming.lifeguards : [], settings: { ...base.settings, ...(incoming.settings || {}) }, updatedAt: incoming.updatedAt || new Date().toISOString() };
}
function download(name: string, text: string) { const b = new Blob([text], { type: "text/csv;charset=utf-8" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }

export default function V2Page() {
  const [state, setState] = useState<AppState>(() => blankState());
  const [sync, setSync] = useState("Loading V2 schedule...");
  const [view, setView] = useState<View>("entry");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [error, setError] = useState("");
  const [guardTab, setGuardTab] = useState<GuardTab>("requests");
  const [guardWeek, setGuardWeek] = useState<"current" | "next">("current");
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [selected, setSelected] = useState<string[]>([]);
  const [adminTab, setAdminTab] = useState<AdminTab>("schedule");
  const [weekStart, setWeekStart] = useState(() => startWednesday(todayIso()));
  const [manualName, setManualName] = useState("");
  const [guardForm, setGuardForm] = useState<{ id: string; name: string; pin: string }>({ id: "", name: "", pin: "" });
  const [resetText, setResetText] = useState("");
  const [notice, setNotice] = useState("");

  async function loadShared() {
    try {
      const r = await fetch("/api/v2-state", { cache: "no-store" });
      if (!r.ok) throw new Error("state");
      const d = await r.json();
      const next = normalize(d.state);
      setState(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSync(`V2 database connected · ${next.lifeguards.length} lifeguards loaded · V1 data remains separate`);
    } catch {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(normalize(JSON.parse(saved)));
      setSync("V2 offline fallback: browser storage only");
    }
  }
  async function persist(nextInput: AppState, replace = false, hardReplace = false) {
    const next = normalize({ ...nextInput, updatedAt: new Date().toISOString() });
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    try {
      const r = await fetch("/api/v2-state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: next, replace, hardReplace }) });
      const d = await r.json();
      if (d.ok) {
        const saved = normalize(d.state);
        setState(saved);
        setSync(`V2 database connected · ${saved.lifeguards.length} lifeguards loaded · V1 data remains separate`);
      }
    } catch { setSync("V2 offline fallback: browser storage only"); }
  }
  useEffect(() => { void loadShared(); }, []);
  function update(fn: (s: AppState) => AppState, replace = false, hardReplace = false) { void persist(fn(state), replace, hardReplace); }

  const today = todayIso();
  const currentWeek = startWednesday(today);
  const nextWeek = addDays(currentWeek, 7);
  const nextOpen = Boolean(state.settings?.nextWeekUnlocked);
  const guardStart = guardWeek === "next" ? nextWeek : currentWeek;
  const guardDates = weekDates(guardStart);
  const adminDates = weekDates(weekStart);
  const weekEnd = addDays(weekStart, WEEK_DAYS - 1);
  const selectedName = name.trim();
  const adminShifts = state.shifts.filter((s) => adminDates.includes(s.date)).sort((a, b) => a.date.localeCompare(b.date) || shiftOrder(a.type) - shiftOrder(b.type));
  const pending = state.requests.filter((r) => r.status === "pending");
  const allNames = useMemo(() => {
    const m = new Map<string, string>();
    const add = (v: string) => { const c = v.trim(); if (c && !m.has(c.toLowerCase())) m.set(c.toLowerCase(), c); };
    state.lifeguards.forEach((g) => add(g.name));
    state.requests.forEach((r) => add(r.name));
    state.shifts.forEach((s) => s.assignments.forEach((a) => add(a.name)));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [state]);
  const balanceRows = useMemo(() => {
    const approved = new Map<string, number>();
    const requested = new Map<string, number>();
    const display = new Map<string, string>();
    allNames.forEach((n) => display.set(n.toLowerCase(), n));
    const byId = new Map(state.shifts.map((s) => [s.id, s]));
    adminShifts.forEach((s) => s.assignments.forEach((a) => { const k = a.name.toLowerCase(); display.set(k, a.name); approved.set(k, (approved.get(k) || 0) + 1); }));
    state.requests.forEach((r) => { const s = byId.get(r.shiftId); if (!s || !adminDates.includes(s.date) || r.status === "rejected") return; const k = r.name.toLowerCase(); display.set(k, r.name); requested.set(k, (requested.get(k) || 0) + 1); });
    return [...display.entries()].map(([k, n]) => ({ name: n, approved: approved.get(k) || 0, requests: requested.get(k) || 0 })).sort((a, b) => b.approved - a.approved || b.requests - a.requests || a.name.localeCompare(b.name));
  }, [allNames, adminShifts, adminDates, state.requests, state.shifts]);
  const maxBal = Math.max(1, ...balanceRows.map((r) => Math.max(r.approved, r.requests)));

  function assigned(s: Shift, n: string) { return s.assignments.some((a) => sameName(a.name, n)); }
  function existingRequest(shiftId: string, n = selectedName) { return state.requests.find((r) => r.shiftId === shiftId && sameName(r.name, n) && r.status !== "rejected"); }
  function changeWeek(next: string, label: string) { setWeekStart(next); setNotice(`Showing ${label}: ${niceDate(next)} through ${niceDate(addDays(next, WEEK_DAYS - 1))}`); }
  function submitName() {
    const match = state.lifeguards.find((g) => sameName(g.name, selectedName) && g.pin === cleanPin(pin));
    if (!selectedName || cleanPin(pin).length !== PIN_DIGITS) return setError("Enter your first name and six digit PIN.");
    if (!match) return setError("That name and PIN do not match the lifeguard list.");
    setName(match.name); setPin(""); setError(""); setSelected([]); setView("guard");
  }
  function toggleSelect(s: Shift) {
    if (s.type === "MID" || assigned(s, selectedName)) return;
    const r = existingRequest(s.id);
    if (r?.status === "approved") return;
    if (r?.status === "pending") return removePending(r.id);
    setSelected((cur) => cur.includes(s.id) ? cur.filter((id) => id !== s.id) : [...cur, s.id]);
  }
  function submitRequests() {
    if (!selectedName || !selected.length) return;
    const now = new Date().toISOString();
    update((cur) => {
      const active = new Set(cur.requests.filter((r) => sameName(r.name, selectedName) && r.status !== "rejected").map((r) => r.shiftId));
      const add: RequestItem[] = selected.filter((id) => !active.has(id)).map((id) => ({ id: `${id}-${selectedName}-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: selectedName, shiftId: id, status: "pending", createdAt: now }));
      return { ...cur, requests: [...cur.requests, ...add] };
    });
    setSelected([]); setNotice("Request submitted. Admin can approve it from the schedule.");
  }
  function removePending(id: string) { update((cur) => ({ ...cur, requests: cur.requests.map((r) => r.id === id && r.status === "pending" ? { ...r, status: "rejected" } : r) })); }
  function approve(r: RequestItem) { update((cur) => ({ ...cur, requests: cur.requests.map((x) => x.id === r.id ? { ...x, status: "approved" } : x), shifts: cur.shifts.map((s) => s.id === r.shiftId && !assigned(s, r.name) ? { ...s, assignments: [...s.assignments, { name: r.name, source: "request" as const }] } : s) }), true); }
  function reject(r: RequestItem) { update((cur) => ({ ...cur, requests: cur.requests.map((x) => x.id === r.id ? { ...x, status: "rejected" } : x) }), true); }
  function addManual(id: string) { const clean = manualName.trim(); if (!clean) return; update((cur) => ({ ...cur, shifts: cur.shifts.map((s) => s.id === id && !assigned(s, clean) ? { ...s, assignments: [...s.assignments, { name: clean, source: "manual" as const }] } : s), requests: cur.requests.map((r) => r.shiftId === id && sameName(r.name, clean) ? { ...r, status: "approved" } : r) }), true); setNotice(`${clean} added manually.`); }
  function removeAssignment(id: string, n: string) { update((cur) => ({ ...cur, shifts: cur.shifts.map((s) => s.id === id ? { ...s, assignments: s.assignments.filter((a) => !sameName(a.name, n)) } : s), requests: cur.requests.map((r) => r.shiftId === id && sameName(r.name, n) ? { ...r, status: "rejected" } : r) }), true); }
  function toggleLead(id: string, n: string) { update((cur) => ({ ...cur, shifts: cur.shifts.map((s) => s.id !== id ? s : { ...s, assignments: s.assignments.map((a) => ({ ...a, lead: sameName(a.name, n) ? !a.lead : false })) }) }), true); }
  function saveGuard() { const clean = guardForm.name.trim(); const p = cleanPin(guardForm.pin); if (!clean || p.length !== PIN_DIGITS) return; update((cur) => { const id = guardForm.id || `${clean.toLowerCase()}-${Date.now()}`; const g: Lifeguard = { id, name: clean, pin: p }; return { ...cur, lifeguards: cur.lifeguards.some((x) => x.id === id) ? cur.lifeguards.map((x) => x.id === id ? g : x) : [...cur.lifeguards, g] }; }, true); setGuardForm({ id: "", name: "", pin: "" }); }
  function exportCsv() { const lines = [["Date", "Shift", "Time", "Assigned", "Lead", "Open Slots"].map(csvSafe).join(",")]; adminShifts.forEach((s) => lines.push([longDate(s.date), shiftLabel(s.type), `${s.start} - ${s.end}`, guardList(s), s.assignments.find((a) => a.lead)?.name || "", String(openCount(s))].map(csvSafe).join(","))); download(`lifeguard-v2-schedule-${weekStart}.csv`, lines.join("\n")); }
  function setNextOpen(v: boolean) { update((cur) => ({ ...cur, settings: { ...(cur.settings || {}), nextWeekUnlocked: v } }), true); setNotice(v ? "The following week is now visible to guards." : "The following week is now hidden from guards."); }
  function reset() { if (resetText !== "RESET") return; update((cur) => ({ ...blankState(), lifeguards: cur.lifeguards, settings: cur.settings }), true, true); setResetText(""); setNotice("V2 schedule reset. Lifeguard list kept."); }

  function chip(s: Shift, a: Shift["assignments"][number]) {
    const double = state.shifts.filter((x) => x.date === s.date).some((x) => x.id !== s.id && x.assignments.some((b) => sameName(b.name, a.name)));
    return <span key={a.name} className={`guardChip ${a.lead ? "leadChip" : ""} ${double ? "doubleChip" : ""}`} style={guardStyle(a.name)}><strong>{a.name}</strong>{a.source === "manual" ? <em>manual</em> : null}{a.lead ? <em className="leadBadge">Lead</em> : null}{double ? <em className="doubleFlag">Double</em> : null}<button className={a.lead ? "leadStarBtn active" : "leadStarBtn"} onClick={() => toggleLead(s.id, a.name)}>★</button><button className="chipAction remove" onClick={() => removeAssignment(s.id, a.name)}>×</button></span>;
  }
  function requestButton(s: Shift) {
    const r = existingRequest(s.id); const me = assigned(s, selectedName); const sel = selected.includes(s.id);
    return <button key={s.id} className="shiftBtn" data-selected={sel || r?.status === "pending"} disabled={me || r?.status === "approved"} onClick={() => toggleSelect(s)}><span className="shiftTitle"><span>{shiftLabel(s.type)} · {s.start}–{s.end}</span>{me || r?.status === "approved" ? <span className="badge badgeFull">Assigned</span> : r?.status === "pending" ? <span className="badge badgePending">Requested</span> : <span className="badge badgeOpen">{openCount(s)} open</span>}</span><span className="shiftMeta">{guardList(s)}{r?.status === "pending" ? " · tap again to remove pending request" : ""}</span></button>;
  }
  function adminCell(s: Shift) {
    const req = pending.filter((r) => r.shiftId === s.id);
    return <div className="adminShiftCell" key={s.id}><div className="row"><div><h3>{shiftLabel(s.type)}</h3><div className="cellTime">{s.start}–{s.end}</div></div>{s.type === "MID" ? <span className="badge badgePending">Manual</span> : <span className={openCount(s) > 0 ? "badge badgeOpen" : "badge badgeFull"}>{openCount(s) > 0 ? `${openCount(s)} open` : "Full"}</span>}</div><div className="nameWrap">{s.assignments.length ? s.assignments.map((a) => chip(s, a)) : <span className="openText">No one assigned.</span>}</div>{req.length ? <div className="alternateBox"><strong className="small">Pending requests</strong><div className="nameWrap">{req.map((r) => <span key={r.id} className="guardChip" style={guardStyle(r.name)}><strong>{r.name}</strong><button className="chipAction add" onClick={() => approve(r)}>+</button><button className="chipAction remove" onClick={() => reject(r)}>×</button></span>)}</div></div> : null}<button className="secondaryBtn noPrint" disabled={!manualName.trim()} onClick={() => addManual(s.id)}>Add {manualName.trim() || "name"}</button></div>;
  }

  return <main className="appShell"><div className="topStrip">Serenity Shores pool · V2 test · V1 fallback preserved</div><header className="header noPrint"><button className="brand" onClick={() => setView("entry")} style={{ border: 0, background: "transparent", cursor: "pointer" }}><div className="brandText">Lifeguard Schedule V2</div></button><button className="adminBtn" onClick={() => setView("adminPin")}>Admin</button></header><section className="main stack"><p className="small" style={{ marginTop: 0 }}>{sync}</p>{notice ? <p className="badge badgePending" style={{ justifyContent: "flex-start", whiteSpace: "normal" }}>{notice}</p> : null}
    {view === "entry" && <div className="card hero stack"><span className="kicker">V2 lifeguard check-in</span><h1>Help fill the pool schedule.</h1><p className="lead">Request shifts, remove pending requests before approval, and view the approved read-only calendar.</p><input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input" inputMode="numeric" placeholder="Six digit PIN" value={pin} onChange={(e) => setPin(cleanPin(e.target.value))} />{error ? <p className="badge badgeDanger">{error}</p> : null}<button className="primaryBtn" onClick={submitName}>See Schedule</button><button className="secondaryBtn" onClick={() => setView("adminPin")}>Admin setup / testing</button></div>}
    {view === "guard" && <div className="stack"><div className="card stack"><h2>Hi, {selectedName}</h2><div className="actions noPrint"><button className={guardTab === "requests" ? "primaryBtn" : "secondaryBtn"} onClick={() => setGuardTab("requests")}>Request Shifts</button><button className={guardTab === "calendar" ? "primaryBtn" : "secondaryBtn"} onClick={() => setGuardTab("calendar")}>Schedule Calendar</button><button className="secondaryBtn" onClick={() => setGuardWeek("current")}>Current week</button><button className="secondaryBtn" disabled={!nextOpen} onClick={() => setGuardWeek("next")}>Next week</button></div><p className="small">{niceDate(guardStart)} through {niceDate(addDays(guardStart, WEEK_DAYS - 1))}. {!nextOpen ? "The following week is hidden until admin approves it." : ""}</p></div>{guardTab === "requests" ? guardDates.map((d) => <div className="shiftCard" key={d}><div className="dateLine">{longDate(d)}</div><div className="shiftGrid">{state.shifts.filter((s) => s.date === d && s.type !== "MID").sort((a, b) => shiftOrder(a.type) - shiftOrder(b.type)).map(requestButton)}</div></div>) : <div className="card stack"><h2>Read-only schedule calendar</h2><div className="shiftGrid">{guardDates.map((d) => <button key={d} className="shiftBtn" data-selected={selectedDay === d} onClick={() => setSelectedDay(d)}><span className="shiftTitle"><span>{niceDate(d)}</span></span><span className="shiftMeta">Click to view workers</span></button>)}</div><h3>{longDate(selectedDay)}</h3>{state.shifts.filter((s) => s.date === selectedDay).sort((a, b) => shiftOrder(a.type) - shiftOrder(b.type)).map((s) => <div className="requestRow" key={s.id}><strong>{shiftLabel(s.type)} · {s.start}–{s.end}</strong><span>{s.assignments.length ? guardList(s) : s.type === "MID" ? "No midshift added" : "OPEN"}</span></div>)}</div>}{state.requests.filter((r) => sameName(r.name, selectedName) && r.status === "pending").map((r) => { const s = state.shifts.find((x) => x.id === r.shiftId); return <div className="requestRow" key={r.id}><strong>{s ? `${longDate(s.date)} · ${shiftLabel(s.type)}` : r.shiftId}</strong><button className="dangerBtn" onClick={() => removePending(r.id)}>Remove pending</button></div>; })}{selected.length ? <div className="stickySubmit noPrint"><div className="stickySubmitInner"><button className="primaryBtn" onClick={submitRequests}>Submit {selected.length} request{selected.length === 1 ? "" : "s"}</button><span className="small">Admin approval is required.</span></div></div> : null}</div>}
    {view === "adminPin" && <div className="card hero stack"><span className="kicker">Admin access</span><h1>Enter code.</h1><input className="input" inputMode="numeric" placeholder="Admin code" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} /><button className="primaryBtn" onClick={() => { if (adminPin === ADMIN_CODE) { setAdminPin(""); setView("admin"); setNotice("Admin opened. Week controls are active."); } }}>Open Admin</button><button className="ghostBtn" onClick={() => setView("entry")}>Back</button></div>}
    {view === "admin" && <div className="stack"><div className="card stack noPrint"><span className="kicker">Admin V2</span><h2>{niceDate(weekStart)} through {niceDate(weekEnd)}</h2><p className="small">{state.lifeguards.length} lifeguards loaded. Use the week buttons below; the visible schedule heading updates immediately.</p><div className="actions"><button className={adminTab === "schedule" ? "primaryBtn" : "secondaryBtn"} onClick={() => setAdminTab("schedule")}>Schedule</button><button className={adminTab === "balance" ? "primaryBtn" : "secondaryBtn"} onClick={() => setAdminTab("balance")}>Balance Graph</button><button className={adminTab === "guards" ? "primaryBtn" : "secondaryBtn"} onClick={() => setAdminTab("guards")}>Lifeguards</button><button className={adminTab === "tools" ? "primaryBtn" : "secondaryBtn"} onClick={() => setAdminTab("tools")}>Tools</button></div></div>{adminTab === "schedule" && <div className="stack"><div className="card stack noPrint"><div className="actions"><button className="secondaryBtn" onClick={() => changeWeek(addDays(weekStart, -7), "previous week")}>Previous week</button><button className="secondaryBtn" onClick={() => changeWeek(currentWeek, "current week")}>Current week</button><button className="secondaryBtn" onClick={() => changeWeek(addDays(weekStart, 7), "next week")}>Next week</button><button className={nextOpen ? "dangerBtn" : "primaryBtn"} onClick={() => setNextOpen(!nextOpen)}>{nextOpen ? "Hide following week from guards" : "Approve / show following week to guards"}</button><button className="secondaryBtn" onClick={() => window.print()}>Print week schedule</button><button className="secondaryBtn" onClick={exportCsv}>Download CSV</button></div><input className="input" placeholder="Manual add name, including midshift if needed" value={manualName} onChange={(e) => setManualName(e.target.value)} /></div><div className="card stack"><h2>Serenity Shores Lifeguard Schedule</h2><p>{longDate(weekStart)} through {longDate(weekEnd)}</p>{adminDates.map((d) => <div className="adminDay" key={d}><div className="dateLine">{longDate(d)}</div><div className="adminGrid">{state.shifts.filter((s) => s.date === d).sort((a, b) => shiftOrder(a.type) - shiftOrder(b.type)).map(adminCell)}</div></div>)}</div></div>}{adminTab === "balance" && <div className="card stack"><div className="row noPrint"><h2>Schedule Balance Graph</h2><button className="secondaryBtn" onClick={() => window.print()}>Print balance graph</button></div><p>{longDate(weekStart)} through {longDate(weekEnd)}</p><div className="balanceGraph">{balanceRows.map((r) => <div className="balanceGraphRow" key={r.name}><span className="guardChip balanceName" style={guardStyle(r.name)}><strong>{r.name}</strong></span><div className="balanceBars"><div className="barLine"><span className="barLabel">Assigned {r.approved}</span><span className="barTrack"><span className="barFill approvedFill" style={{ width: `${(r.approved / maxBal) * 100}%`, background: guardStyle(r.name).borderColor }} /></span></div><div className="barLine"><span className="barLabel">Requested {r.requests}</span><span className="barTrack"><span className="barFill requestFill" style={{ width: `${(r.requests / maxBal) * 100}%`, background: guardStyle(r.name).background, borderColor: guardStyle(r.name).borderColor }} /></span></div></div></div>)}</div></div>}{adminTab === "guards" && <div className="card stack"><h2>Lifeguards and PINs</h2><input className="input" placeholder="Lifeguard first name" value={guardForm.name} onChange={(e) => setGuardForm({ ...guardForm, name: e.target.value })} /><input className="input" inputMode="numeric" placeholder="Six digit PIN" value={guardForm.pin} onChange={(e) => setGuardForm({ ...guardForm, pin: cleanPin(e.target.value) })} /><button className="primaryBtn" onClick={saveGuard}>{guardForm.id ? "Save Lifeguard" : "Add Lifeguard"}</button><div className="nameWrap">{state.lifeguards.sort((a, b) => a.name.localeCompare(b.name)).map((g) => <span className="guardChip" style={guardStyle(g.name)} key={g.id}><strong>{g.name}</strong><em>{g.pin}</em><button className="miniBtn" onClick={() => setGuardForm(g)}>Edit</button><button className="miniBtn danger" onClick={() => update((cur) => ({ ...cur, lifeguards: cur.lifeguards.filter((x) => x.id !== g.id) }), true)}>Delete</button></span>)}</div></div>}{adminTab === "tools" && <div className="card stack dangerZone"><h2>Protected reset</h2><p className="small">This clears V2 requests and assignments but keeps V2 lifeguard names/PINs. It does not touch V1 data. Type RESET.</p><input className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="Type RESET" /><button className="dangerBtn" disabled={resetText !== "RESET"} onClick={reset}>Reset V2 schedule</button></div>}</div>}
  </section></main>;
}
