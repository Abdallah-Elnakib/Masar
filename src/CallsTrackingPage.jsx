import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Check, CheckCircle2, CircleAlert, FileSpreadsheet, Search, Target, Trash2, Users, X } from "lucide-react";
import "./calls-tracking.css";

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dateFor(month, day) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function entryValue(employee, day) {
  return employee.days[dateFor(employee.month, day)] || { calls: "", missedCalls: "", status: null };
}

function employeeStats(employee, target, days) {
  const entries = days.map((day) => entryValue(employee, day));
  const workDays = entries.filter((entry) => Number(entry.calls) > 0).length;
  const total = entries.reduce((sum, entry) => sum + (Number(entry.calls) || 0), 0);
  const totalMissed = entries.reduce((sum, entry) => sum + (Number(entry.missedCalls) || 0), 0);
  const targetEnabled = Boolean(target?.enabled && Number(target.target) > 0);
  const achieved = targetEnabled ? entries.filter((entry) => Number(entry.calls) > 0 && Number(entry.calls) >= Number(target.target)).length : null;
  return { total, totalMissed, workDays, achieved, missed: targetEnabled ? workDays - achieved : null };
}

function earnedWeight(stats, target) {
  if (!target?.enabled || Number(target.target) <= 0 || Number(target.weight) <= 0) return null;
  return stats.workDays ? Number(target.weight) * (stats.achieved / stats.workDays) : 0;
}

function DayCell({ employee, day, target, onSave, saving, canEdit }) {
  const entry = entryValue(employee, day);
  const [calls, setCalls] = useState(entry.status ? "" : String(entry.calls || ""));
  const [status, setStatus] = useState(entry.status || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCalls(entry.status ? "" : String(entry.calls || ""));
    setStatus(entry.status || "");
  }, [entry.calls, entry.status]);

  async function save() {
    const normalizedCalls = status ? 0 : Math.max(0, Number.parseInt(calls, 10) || 0);
    if (normalizedCalls === Number(entry.calls || 0) && (status || null) === (entry.status || null)) { setOpen(false); return; }
    if (await onSave(employee.id, dateFor(employee.month, day), normalizedCalls, status || null)) setOpen(false);
  }

  const label = entry.status === "leave" ? "LV" : entry.status === "outage" ? "SO" : entry.calls || "-";
  const targetState = !entry.status && Number(entry.calls) > 0 && target?.enabled && Number(target.target) > 0
    ? (Number(entry.calls) >= Number(target.target) ? "is-met" : "is-missed")
    : "";
  return <div className={`calls-day-cell ${entry.status ? `is-${entry.status}` : ""} ${targetState} ${open ? "is-open" : ""}`}>
    <button className="calls-day-trigger" type="button" disabled={!canEdit} aria-label={`${employee.fullName}, day ${day}: ${entry.status || `${entry.calls || 0} calls`}`} title={`${dateFor(employee.month, day)}${entry.status ? ` · ${entry.status === "leave" ? "Leave" : "System outage"}` : ` · ${entry.calls || 0} calls`}`} onClick={() => setOpen((value) => !value)}>{label}</button>
    {open && canEdit && <div className="calls-day-editor"><strong>{dateFor(employee.month, day)}</strong><input aria-label={`${employee.fullName}, day ${day} calls`} type="number" min="0" step="1" value={calls} disabled={Boolean(status) || saving} placeholder="Calls" onChange={(event) => setCalls(event.target.value)} /><select aria-label={`${employee.fullName}, day ${day} status`} value={status} disabled={saving} onChange={(event) => setStatus(event.target.value)}><option value="">Calls</option><option value="leave">Leave</option><option value="outage">System outage</option></select><div><button type="button" title="Save day" aria-label="Save day" disabled={saving} onClick={() => void save()}><Check size={13} /></button><button type="button" title="Cancel" aria-label="Cancel" onClick={() => setOpen(false)}><X size={13} /></button></div></div>}
  </div>;
}

function matchesEmployee(employee, team, days, query, typeFilter, targetFilter, activityFilter) {
  const matchesQuery = !query || [employee.fullName, employee.code3cx, employee.awfarCode].some((value) => String(value || "").toLocaleLowerCase().includes(query));
  const matchesType = typeFilter === "all" || employee.employeeType === typeFilter;
  const target = team.targets[employee.employeeType];
  const targetEnabled = Boolean(target?.enabled && Number(target.target) > 0);
  const matchesTarget = targetFilter === "all" || (targetFilter === "enabled" ? targetEnabled : !targetEnabled);
  const entries = days.map((day) => entryValue(employee, day));
  const matchesActivity = activityFilter === "all"
    || (activityFilter === "has-calls" && entries.some((entry) => Number(entry.calls) > 0))
    || (activityFilter === "no-calls" && entries.every((entry) => Number(entry.calls) <= 0))
    || (activityFilter === "leave" && entries.some((entry) => entry.status === "leave"))
    || (activityFilter === "outage" && entries.some((entry) => entry.status === "outage"));
  return matchesQuery && matchesType && matchesTarget && matchesActivity;
}

