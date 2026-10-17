import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CircleAlert, Clock3, FileSpreadsheet, Search, Trash2, Users } from "lucide-react";
import "./talking-time.css";

function currentDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthEndDate(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function formatTime(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimeInput(value) {
  if (value.includes(":")) {
    const parts = value.split(":").slice(0, 3).map((part, index) => {
      const digits = part.replace(/\D/g, "");
      return index === 0 ? digits : digits.slice(0, 2);
    });

    if (parts.length === 1) return parts[0];
    if (parts.length === 2) {
      const hours = parts[0].padStart(2, "0");
      return parts[1].length === 2 ? `${hours}:${parts[1]}:` : `${hours}:${parts[1]}`;
    }
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${parts[2]}`;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}:`;
  if (digits.length < 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}:`;
  if (digits.length <= 6) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
  return `${digits.slice(0, -4)}:${digits.slice(-4, -2)}:${digits.slice(-2)}`;
}

function normalizeTimeInput(value) {
  if (!value) return "";
  if (value.includes(":")) {
    const parts = value.split(":").slice(0, 3).map((part, index) => {
      const digits = part.replace(/\D/g, "");
      return index === 0 ? digits : digits.slice(0, 2);
    });
    const [hours = "0", minutes = "0", seconds = "0"] = parts;
    const totalSeconds = Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
    return formatTime(totalSeconds);
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return `${digits.padStart(2, "0")}:00:00`;
  if (digits.length <= 4) return `${digits.slice(0, -2).padStart(2, "0")}:${digits.slice(-2)}:00`;
  return `${digits.slice(0, -4).padStart(2, "0")}:${digits.slice(-4, -2)}:${digits.slice(-2)}`;
}

function parseTimeInput(value) {
  if (!value) return null;
  const match = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(value);
  if (!match) return NaN;
  const [, hourText, minuteText, secondText = "0"] = match;
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  const seconds = Number(secondText);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(hours) && Number.isSafeInteger(totalSeconds) ? totalSeconds : NaN;
}

function enteredTime(employee) {
  return employee.hasDailyEntry ? formatTime(employee.dailySeconds) : "";
}

function earnedWeight(employee, target) {
  if (!target?.enabled || Number(target.target) <= 0 || Number(target.weight) <= 0) return null;
  const earned = (Number(employee.monthTotalSeconds || 0) / (Number(target.target) * 3600)) * Number(target.weight);
  return Math.min(earned, Number(target.weight));
}

function employeeTarget(employee, team) {
  return employee.talkingTimeTarget || team.targets[employee.employeeType];
}

function clearTalkingTime(teams, scope, teamId = null, employeeIds = null) {
  const selectedIds = employeeIds ? new Set(employeeIds) : null;
  return teams.map((team) => teamId && team.id !== teamId ? team : {
    ...team,
    employees: team.employees.map((employee) => selectedIds && !selectedIds.has(employee.id) ? employee : ({
      ...employee,
      dailySeconds: 0,
      hasDailyEntry: false,
      monthTotalSeconds: scope === "day"
        ? Math.max(0, employee.monthTotalSeconds - employee.dailySeconds)
        : 0,
    })),
  });
}

function TeamTarget({ level, target }) {
  const levelClass = level.toLowerCase();
  if (!target?.enabled || !Number(target.target) || !Number(target.weight)) {
    return <span className={`talking-team-target unavailable ${levelClass}`}>{level}: No target</span>;
  }
  return <span className={`talking-team-target ${levelClass}`}>{level}: {formatTime(Number(target.target) * 3600)} · {Number(target.weight)}%</span>;
}

function EmployeeRow({ employee, target, saving, deleting, message, onSave, selected, onSelect, canEdit }) {
  const [draft, setDraft] = useState(enteredTime(employee));
  const [lastAttempt, setLastAttempt] = useState(null);
  const isEmpty = !draft.replaceAll(":", "");
  const dirty = draft !== enteredTime(employee);
  const seconds = isEmpty ? null : parseTimeInput(draft);
  const complete = isEmpty || /^\d{2,}:\d{2}:\d{2}$/.test(draft);
  const valid = isEmpty || (complete && Number.isSafeInteger(seconds));
  const weight = earnedWeight(employee, target);

  useEffect(() => {
    setDraft(enteredTime(employee));
  }, [employee.dailySeconds, employee.hasDailyEntry]);

  useEffect(() => {
    if (!canEdit || !dirty || !valid || !complete || saving || deleting || lastAttempt === draft) return undefined;
    const timeout = setTimeout(() => {
      setLastAttempt(draft);
      onSave(employee, seconds);
    }, 600);
    return () => clearTimeout(timeout);
  }, [canEdit, dirty, valid, complete, saving, deleting, lastAttempt, draft, employee, seconds, onSave]);

  const status = saving
    ? "Saving..."
    : dirty && !valid
      ? "Use HH:MM:SS"
      : dirty && !complete
        ? "Continue typing MM:SS"
        : dirty && lastAttempt === draft
          ? message || "Not saved"
          : dirty
            ? "Saving automatically..."
            : message || " ";

  return (
    <tr>
      <td className="talking-select-cell" data-label="Select">
        <input className="talking-row-select" type="checkbox" checked={selected} disabled={!canEdit} onChange={(event) => onSelect(employee.id, event.target.checked)} aria-label={`Select ${employee.fullName}`} />
      </td>
      <td data-label="Employee">
        <div className="talking-employee">
          <span>{employee.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
          <div>
            <strong>{employee.fullName}</strong>
            <small>{employee.employeeType}</small>
          </div>
        </div>
      </td>
      <td data-label="3CX">{employee.code3cx || <span className="talking-missing">—</span>}</td>
      <td data-label="Awfar">{employee.awfarCode || <span className="talking-missing">—</span>}</td>
      <td data-label="Daily time">
        <div className="talking-daily-form">
          <label className="talking-time-single">
            <input
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(event) => {
                setLastAttempt(null);
                setDraft(formatTimeInput(event.target.value));
              }}
              onBlur={() => {
                if (!isEmpty) {
                  const normalized = normalizeTimeInput(draft);
                  if (Number.isSafeInteger(parseTimeInput(normalized))) setDraft(normalized);
                }
              }}
              disabled={!canEdit || saving || deleting}
              aria-label={`Daily talking time for ${employee.fullName}`}
              placeholder="HH:MM:SS"
              style={{ width: `${Math.max(8, draft.length)}ch` }}
            />
          </label>
        </div>
        <small className="talking-row-message" role="status">{status}</small>
      </td>
      <td data-label="Month Total"><strong className="talking-month-total">{formatTime(employee.monthTotalSeconds)}</strong></td>
      <td data-label="Weight (%)">
        {weight === null ? (
          <span className="talking-no-weight">No target</span>
        ) : (
          <div className="talking-weight">
            <strong>{weight.toLocaleString("en-US", { maximumFractionDigits: 2 })}%</strong>
            <span>Target weight: {Number(target.weight)}%</span>
          </div>
        )}
      </td>
    </tr>
  );
}

function TeamTalkingTable({ team, date, month, query, savingEmployee, deletingScope, deletingTeamId, messages, onSave, onDeleteTeam, canEdit }) {
  const [selected, setSelected] = useState(() => new Set());
  const teamDeleting = Boolean(deletingScope) && deletingTeamId === team.id;
  const normalizedQuery = (query || "").trim().toLocaleLowerCase();
  const filteredEmployees = normalizedQuery
    ? team.employees.filter((employee) => [employee.fullName, employee.code3cx, employee.awfarCode].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery)))
    : team.employees;

  const selectedIds = filteredEmployees.filter((employee) => selected.has(employee.id)).map((employee) => employee.id);
  const allSelected = filteredEmployees.length > 0 && selectedIds.length === filteredEmployees.length;
  const selectedSaving = selectedIds.some((employeeId) => savingEmployee === employeeId);

  useEffect(() => {
    setSelected(new Set());
  }, [query]);

  function selectEmployee(employeeId, isSelected) {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(employeeId);
      else next.delete(employeeId);
      return next;
    });
  }

  async function deleteSelected(scope) {
    const result = await onDeleteTeam(team, scope, selectedIds);
    if (result.ok) setSelected(new Set());
  }

  return (
    <section className="talking-team-section">
      <header className="talking-team-heading">
        <div>
          <span className="talking-team-mark"><Users size={16} /></span>
          <div>
            <h3>{team.name}</h3>
            <small>{team.employees.length} {team.employees.length === 1 ? "employee" : "employees"}</small>
          </div>
        </div>
        <div className="talking-team-targets">
          <TeamTarget level="Agent" target={team.targets.Agent} />
          <TeamTarget level="Senior" target={team.targets.Senior} />
        </div>
      </header>

      {canEdit && <div className="talking-team-delete-bar">
        <label className="talking-select-all">
          <input
            className="talking-row-select"
            type="checkbox"
            checked={allSelected}
            onChange={(event) => setSelected(event.target.checked ? new Set(filteredEmployees.map((employee) => employee.id)) : new Set())}
            disabled={!filteredEmployees.length || Boolean(deletingScope) || !canEdit}
          />
          <span>{selectedIds.length} selected in {team.name}</span>
        </label>

        <div>
          <button type="button" onClick={() => void deleteSelected("day")} disabled={!selectedIds.length || Boolean(deletingScope) || selectedSaving}>
            <Trash2 size={15} />
            {teamDeleting && deletingScope === "day" ? "Deleting..." : `Delete ${date} for selected`}
          </button>
          <button type="button" onClick={() => void deleteSelected("month")} disabled={!selectedIds.length || Boolean(deletingScope) || selectedSaving}>
            <CalendarDays size={15} />
            {teamDeleting && deletingScope === "month" ? "Deleting..." : `Delete ${monthLabel(month)} for selected`}
          </button>
        </div>
      </div>}

      <div className="talking-table-scroll">
        <table className="talking-time-table">
          <thead>
            <tr>
              <th aria-label={`Select all employees in ${team.name}`}>
                <input
                  className="talking-row-select"
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => setSelected(event.target.checked ? new Set(filteredEmployees.map((employee) => employee.id)) : new Set())}
                  disabled={!filteredEmployees.length || Boolean(deletingScope) || !canEdit}
                />
              </th>
              <th>Employee</th>
              <th>3CX</th>
              <th>Awfar</th>
              <th>Daily time</th>
              <th>Month Total</th>
              <th>Weight (%)</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <EmployeeRow
                key={`${employee.id}-${date}`}
                employee={employee}
                target={employeeTarget(employee, team)}
                saving={savingEmployee === employee.id}
                deleting={Boolean(deletingScope) && (!deletingTeamId || deletingTeamId === team.id)}
                message={messages[employee.id]}
                onSave={onSave}
                selected={selected.has(employee.id)}
                onSelect={selectEmployee}
                canEdit={canEdit}
              />
            ))}
            {!filteredEmployees.length && (
              <tr>
                <td className="talking-team-empty" colSpan="7">
                  {team.employees.length ? "No employees match this search." : "No active employees are assigned to this team."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TalkingTimePage({ canEdit = true, user }) {
  const today = currentDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [teams, setTeams] = useState([]);
  const [teamFilter, setTeamFilter] = useState("all");
  
  // Manager cannot edit
  const canEditTalkingTime = canEdit && user?.role !== "Manager";
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingEmployee, setSavingEmployee] = useState("");
  const [deletingScope, setDeletingScope] = useState("");
  const [deletingTeamId, setDeletingTeamId] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteError, setDeleteError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.qaDesk.talkingTime.list(month, date);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTeams(result.teams);
      setMessages({});
    } catch {
      setError("Talking time could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
    }
  }, [month, date]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleTeams = useMemo(
    () => (teamFilter === "all" ? teams : teams.filter((team) => team.id === teamFilter)),
    [teams, teamFilter],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = useMemo(
    () => visibleTeams.flatMap((team) => team.employees
      .filter((employee) => [employee.fullName, employee.code3cx, employee.awfarCode]
        .some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery)))
      .map((employee) => ({ team, employee }))),
    [visibleTeams, normalizedQuery],
  );
  const employeesToShow = normalizedQuery ? searchResults.map((result) => result.employee) : visibleTeams.flatMap((team) => team.employees);
  const monthTotal = employeesToShow.reduce((total, employee) => total + Number(employee.monthTotalSeconds || 0), 0);
  const earnedTotal = visibleTeams.reduce((total, team) => total + team.employees
    .filter((employee) => employeesToShow.some((matched) => matched.id === employee.id))
    .reduce((teamTotal, employee) => teamTotal + (earnedWeight(employee, employeeTarget(employee, team)) || 0), 0), 0);

  function changeMonth(nextMonth) {
    if (!nextMonth) return;
    setMonth(nextMonth);
    setDate(`${nextMonth}-01`);
  }

  async function saveDailyTime(employee, draft) {
    setSavingEmployee(employee.id);
    setMessages((current) => ({ ...current, [employee.id]: "" }));
    setError("");
    try {
      const result = await window.qaDesk.talkingTime.save({ employeeId: employee.id, date, seconds: draft });
      if (!result.ok) {
        setMessages((current) => ({ ...current, [employee.id]: result.message }));
        return;
      }

      const nextDaily = result.dailySeconds || 0;
      setTeams((current) => current.map((team) => ({
        ...team,
        employees: team.employees.map((item) => item.id === employee.id ? {
          ...item,
          dailySeconds: nextDaily,
          hasDailyEntry: result.dailySeconds !== null,
          monthTotalSeconds: Math.max(0, Number(item.monthTotalSeconds || 0) - Number(item.dailySeconds || 0) + nextDaily),
        } : item),
      })));
      setMessages((current) => ({ ...current, [employee.id]: "Saved automatically" }));
    } catch {
      setMessages((current) => ({ ...current, [employee.id]: "Could not save daily time." }));
    } finally {
      setSavingEmployee("");
    }
  }

  async function deleteAllTalkingTime(scope) {
    if (savingEmployee) return;
    const period = scope === "day" ? date : monthLabel(month);
    if (!window.confirm(`Delete talking time for all employees across all teams for ${period}? This cannot be undone.`)) return;
    setDeleteMessage("");
    setDeleteError(false);
    setDeletingScope(scope);
    setDeletingTeamId("");
    try {
      const result = await window.qaDesk.talkingTime.delete({ allTeams: true, scope, month, date });
      if (!result.ok) {
        setDeleteMessage(result.message);
        setDeleteError(true);
        return;
      }
      setTeams((current) => clearTalkingTime(current, scope));
      setMessages({});
      setDeleteMessage(`${result.deletedCount} ${result.deletedCount === 1 ? "entry" : "entries"} deleted across all teams for ${period}.`);
    } catch {
      setDeleteMessage("Talking time could not be deleted.");
      setDeleteError(true);
    } finally {
      setDeletingScope("");
    }
  }

  async function deleteTeamTalkingTime(team, scope, employeeIds) {
    if (!employeeIds.length || employeeIds.some((employeeId) => savingEmployee === employeeId)) return { ok: false };
    const period = scope === "day" ? date : monthLabel(month);
    if (!window.confirm(`Delete talking time for ${employeeIds.length} selected ${employeeIds.length === 1 ? "employee" : "employees"} in ${team.name} for ${period}? Other employees and teams will not be affected.`)) return { ok: false };
    setDeleteMessage("");
    setDeleteError(false);
    setDeletingScope(scope);
    setDeletingTeamId(team.id);
    try {
      const result = await window.qaDesk.talkingTime.delete({ teamId: team.id, employeeIds, allTeams: false, scope, month, date });
      if (!result.ok) {
        setDeleteMessage(result.message);
        setDeleteError(true);
        return result;
      }
      setTeams((current) => clearTalkingTime(current, scope, team.id, employeeIds));
      setMessages({});
      setDeleteMessage(`${result.deletedCount} ${result.deletedCount === 1 ? "entry" : "entries"} deleted from ${team.name} for ${period}.`);
      return result;
    } catch {
      setDeleteMessage(`Talking time could not be deleted from ${team.name}.`);
      setDeleteError(true);
      return { ok: false };
    } finally {
      setDeletingScope("");
      setDeletingTeamId("");
    }
  }

  async function exportVisibleData() {
    if (exporting || !searchResults.length) return;
    setExporting(true);
    setExportMessage("");
    try {
      const module = await import("xlsx-js-style");
      const XLSX = module.default || module;
      const durationCell = (seconds) => ({
        t: "n",
        v: Number(seconds || 0) / 86400,
        z: "[h]:mm:ss",
        s: { alignment: { horizontal: "center" }, font: { color: { rgb: "173B28" } } },
      });
      const percentageCell = (value, tone) => ({
        t: "n",
        v: Number(value || 0),
        z: '0.00"%"',
        s: { alignment: { horizontal: "center" }, font: { bold: true, color: { rgb: tone } } },
      });
      const rows = [
        ["NORTHSTAR | TALKING TIME REPORT"],
        ["REPORTING MONTH", monthLabel(month), "DAILY ENTRY DATE", date],
        ["TEAM FILTER", teamFilter === "all" ? "All teams" : visibleTeams[0]?.name || "Selected team", "EMPLOYEE SEARCH", query.trim() || "All employees"],
        ["EMPLOYEES", searchResults.length, "MONTH TOTAL", formatTime(monthTotal)],
        [],
        ["EMPLOYEE", "TYPE", "TEAM", "3CX CODE", "AWFAR CODE", "DAILY TIME", "MONTH TOTAL", "TALK TIME TARGET", "TARGET WEIGHT", "EARNED WEIGHT"],
        ...searchResults.map(({ team, employee }) => {
          const target = employeeTarget(employee, team);
          const weight = earnedWeight(employee, target);
          return [
            employee.fullName,
            employee.employeeType,
            team.name,
            employee.code3cx || "—",
            employee.awfarCode || "—",
            durationCell(employee.dailySeconds),
            durationCell(employee.monthTotalSeconds),
            target?.enabled && Number(target.target) > 0 ? durationCell(Number(target.target) * 3600) : "—",
            target?.enabled && Number(target.weight) > 0 ? percentageCell(target.weight, "805F1D") : "—",
            weight === null ? "—" : percentageCell(weight, "176037"),
          ];
        }),
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet["!merges"] = [XLSX.utils.decode_range("A1:J1")];
      worksheet["!cols"] = [
        { wch: 29 }, { wch: 15 }, { wch: 23 }, { wch: 17 }, { wch: 17 },
        { wch: 17 }, { wch: 18 }, { wch: 22 }, { wch: 19 }, { wch: 19 },
      ];
      worksheet["!rows"] = [{ hpt: 34 }, { hpt: 23 }, { hpt: 23 }, { hpt: 23 }, { hpt: 9 }, { hpt: 28 }];
      worksheet["!autofilter"] = { ref: `A6:J${rows.length}` };
      worksheet["!views"] = [{ state: "frozen", ySplit: 6, topLeftCell: "A7", activePane: "bottomLeft" }];
      worksheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };

      worksheet.A1.s = {
        fill: { fgColor: { rgb: "173B28" } },
        font: { name: "Aptos Display", sz: 18, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", horizontal: "left", indent: 1 },
      };
      for (let rowNumber = 2; rowNumber <= 4; rowNumber += 1) {
        for (let columnNumber = 0; columnNumber < 4; columnNumber += 2) {
          const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnNumber });
          if (worksheet[address]) worksheet[address].s = {
            fill: { fgColor: { rgb: "E7F0E8" } },
            font: { bold: true, color: { rgb: "315B3E" } },
          };
        }
        for (let columnNumber = 1; columnNumber < 4; columnNumber += 2) {
          const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnNumber });
          if (worksheet[address]) worksheet[address].s = {
            fill: { fgColor: { rgb: "F7F9F5" } },
            font: { color: { rgb: "263B2D" }, bold: columnNumber === 1 && rowNumber === 4 },
          };
        }
      }
      for (let columnNumber = 0; columnNumber < 10; columnNumber += 1) {
        const address = XLSX.utils.encode_cell({ r: 5, c: columnNumber });
        if (worksheet[address]) worksheet[address].s = {
          fill: { fgColor: { rgb: "286343" } },
          font: { name: "Aptos", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { vertical: "center", horizontal: "center", wrapText: true },
          border: { bottom: { style: "medium", color: { rgb: "1D5738" } } },
        };
      }
      for (let rowIndex = 6; rowIndex < rows.length; rowIndex += 1) {
        worksheet["!rows"][rowIndex] = { hpt: 23 };
        for (let columnNumber = 0; columnNumber < 10; columnNumber += 1) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnNumber });
          if (!worksheet[address]) continue;
          worksheet[address].s = {
            ...(worksheet[address].s || {}),
            fill: { fgColor: { rgb: rowIndex % 2 === 0 ? "F2F7F2" : "FFFFFF" } },
            border: { bottom: { style: "thin", color: { rgb: "D8E2D8" } } },
          };
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Talking Time");
      workbook.Props = {
        Title: "Talking Time Report",
        Subject: `${monthLabel(month)} · ${date}`,
        Author: "Northstar Quality Operations",
      };
      XLSX.writeFile(workbook, `Talking_Time_${month}.xlsx`, { compression: true });
      setExportMessage(`Exported ${searchResults.length} employees using the current team and search filters.`);
    } catch (exportError) {
      console.error("Talking Time export failed:", exportError);
      setExportMessage("Excel export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="talking-time-page">
      <section className="talking-time-toolbar">
        <div className="talking-time-intro">
          <span className="talking-time-icon"><Clock3 size={19} /></span>
          <div>
            <span className="talking-time-kicker">TEAM HOURS</span>
            <h2>Talking time</h2>
            <p>Daily hours and monthly weighted targets, grouped by team.</p>
          </div>
        </div>

        <div className="talking-time-filters">
          <label className="talking-team-search">
            <Search size={16} />
            <span>Search employees</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, 3CX or Awfar" />
          </label>

          <label>
            <span>Team</span>
            <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
              <option value="all">All teams</option>
              {teams.map((team) => (
                <option value={team.id} key={team.id}>{team.name}</option>
              ))}
            </select>
          </label>

          <label>
            <CalendarDays size={16} />
            <span>Month</span>
            <input type="month" value={month} onChange={(event) => changeMonth(event.target.value)} />
          </label>

          <label>
            <span>Daily entry date</span>
            <input type="date" value={date} min={`${month}-01`} max={monthEndDate(month)} onChange={(event) => setDate(event.target.value)} />
          </label>

          <button className="talking-export-button" type="button" onClick={() => void exportVisibleData()} disabled={exporting || loading || !searchResults.length}>
            <FileSpreadsheet size={16} />
            {exporting ? "Preparing Excel..." : "Export Excel"}
          </button>
        </div>
      </section>

      {exportMessage && <div className="talking-export-message" role="status">{exportMessage}</div>}

      {canEditTalkingTime && <section className="talking-global-actions">
        <div>
          <strong>All teams</strong>
          <span>These actions apply to every team, regardless of the selected team filter.</span>
        </div>
        <div className="talking-global-buttons">
          <button type="button" onClick={() => void deleteAllTalkingTime("day")} disabled={Boolean(deletingScope) || Boolean(savingEmployee)}>
            <Trash2 size={15} />
            {deletingScope && !deletingTeamId && deletingScope === "day" ? "Deleting..." : `Delete ${date} across all teams`}
          </button>
          <button type="button" onClick={() => void deleteAllTalkingTime("month")} disabled={Boolean(deletingScope) || Boolean(savingEmployee)}>
            <CalendarDays size={15} />
            {deletingScope && !deletingTeamId && deletingScope === "month" ? "Deleting..." : `Delete ${monthLabel(month)} across all teams`}
          </button>
        </div>
      </section>}

      {deleteMessage && (
        <div className={`talking-time-delete-result ${deleteError ? "error" : ""}`} role="status">
          {deleteMessage}
        </div>
      )}

      {error && (
        <div className="talking-time-error" role="alert">
          <CircleAlert size={16} />
          {error}
        </div>
      )}

      <section className="talking-time-summary" aria-label="Monthly talking time summary">
        <article>
          <span className="talking-summary-icon"><Users size={17} /></span>
          <div>
            <small>{normalizedQuery ? "Matches" : teamFilter === "all" ? "Teams" : "Employees"}</small>
            <strong>{normalizedQuery ? searchResults.length : teamFilter === "all" ? visibleTeams.length : employeesToShow.length}</strong>
          </div>
        </article>
        <article>
          <span className="talking-summary-icon hours"><Clock3 size={17} /></span>
          <div>
            <small>{monthLabel(month)} total</small>
            <strong>{formatTime(monthTotal)}</strong>
          </div>
        </article>
        <article>
          <span className="talking-summary-icon weight"><span>%</span></span>
          <div>
            <small>Earned weight</small>
            <strong>{earnedTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}%</strong>
          </div>
        </article>
      </section>

      {loading ? (
        <div className="talking-time-empty">
          <span className="talking-spinner large" />
          <p>Loading team hours...</p>
        </div>
      ) : visibleTeams.length === 0 ? (
        <div className="talking-time-empty">
          <Users size={23} />
          <h3>No teams found</h3>
          <p>Create a team and assign employees to start tracking hours.</p>
        </div>
      ) : normalizedQuery ? searchResults.length === 0 ? (
        <div className="talking-time-empty">
          <Search size={23} />
          <h3>No employees match this search</h3>
          <p>Try a different name or employee code.</p>
        </div>
      ) : (
        <div className="talking-search-results">
          {searchResults.map(({ team, employee }) => {
            const weight = earnedWeight(employee, employeeTarget(employee, team));
            return <article className="talking-search-result" key={`${team.id}-${employee.id}`}>
              <div className="talking-search-employee"><span>{employee.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div><strong>{employee.fullName}</strong><small>{employee.employeeType} · {team.name}</small></div></div>
              <div><small>3CX / Awfar</small><strong>{employee.code3cx || "—"} / {employee.awfarCode || "—"}</strong></div>
              <div><small>Month Total</small><strong>{formatTime(employee.monthTotalSeconds)}</strong></div>
              <div><small>Weight (%)</small><strong>{weight === null ? "No target" : `${weight.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`}</strong></div>
            </article>;
          })}
        </div>
      ) : (
        <div className="talking-team-list">
          {visibleTeams.map((team) => (
            <TeamTalkingTable
              key={team.id}
              team={team}
              date={date}
              month={month}
              query=""
              savingEmployee={savingEmployee}
              deletingScope={deletingScope}
              deletingTeamId={deletingTeamId}
              messages={messages}
              onSave={saveDailyTime}
              onDeleteTeam={deleteTeamTalkingTime}
              canEdit={canEditTalkingTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}