function TeamCallsTable({ team, days, employees, saving, deletingScope, deletingTeamId, selectedDeleteDate, canEdit, onSave, onDelete }) {

  return <section className="calls-team-section">
    <header className="calls-team-heading"><div><span className="calls-team-mark"><Users size={16} /></span><div><span className="calls-team-kicker">TEAM TRACKING</span><h3>{team.name}</h3><small>{employees.length} visible employees · Daily calls target: {team.targets.Agent?.enabled ? team.targets.Agent.target : "Off"}</small></div></div><div className="calls-team-tools"><div className="calls-target-chips"><span>Agent {team.targets.Agent?.enabled ? `${team.targets.Agent.target} calls · ${team.targets.Agent.weight}%` : "Off"}</span><span>Senior {team.targets.Senior?.enabled ? `${team.targets.Senior.target} calls · ${team.targets.Senior.weight}%` : "Off"}</span></div>{canEdit && <div className="calls-team-delete-actions"><button type="button" title={`Delete ${selectedDeleteDate} for ${team.name}`} onClick={() => void onDelete(team.id, "day")} disabled={Boolean(deletingScope)}><Trash2 size={13} />Delete day</button><button type="button" title={`Delete ${monthLabel(team.month)} for ${team.name}`} onClick={() => void onDelete(team.id, "month")} disabled={Boolean(deletingScope)}><CalendarDays size={13} />Delete month</button></div>}</div></header>
    <div className="calls-table-wrap"><table className="calls-table"><colgroup><col className="calls-employee-col" /><col className="calls-code-col" /><col className="calls-code-col" />{days.map((day) => <col key={day} className="calls-day-col" style={{ width: `${42 / days.length}%` }} />)}<col className="calls-stat-col" /><col className="calls-stat-col" /><col className="calls-stat-col" /><col className="calls-stat-col" /><col className="calls-stat-col" /><col className="calls-weight-col" /></colgroup><thead><tr><th>Employee</th><th>3CX</th><th>Awfar</th>{days.map((day) => <th key={day} title={dateFor(team.month, day)}>{day}</th>)}<th>Total calls</th><th>Unanswered</th><th>Work days</th><th>Target met</th><th>Target missed</th><th>Weight (%)</th></tr></thead><tbody>{employees.map((employee) => { const target = team.targets[employee.employeeType]; const stats = employeeStats(employee, target, days); const weight = earnedWeight(stats, target); return <tr key={employee.id}><td><div className="calls-employee"><span>{initials(employee.fullName)}</span><div><strong>{employee.fullName}</strong><small>{employee.employeeType}</small></div></div></td><td>{employee.code3cx || "-"}</td><td>{employee.awfarCode || "-"}</td>{days.map((day) => <td className="calls-day-td" key={day}><DayCell employee={employee} day={day} target={target} onSave={onSave} saving={saving} canEdit={canEdit} /></td>)}<td className="calls-total">{stats.total.toLocaleString()}</td><td className="calls-total" style={{ color: "#d97706" }}>{stats.totalMissed.toLocaleString()}</td><td>{stats.workDays}</td><td>{stats.achieved === null ? <span className="calls-off">Off</span> : stats.achieved}</td><td>{stats.missed === null ? <span className="calls-off">Off</span> : stats.missed}</td><td>{weight === null ? <span className="calls-off">Off</span> : `${Number(weight.toFixed(2))}%`}</td></tr>; })}{!employees.length && <tr><td colSpan={days.length + 9} className="calls-empty-row">No employees match the selected filters.</td></tr>}</tbody></table></div>
  </section>;
}

export default function CallsTrackingPage({ canEdit = true, user }) {
  const [month, setMonth] = useState(currentMonth());
  const [teams, setTeams] = useState([]);
  const [teamFilter, setTeamFilter] = useState("all");
  
  // Manager cannot edit
  const canEditCalls = canEdit && user?.role !== "Manager";
  const [deleteTeamId, setDeleteTeamId] = useState("all");
  const [deleteDate, setDeleteDate] = useState(currentDate());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingScope, setDeletingScope] = useState("");
  const [deletingTeamId, setDeletingTeamId] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await window.qaDesk.callsTracking.list(month); if (!result.ok) { setError(result.message); return; } setTeams(result.teams.map((team) => ({ ...team, month, employees: team.employees.map((employee) => ({ ...employee, month })) }))); }
    catch { setError("Calls tracking could not be loaded. Check the database connection."); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { void loadData(); }, [loadData]);

  const days = useMemo(() => { const count = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(); return Array.from({ length: count }, (_, index) => index + 1); }, [month]);
  const selectedTeams = useMemo(() => (teamFilter === "all" ? teams : teams.filter((team) => team.id === teamFilter)), [teamFilter, teams]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTeams = selectedTeams.map((team) => ({ ...team, employees: team.employees.filter((employee) => matchesEmployee(employee, team, days, normalizedQuery, typeFilter, targetFilter, activityFilter)) }));
  const summary = visibleTeams.reduce((result, team) => team.employees.reduce((inner, employee) => { const stats = employeeStats(employee, team.targets[employee.employeeType], days); inner.calls += stats.total; inner.missedCalls += stats.totalMissed; inner.workDays += stats.workDays; inner.employees += 1; if (stats.achieved !== null) inner.met += stats.achieved; if (stats.missed !== null) inner.missed += stats.missed; return inner; }, result), { employees: 0, calls: 0, missedCalls: 0, workDays: 0, met: 0, missed: 0 });
  const selectedDeleteDate = deleteDate.startsWith(`${month}-`) ? deleteDate : `${month}-01`;

  async function deleteEntries(scope, teamIdOverride = deleteTeamId) {
    const allTeams = teamIdOverride === "all";
    const teamName = teams.find((team) => team.id === teamIdOverride)?.name;
    const period = scope === "day" ? selectedDeleteDate : monthLabel(month);
    const target = allTeams ? "all teams" : teamName || "the selected team";
    if (!window.confirm(`Delete call entries for ${target} for ${period}? This cannot be undone.`)) return;
    setDeletingScope(scope); setDeletingTeamId(allTeams ? "" : teamIdOverride); setDeleteMessage(""); setError("");
    try {
      const result = await window.qaDesk.callsTracking.delete({
        scope,
        month,
        ...(scope === "day" ? { date: selectedDeleteDate } : {}),
        allTeams,
        ...(allTeams ? {} : { teamId: teamIdOverride }),
      });
      if (!result.ok) { setError(result.message); return; }
      setDeleteMessage(`${result.deletedCount} call entries deleted for ${target} for ${period}.`);
      await loadData();
    } catch {
      setError("Call entries could not be deleted.");
    } finally {
      setDeletingScope("");
      setDeletingTeamId("");
    }
  }

  async function saveEntry(employeeId, date, calls, status) {
    setSaving(true); setError("");
    try {
      const result = await window.qaDesk.callsTracking.save({ employeeId, date, calls, status });
      if (!result.ok) { setError(result.message); return false; }
      setTeams((current) => current.map((team) => ({ ...team, employees: team.employees.map((employee) => employee.id === employeeId ? { ...employee, days: { ...employee.days, [date]: { calls: result.calls, missedCalls: result.missedCalls || 0, status: result.status } } } : employee) })));
      return true;
    } catch {
      setError("Call entry could not be saved.");
      return false;
    }
    finally { setSaving(false); }
  }

  async function exportExcel() {
    setExportMessage("");
    try {
      const module = await import("xlsx-js-style");
      const XLSX = module.default || module;
      const rows = [["CALLS TRACKING REPORT", monthLabel(month)], ["TEAM", "EMPLOYEE", "TYPE", "3CX", "AWFAR", ...days.map((day) => `DAY ${day}`), "TOTAL CALLS", "UNANSWERED", "WORK DAYS", "TARGET MET", "TARGET MISSED", "WEIGHT (%)"]];
      visibleTeams.forEach((team) => team.employees.forEach((employee) => {
        const target = team.targets[employee.employeeType];
        const stats = employeeStats(employee, target, days);
        const weight = earnedWeight(stats, target);
        rows.push([team.name, employee.fullName, employee.employeeType, employee.code3cx || "-", employee.awfarCode || "-", ...days.map((day) => {
          const entry = entryValue(employee, day);
          return entry.status === "leave" ? "Leave" : entry.status === "outage" ? "System outage" : entry.calls || "";
        }), stats.total, stats.totalMissed, stats.workDays, stats.achieved ?? "Off", stats.missed ?? "Off", weight === null ? "Off" : Number(weight.toFixed(2))]);
      }));
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const lastColumn = rows[1].length - 1;
      const lastRow = rows.length - 1;
      sheet["!freeze"] = { xSplit: 5, ySplit: 2 };
      sheet["!autofilter"] = { ref: `A2:${XLSX.utils.encode_cell({ r: lastRow, c: lastColumn })}` };
      sheet["!cols"] = rows[1].map((_, index) => ({ wch: index === 0 || index === 1 ? 22 : index < 5 ? 13 : index < days.length + 5 ? 14 : 15 }));
      sheet["!rows"] = [{ hpt: 30 }, { hpt: 24 }, ...rows.slice(2).map(() => ({ hpt: 21 }))];
      sheet.A1.s = { fill: { fgColor: { rgb: "173B28" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 }, alignment: { vertical: "center" } };
      for (let row = 1; row < rows.length; row += 1) {
        for (let column = 0; column < rows[row].length; column += 1) {
          const cell = XLSX.utils.encode_cell({ r: row, c: column });
          sheet[cell].s = row === 1
            ? { fill: { fgColor: { rgb: "286343" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } }
            : { fill: { fgColor: { rgb: row % 2 ? "F3F7F3" : "FFFFFF" } }, font: { color: { rgb: "26382D" } }, alignment: { vertical: "center", horizontal: column >= 5 ? "center" : "left" }, border: { bottom: { style: "thin", color: { rgb: "D9E3DA" } } } };
        }
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Calls Tracking");
      XLSX.writeFile(workbook, `Calls_Tracking_${month}.xlsx`, { compression: true });
      setExportMessage(`Exported ${rows.length - 2} employees using the current filters.`);
    } catch {
      setExportMessage("Excel export failed. Please try again.");
    }
  }

  return <div className="calls-page">
    <section className="calls-toolbar">
      <div className="calls-intro"><span className="calls-icon"><Activity size={20} /></span><div><span className="calls-kicker">OPERATIONS CONTROL</span><h2>Calls tracking</h2><p>Daily call volume, targets and attendance signals by team.</p></div></div>
      <div className="calls-filters">
        <label><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" /></label>
        <label><span>Month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <label><span>Team</span><select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="Agent">Agent</option><option value="Senior">Senior</option></select></label>
        <label><span>Target</span><select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">All targets</option><option value="enabled">Enabled</option><option value="disabled">Off</option></select></label>
        <label><span>Activity</span><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="all">All activity</option><option value="has-calls">Has calls</option><option value="no-calls">No calls</option><option value="leave">Leave recorded</option><option value="outage">Outage recorded</option></select></label>
        <button type="button" onClick={() => void exportExcel()} disabled={loading || saving}><FileSpreadsheet size={16} /> Export Excel</button>
      </div>
    </section>
    {exportMessage && <div className="calls-notice" role="status">{exportMessage}</div>}
    {error && <div className="calls-error" role="alert">{error}</div>}
    {deleteMessage && <div className="calls-notice" role="status">{deleteMessage}</div>}
    {canEditCalls && <section className="calls-delete-toolbar">
      <div className="calls-delete-heading"><strong>Delete call entries</strong><span>Choose a team or all teams, then delete one day or the selected month.</span></div>
      <div className="calls-delete-controls">
        <label><span>Team scope</span><select value={deleteTeamId} onChange={(event) => setDeleteTeamId(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label><span>Day to delete</span><input type="date" value={selectedDeleteDate} min={`${month}-01`} max={`${month}-${String(days.length).padStart(2, "0")}`} onChange={(event) => setDeleteDate(event.target.value)} /></label>
        <button type="button" className="calls-delete-day-button" onClick={() => void deleteEntries("day")} disabled={loading || saving || Boolean(deletingScope)}><Trash2 size={15} />{deletingScope === "day" ? "Deleting day..." : "Delete day"}</button>
        <button type="button" className="calls-delete-month-button" onClick={() => void deleteEntries("month")} disabled={loading || saving || Boolean(deletingScope)}><CalendarDays size={15} />{deletingScope === "month" ? "Deleting month..." : `Delete ${monthLabel(month)}`}</button>
      </div>
    </section>}
    <section className="calls-summary">
      <article><Users size={18} /><div><small>Visible employees</small><strong>{summary.employees}</strong></div></article>
      <article><Activity size={18} /><div><small>Total calls</small><strong>{summary.calls.toLocaleString()}</strong></div></article>
      <article><X size={18} /><div><small>Unanswered calls</small><strong>{summary.missedCalls.toLocaleString()}</strong></div></article>
      <article><CheckCircle2 size={18} /><div><small>Work days</small><strong>{summary.workDays}</strong></div></article>
      <article><Target size={18} /><div><small>Target days met</small><strong>{summary.met}</strong></div></article>
      <article><CircleAlert size={18} /><div><small>Target days missed</small><strong>{summary.missed}</strong></div></article>
    </section>
    {loading ? <div className="calls-empty"><span className="calls-spinner" />Loading calls data...</div> : visibleTeams.length ? visibleTeams.map((team) => <TeamCallsTable key={team.id} team={team} days={days} employees={team.employees} saving={saving} deletingScope={deletingScope && deletingTeamId === team.id ? deletingScope : ""} deletingTeamId={deletingTeamId} selectedDeleteDate={selectedDeleteDate} canEdit={canEditCalls} onSave={saveEntry} onDelete={deleteEntries} />) : <div className="calls-empty">No teams or employees found.</div>}
    <p className="calls-hint">Select a day to enter calls, record leave, or mark a system outage.</p>
  </div>;
}
