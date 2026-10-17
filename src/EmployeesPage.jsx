import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowLeft,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  FileClock,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

function todayValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateInputValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";
}

function formatTenure(startValue, endValue = new Date()) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end || end < start) return "—";

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years}y ${months}m ${days}d`;
}

function emptyEmployee() {
  return {
    fullName: "",
    code3cx: "",
    awfarCode: "",
    awfarUser: "",
    email: "",
    optionalFields: { code3cx: false, awfarCode: false, awfarUser: false, email: false },
    employeeType: "Agent",
    hireDate: "",
    teamId: "",
    performanceTargets: {
      salesMode: "team",
      sales: { red: { from: "", to: "" }, yellow: { from: "", to: "" }, green: { from: "" }, redZoneOverride: false, greenZoneOverride: false },
      talkingTimeMode: "team",
      talkingTimeHours: "",
    },
  };
}

function prepareEmployee(employee) {
  const blank = emptyEmployee();
  return {
    ...blank,
    ...employee,
    hireDate: dateInputValue(employee.hireDate),
    optionalFields: {
      ...blank.optionalFields,
      ...employee.optionalFields,
      awfarUser: employee.optionalFields?.awfarUser ?? !employee.awfarUser,
    },
    performanceTargets: {
      ...blank.performanceTargets,
      ...employee.performanceTargets,
      sales: {
        ...blank.performanceTargets.sales,
        ...employee.performanceTargets?.sales,
        red: { ...blank.performanceTargets.sales.red, ...employee.performanceTargets?.sales?.red },
        yellow: { ...blank.performanceTargets.sales.yellow, ...employee.performanceTargets?.sales?.yellow },
        green: { ...blank.performanceTargets.sales.green, ...employee.performanceTargets?.sales?.green },
      },
    },
  };
}

function EmployeeField({ label, name, value, onChange, optional, toggleOptional, required, type = "text", placeholder = "", disabled = false, max, min, hint }) {
  return <div className={`employee-field ${optional ? "optional" : ""}`}>
    <div className="employee-field-heading"><label htmlFor={name}>{label}{required && !optional && <b> *</b>}</label><label className="employee-not-required" htmlFor={`${name}-optional`}><input id={`${name}-optional`} type="checkbox" checked={optional} onChange={(event) => toggleOptional(event.target.checked)} /><span className="employee-check"><Check size={11} /></span><span>Not required</span></label></div>
    <input className="employee-input" id={name} name={name} type={type} value={value} onChange={onChange} required={required && !optional} disabled={disabled || optional} maxLength={max} min={min} max={type === "date" ? todayValue() : undefined} placeholder={placeholder} />
    {hint && <small className="employee-field-hint">{hint}</small>}
  </div>;
}

function EmployeeEditor({ employee, teams, loading, error, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => prepareEmployee(employee || emptyEmployee()));
  const selectedTeam = teams.find((team) => team.id === draft.teamId);
  const employeeLevel = draft.employeeType === "Senior" ? "senior" : "agent";
  const teamSales = selectedTeam?.performance?.[employeeLevel] || {};
  const teamTalking = selectedTeam?.kpis?.[employeeLevel]?.talkingTimeHours;

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateOptionalField(key, value) {
    setDraft((current) => ({ ...current, optionalFields: { ...current.optionalFields, [key]: value } }));
  }

  function updatePerformanceTarget(key, value) {
    setDraft((current) => ({ ...current, performanceTargets: { ...current.performanceTargets, [key]: value } }));
  }

  function updateSalesZone(zone, bound, value) {
    setDraft((current) => ({
      ...current,
      performanceTargets: {
        ...current.performanceTargets,
        sales: {
          ...current.performanceTargets.sales,
          [zone]: { ...current.performanceTargets.sales[zone], [bound]: value },
        },
      },
    }));
  }

  function updateSalesZoneFlag(key, value) {
    setDraft((current) => ({
      ...current,
      performanceTargets: {
        ...current.performanceTargets,
        sales: { ...current.performanceTargets.sales, [key]: value },
      },
    }));
  }

  return <form className="employee-editor" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <div className="employee-editor-heading">
      <button className="employee-back-button" type="button" onClick={onCancel}><ArrowLeft size={17} /> Back to employees</button>
      <div className="employee-editor-title"><span className="employee-title-icon"><UserPlus size={21} /></span><div><span className="employee-eyebrow">EMPLOYEE SETUP</span><h2>{employee ? "Edit employee" : "Add a new employee"}</h2><p>Set up the employee profile, contact details and team assignment.</p></div></div>
    </div>
    {error && <div className="employee-error" role="alert"><CircleAlert size={17} />{error}</div>}

    <section className="employee-form-section">
      <header className="employee-section-heading"><span className="employee-section-number">01</span><div><span className="employee-eyebrow">PROFILE</span><h3>Employee information</h3><p>Enter a full name and assign this employee to a team.</p></div></header>
      <div className="employee-form-grid">
        <EmployeeField label="Full name" name="employee-name" value={draft.fullName} onChange={(event) => updateField("fullName", event.target.value)} required max={160} placeholder="First and family name" hint="Enter at least two name parts." />
        <label className="employee-field"><span>Employee type <b>*</b></span><select className="employee-input" value={draft.employeeType} onChange={(event) => updateField("employeeType", event.target.value)} required><option value="Agent">Agent</option><option value="Senior">Senior</option></select></label>
        <EmployeeField label="Hire date" name="hire-date" type="date" value={draft.hireDate} onChange={(event) => updateField("hireDate", event.target.value)} required />
        <label className="employee-field"><span>Assigned team <b>*</b></span><select className="employee-input" value={draft.teamId} onChange={(event) => updateField("teamId", event.target.value)} required><option value="">Select a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>{teams.length === 0 && <small className="employee-field-hint">Create a team before adding employees.</small>}</label>
      </div>
    </section>

    <section className="employee-form-section">
      <header className="employee-section-heading"><span className="employee-section-number">02</span><div><span className="employee-eyebrow">SYSTEM & CONTACT</span><h3>Employee identifiers</h3><p>Each identifier can be marked not required for this employee.</p></div></header>
      <div className="employee-form-grid employee-identifier-grid">
        <EmployeeField label="3CX code" name="employee-3cx" value={draft.code3cx} onChange={(event) => updateField("code3cx", event.target.value)} required max={64} placeholder="Enter 3CX code" optional={draft.optionalFields.code3cx} toggleOptional={(value) => updateOptionalField("code3cx", value)} />
        <EmployeeField label="Awfar code" name="employee-awfar" value={draft.awfarCode} onChange={(event) => updateField("awfarCode", event.target.value)} required max={64} placeholder="Enter Awfar code" optional={draft.optionalFields.awfarCode} toggleOptional={(value) => updateOptionalField("awfarCode", value)} />
        <EmployeeField label="Awfar User" name="employee-awfar-user" value={draft.awfarUser} onChange={(event) => updateField("awfarUser", event.target.value)} required max={120} placeholder="Enter Awfar user" optional={draft.optionalFields.awfarUser} toggleOptional={(value) => updateOptionalField("awfarUser", value)} />
        <EmployeeField label="Email address" name="employee-email" type="email" value={draft.email} onChange={(event) => updateField("email", event.target.value)} required max={254} placeholder="employee@company.com" optional={draft.optionalFields.email} toggleOptional={(value) => updateOptionalField("email", value)} />
      </div>
    </section>

    <section className="employee-form-section employee-targets-section">
      <header className="employee-section-heading"><span className="employee-section-number">03</span><div><span className="employee-eyebrow">INDIVIDUAL TARGETS</span><h3>Sales & talking time</h3><p>Use this employee's team targets or set individual sales zones and a talking-time target.</p></div></header>
      <div className="employee-target-group">
        <label className="employee-field"><span>Sales targets</span><select className="employee-input" value={draft.performanceTargets.salesMode} onChange={(event) => updatePerformanceTarget("salesMode", event.target.value)}><option value="team">Use team sales targets</option><option value="custom">Set custom employee targets</option></select></label>
        {draft.performanceTargets.salesMode === "team"
          ? <p className="employee-target-hint">{selectedTeam?.performance?.enabled
            ? `Using ${selectedTeam.name} ${draft.employeeType.toLowerCase()} sales zones: Red ${teamSales.red?.from ?? "—"}–${teamSales.red?.to ?? "—"}, Yellow ${teamSales.yellow?.from ?? "—"}–${teamSales.yellow?.to ?? "—"}, Green ${teamSales.green?.from ?? "—"}+.`
            : "The selected team has sales targets disabled. Choose custom targets to enable sales zones for this employee."}</p>
          : <div className="employee-target-zone-grid">
            {[
              ["red", "Red zone", ["from", "to"]],
              ["yellow", "Yellow zone", ["from", "to"]],
              ["green", "Green zone", ["from"]],
            ].map(([zone, label, bounds]) => <div className="employee-target-zone" key={zone}>
              <strong>{label}</strong>
              {bounds.map((bound) => <label className="employee-field" key={bound}><span>{bound === "from" ? (zone === "green" ? "Minimum sales" : "From") : "To"} <b>*</b></span><input className="employee-input" type="number" min="0" step="any" value={draft.performanceTargets.sales[zone][bound] ?? ""} onChange={(event) => updateSalesZone(zone, bound, event.target.value)} required /></label>)}
            </div>)}
            <p className="employee-target-hint">Ranges must be ordered without overlap: Red, then Yellow, then Green.</p>
            <label className="employee-target-check"><input type="checkbox" checked={draft.performanceTargets.sales.redZoneOverride} onChange={(event) => updateSalesZoneFlag("redZoneOverride", event.target.checked)} /><span>Calculate KPI normally in the Red zone</span></label>
            <label className="employee-target-check"><input type="checkbox" checked={draft.performanceTargets.sales.greenZoneOverride} onChange={(event) => updateSalesZoneFlag("greenZoneOverride", event.target.checked)} /><span>Calculate KPI normally in the Green zone</span></label>
          </div>}
      </div>

      <div className="employee-target-group">
        <label className="employee-field"><span>Talking-time target</span><select className="employee-input" value={draft.performanceTargets.talkingTimeMode} onChange={(event) => updatePerformanceTarget("talkingTimeMode", event.target.value)}><option value="team">Use team talking-time target</option><option value="custom">Set custom employee target</option></select></label>
        {draft.performanceTargets.talkingTimeMode === "team"
          ? <p className="employee-target-hint">{teamTalking?.enabled
            ? `Using ${selectedTeam?.name || "team"} ${draft.employeeType.toLowerCase()} target: ${teamTalking.target} hours per month.`
            : "No talking-time target is enabled for this employee's level in the selected team."}</p>
          : <label className="employee-field employee-target-hours"><span>Monthly target (hours) <b>*</b></span><input className="employee-input" type="number" min="0.01" step="any" value={draft.performanceTargets.talkingTimeHours ?? ""} onChange={(event) => updatePerformanceTarget("talkingTimeHours", event.target.value)} required /><small className="employee-field-hint">The talking-time KPI weight, if enabled, remains inherited from the team.</small></label>}
      </div>
    </section>

    <div className="employee-form-actions"><button className="employee-cancel-button" type="button" onClick={onCancel}>Cancel</button><button className="employee-save-button" type="submit" disabled={loading || teams.length === 0}>{loading ? <span className="employee-spinner" /> : <Save size={17} />}{loading ? "Saving..." : employee ? "Save changes" : "Save employee"}</button></div>
  </form>;
}

function EmploymentDateDialog({ action, employee, loading, error, onCancel, onConfirm }) {
  const [date, setDate] = useState(todayValue());
  const archiveDate = dateInputValue(employee.resignDate);
  const isRestore = action === "restore";

  return <div className="employee-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="employee-date-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-date-title">
      <button className="employee-dialog-close" type="button" onClick={onCancel} aria-label="Close dialog"><X size={18} /></button>
      <span className={`employee-dialog-icon ${isRestore ? "return" : "resign"}`}>{isRestore ? <RotateCcw size={20} /> : <UserMinus size={20} />}</span>
      <span className="employee-eyebrow">EMPLOYMENT STATUS</span>
      <h2 id="employee-date-title">{isRestore ? "Return employee" : "Record resignation"}</h2>
      <p>{employee.fullName} · {employee.teamName}</p>
      {isRestore && archiveDate && <small className="employee-dialog-note">Last resignation: {formatDate(employee.resignDate)}</small>}
      <label className="employee-field"><span>{isRestore ? "Return date" : "Resignation date"} <b>*</b></span><input className="employee-input" type="date" min={isRestore ? archiveDate : dateInputValue(employee.returnDate) || dateInputValue(employee.hireDate)} max={todayValue()} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      {error && <div className="employee-error" role="alert"><CircleAlert size={15} />{error}</div>}
      <div className="employee-dialog-actions"><button className="employee-cancel-button" type="button" onClick={onCancel}>Cancel</button><button className={`employee-confirm-button ${isRestore ? "return" : "resign"}`} type="button" onClick={() => onConfirm(date)} disabled={loading || !date}>{loading ? "Saving..." : isRestore ? "Confirm return" : "Confirm resignation"}</button></div>
    </section>
  </div>;
}

function EmployeeRow({ employee, archived, canManage, canManageEmployees, onEdit, onResign, onRestore, onDelete, busy }) {
  const tenureEnd = archived ? employee.resignDate : new Date();
  return <tr>
    <td data-label="Employee"><span className="employee-name-cell"><strong>{employee.fullName}</strong><small>{employee.employeeType}</small></span></td>
    <td data-label="3CX">{employee.code3cx || <span className="employee-missing">—</span>}</td>
    <td data-label="Awfar">{employee.awfarCode || <span className="employee-missing">—</span>}</td>
    <td data-label="Awfar User">{employee.awfarUser || <span className="employee-missing">—</span>}</td>
    <td data-label="Email">{employee.email || <span className="employee-missing">—</span>}</td>
    <td data-label="Team"><span className="employee-team-cell"><Users size={14} />{employee.teamName}</span></td>
    <td data-label="Hire date"><span className="employee-date-cell">{formatDate(employee.hireDate)}</span></td>
    <td data-label="Status"><span className={`employee-status ${archived ? "resigned" : "active"}`}><i />{archived ? "Resigned" : "Active"}</span></td>
    <td data-label="Resign date"><span className="employee-date-cell">{archived ? formatDate(employee.resignDate) : "—"}</span></td>
    <td data-label="Tenure"><span className="employee-tenure"><Clock3 size={14} />{formatTenure(employee.hireDate, tenureEnd)}</span></td>
    <td data-label="Actions">{canManageEmployees && <div className="employee-row-actions">
      <button className="employee-action-button" type="button" onClick={() => onEdit(employee)} title="Edit employee" aria-label={`Edit ${employee.fullName}`}><Pencil size={15} /></button>
      {archived ? <button className="employee-action-button restore" type="button" onClick={() => onRestore(employee)} title="Return employee" aria-label={`Return ${employee.fullName}`}><RotateCcw size={15} /></button> : <button className="employee-action-button resign" type="button" onClick={() => onResign(employee)} title="Record resignation" aria-label={`Resign ${employee.fullName}`}><UserMinus size={15} /></button>}
      <button className="employee-action-button delete" type="button" onClick={() => onDelete(employee)} disabled={busy} title="Delete employee" aria-label={`Delete ${employee.fullName}`}><Trash2 size={15} /></button>
    </div>}</td>
  </tr>;
}

export default function EmployeesPage({ canManage = true, user }) {
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [view, setView] = useState("current");
  const [mode, setMode] = useState("list");
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [dateAction, setDateAction] = useState(null);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyEmployee, setBusyEmployee] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const archived = view === "archive";
  
  // Manager cannot manage employees
  const canManageEmployees = canManage && user?.role !== "Manager";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.qaDesk.employees.list();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEmployees(result.employees);
      setTeams(result.teams);
    } catch {
      setError("Employees could not be loaded. Check the database connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const currentEmployees = employees.filter((employee) => employee.employmentStatus !== "Resigned");
  const archivedEmployees = employees.filter((employee) => employee.employmentStatus === "Resigned");
  const thisYear = new Date().getFullYear();
  const hiresThisYear = employees.filter((employee) => parseDate(employee.hireDate)?.getUTCFullYear() === thisYear).length;
  const averageTenureDays = currentEmployees.length ? Math.round(currentEmployees.reduce((total, employee) => {
    const start = parseDate(employee.hireDate);
    return total + (start ? Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000)) : 0);
  }, 0) / currentEmployees.length) : 0;

  const availableYears = useMemo(() => {
    const dates = (archived ? archivedEmployees : currentEmployees).map((employee) => parseDate(archived ? employee.resignDate : employee.hireDate)).filter(Boolean);
    const earliestRecordYear = dates.length ? Math.min(...dates.map((date) => date.getUTCFullYear())) : thisYear - 10;
    const firstYear = Math.min(thisYear - 10, earliestRecordYear);
    return Array.from({ length: thisYear - firstYear + 1 }, (_, index) => thisYear - index);
  }, [archived, archivedEmployees, currentEmployees, thisYear]);

  const filteredEmployees = useMemo(() => {
    const source = archived ? archivedEmployees : currentEmployees;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return source.filter((employee) => {
      if (teamFilter !== "all" && employee.teamId !== teamFilter) return false;
      if (typeFilter !== "all" && employee.employeeType !== typeFilter) return false;
      const filterDate = parseDate(archived ? employee.resignDate : employee.hireDate);
      if (yearFilter !== "all" && filterDate?.getUTCFullYear() !== Number(yearFilter)) return false;
      if (archived && monthFilter !== "all" && filterDate?.getUTCMonth() !== Number(monthFilter)) return false;
      if (normalizedQuery) {
        const values = [employee.fullName, employee.code3cx, employee.awfarCode, employee.awfarUser, employee.email, employee.teamName];
        if (!values.some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery))) return false;
      }
      return true;
    }).sort((left, right) => String(left.teamName).localeCompare(String(right.teamName)) || left.fullName.localeCompare(right.fullName));
  }, [archived, archivedEmployees, currentEmployees, monthFilter, query, teamFilter, typeFilter, yearFilter]);

  const groupedEmployees = useMemo(() => {
    const groups = new Map();
    for (const employee of filteredEmployees) {
      const key = employee.teamId || "unassigned";
      if (!groups.has(key)) groups.set(key, { name: employee.teamName, employees: [] });
      groups.get(key).employees.push(employee);
    }
    return [...groups.entries()];
  }, [filteredEmployees]);

  function resetFilters() {
    setQuery("");
    setTeamFilter("all");
    setTypeFilter("all");
    setYearFilter("all");
    setMonthFilter("all");
  }

  async function exportEmployees() {
    setExporting(true);
    setExportMessage("");
    setError("");
    try {
      const module = await import("xlsx-js-style");
      const XLSX = module.default || module;
      const generatedAt = new Date();
      const title = archived ? "EMPLOYEE ARCHIVE REPORT" : "EMPLOYEE DIRECTORY REPORT";
      const activeFilters = [
        `View: ${archived ? "Resigned employees" : "Current employees"}`,
        `Team: ${teamFilter === "all" ? "All teams" : teams.find((team) => team.id === teamFilter)?.name || "Selected team"}`,
        `Type: ${typeFilter === "all" ? "All types" : typeFilter}`,
        `${archived ? "Resigned" : "Hire"} year: ${yearFilter === "all" ? "All years" : yearFilter}`,
        ...(archived ? [`Month: ${monthFilter === "all" ? "All months" : new Date(Date.UTC(2000, Number(monthFilter), 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`] : []),
        ...(query.trim() ? [`Search: ${query.trim()}`] : []),
      ];
      const headers = ["Employee", "Type", "3CX Code", "Awfar Code", "Awfar User", "Email", "Team", "Hire Date", "Status", "Resign Date", "Tenure"];
      const employeeRows = filteredEmployees.map((employee) => [
        employee.fullName,
        employee.employeeType,
        employee.code3cx || "",
        employee.awfarCode || "",
        employee.awfarUser || "",
        employee.email || "",
        employee.teamName || "Unassigned",
        employee.hireDate ? new Date(`${dateInputValue(employee.hireDate)}T00:00:00.000Z`) : "",
        employee.employmentStatus || "Active",
        employee.resignDate ? new Date(`${dateInputValue(employee.resignDate)}T00:00:00.000Z`) : "",
        formatTenure(employee.hireDate, archived ? employee.resignDate : generatedAt),
      ]);
      const detailsRows = [
        [title],
        [`Generated: ${generatedAt.toLocaleString()}`],
        [`Applied filters: ${activeFilters.join(" | ")}`],
        [],
        headers,
        ...employeeRows,
      ];
      const detailsSheet = XLSX.utils.aoa_to_sheet(detailsRows);
      const headerRow = 4;
      const lastRow = detailsRows.length - 1;
      const lastColumn = headers.length - 1;
      detailsSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } }];
      detailsSheet["!autofilter"] = { ref: `A${headerRow + 1}:${XLSX.utils.encode_cell({ r: lastRow, c: lastColumn })}` };
      detailsSheet["!freeze"] = { xSplit: 0, ySplit: headerRow + 1 };
      detailsSheet["!cols"] = [24, 13, 17, 17, 22, 30, 22, 15, 15, 15, 18].map((wch) => ({ wch }));
      detailsSheet["!rows"] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 34 }, { hpt: 8 }, { hpt: 26 }, ...employeeRows.map(() => ({ hpt: 22 }))];
      detailsSheet.A1.s = {
        fill: { fgColor: { rgb: "173B28" } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 },
        alignment: { vertical: "center" },
      };
      detailsSheet.A2.s = { font: { color: { rgb: "52645A" }, italic: true }, alignment: { vertical: "center" } };
      detailsSheet.A3.s = { font: { color: { rgb: "52645A" } }, alignment: { vertical: "center", wrapText: true } };
      for (let column = 0; column < headers.length; column += 1) {
        const cell = XLSX.utils.encode_cell({ r: headerRow, c: column });
        detailsSheet[cell].s = {
          fill: { fgColor: { rgb: "286343" } },
          font: { bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      }
      for (let row = headerRow + 1; row <= lastRow; row += 1) {
        for (let column = 0; column < headers.length; column += 1) {
          const cell = XLSX.utils.encode_cell({ r: row, c: column });
          detailsSheet[cell].s = {
            fill: { fgColor: { rgb: row % 2 ? "F3F7F3" : "FFFFFF" } },
            font: { color: { rgb: "26382D" } },
            alignment: { vertical: "center", horizontal: column === 7 || column === 9 ? "center" : "left" },
            border: { bottom: { style: "thin", color: { rgb: "D9E3DA" } } },
          };
        }
        for (const column of [7, 9]) {
          const cell = detailsSheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (cell?.t === "d") cell.z = "mmm d, yyyy";
        }
      }

      const teamCounts = new Map();
      for (const employee of filteredEmployees) {
        const name = employee.teamName || "Unassigned";
        teamCounts.set(name, (teamCounts.get(name) || 0) + 1);
      }
      const typeCounts = new Map();
      for (const employee of filteredEmployees) {
        typeCounts.set(employee.employeeType || "Unspecified", (typeCounts.get(employee.employeeType || "Unspecified") || 0) + 1);
      }
      const summaryRows = [
        ["EMPLOYEE REPORT SUMMARY"],
        [`Generated: ${generatedAt.toLocaleString()}`],
        ["Report scope", archived ? "Employee archive" : "Current employees"],
        ["Employees included", filteredEmployees.length],
        ["Applied filters", activeFilters.join(" | ")],
        [],
        ["Employees by team", "Count"],
        ...[...teamCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
        [],
        ["Employees by type", "Count"],
        ...[...typeCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      summarySheet["!cols"] = [{ wch: 30 }, { wch: 24 }];
      summarySheet["!rows"] = [{ hpt: 30 }, { hpt: 22 }, ...summaryRows.slice(2).map(() => ({ hpt: 22 }))];
      summarySheet.A1.s = {
        fill: { fgColor: { rgb: "173B28" } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 },
        alignment: { vertical: "center" },
      };
      for (const index of [6, 8 + teamCounts.size]) {
        const row = summaryRows[index];
        if (!row?.[0]) continue;
        for (let column = 0; column < 2; column += 1) {
          const cell = XLSX.utils.encode_cell({ r: index, c: column });
          if (!summarySheet[cell]) continue;
          summarySheet[cell].s = {
            fill: { fgColor: { rgb: "286343" } },
            font: { bold: true, color: { rgb: "FFFFFF" } },
            alignment: { vertical: "center" },
          };
        }
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
      XLSX.utils.book_append_sheet(workbook, detailsSheet, "Employees");
      XLSX.writeFile(workbook, `Employees_${archived ? "Archive" : "Current"}_${todayValue()}.xlsx`, { compression: true });
      setExportMessage(`Exported ${filteredEmployees.length} employees using the current filters.`);
    } catch {
      setError("Excel export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function openCreate() {
    setEditingEmployee(null);
    setError("");
    setMode("form");
  }

  function openEdit(employee) {
    setEditingEmployee(employee);
    setError("");
    setMode("form");
  }

  async function saveEmployee(draft) {
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.employees.save(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMode("list");
      setEditingEmployee(null);
      await loadData();
    } catch {
      setError("Employee could not be saved. Check the database connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function updateEmploymentDate(date) {
    setSaving(true);
    setError("");
    try {
      const update = dateAction.action === "restore"
        ? await window.qaDesk.employees.restore(dateAction.employee.id, date)
        : await window.qaDesk.employees.resign(dateAction.employee.id, date);
      if (!update.ok) {
        setError(update.message);
        return;
      }
      setDateAction(null);
      await loadData();
    } catch {
      setError("Employment status could not be updated. Check the database connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Permanently delete ${employee.fullName}? Employment history will also be removed.`)) return;
    setBusyEmployee(employee.id);
    setError("");
    try {
      const result = await window.qaDesk.employees.delete(employee.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await loadData();
    } catch {
      setError("Employee could not be deleted. Check the database connection and try again.");
    } finally {
      setBusyEmployee("");
    }
  }

  function cancelEditor() {
    setMode("list");
    setEditingEmployee(null);
    setError("");
  }

  if (mode === "form" && canManageEmployees) {
    return <EmployeeEditor employee={editingEmployee} teams={teams} loading={saving} error={error} onCancel={cancelEditor} onSave={saveEmployee} />;
  }

  return <div className="employees-workspace">
    <section className="employees-summary-grid" aria-label="Employee statistics">
      <article className="employees-summary-card"><span className="employees-summary-icon forest"><Users size={19} /></span><div><span>Total employees</span><strong>{employees.length}</strong></div><small>All employment records</small></article>
      <article className="employees-summary-card"><span className="employees-summary-icon mint"><Activity size={19} /></span><div><span>Active employees</span><strong>{currentEmployees.length}</strong></div><small>Currently working</small></article>
      <article className="employees-summary-card"><span className="employees-summary-icon coral"><Archive size={19} /></span><div><span>Resigned employees</span><strong>{archivedEmployees.length}</strong></div><small>In employee archive</small></article>
      <article className="employees-summary-card"><span className="employees-summary-icon blue"><CalendarDays size={19} /></span><div><span>Hired this year</span><strong>{hiresThisYear}</strong></div><small>Since January {thisYear}</small></article>
    </section>

    <section className="employee-directory">
      <header className="employee-directory-toolbar"><div><span className="employee-eyebrow">PEOPLE OPERATIONS</span><h2>{archived ? "Employee archive" : "Employees"}<span>{filteredEmployees.length}</span></h2><p>{archived ? "Browse previous employment records and return employees." : "Current employees organized by their assigned team."}</p></div><div className="employee-toolbar-actions"><button className="employee-export-button" type="button" onClick={() => void exportEmployees()} disabled={loading || exporting || filteredEmployees.length === 0}><FileSpreadsheet size={16} />{exporting ? "Preparing Excel..." : "Export Excel"}</button><button className={`employee-archive-button ${archived ? "selected" : ""}`} type="button" onClick={() => { setView(archived ? "current" : "archive"); resetFilters(); setError(""); setExportMessage(""); }}><Archive size={16} />{archived ? "Current employees" : "Archive"}</button>{canManage && !archived && <button className="employee-add-button" type="button" onClick={openCreate}><Plus size={17} /> Add employee</button>}</div></header>
      {error && mode === "list" && <div className="employee-error" role="alert"><CircleAlert size={16} />{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}

      <div className="employee-filter-bar">
        <label className="employee-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, codes, Awfar user, email or team" aria-label="Search employees" /></label>
        <label className="employee-filter"><span>Team</span><select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="employee-filter"><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="Agent">Agent</option><option value="Senior">Senior</option></select></label>
        <label className="employee-filter"><span>{archived ? "Resigned year" : "Hire year"}</span><select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">All years</option>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        {archived && <label className="employee-filter"><span>Month</span><select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}><option value="all">All months</option>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Date(Date.UTC(2000, month, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}</option>)}</select></label>}
      </div>

      {exportMessage && <div className="employee-export-message" role="status">{exportMessage}</div>}
      <div className="employee-results-bar"><span><strong>{filteredEmployees.length}</strong> {filteredEmployees.length === 1 ? "employee" : "employees"} {archived ? "in archive" : "in current view"}</span>{(query || teamFilter !== "all" || typeFilter !== "all" || yearFilter !== "all" || monthFilter !== "all") && <button type="button" onClick={resetFilters}>Clear filters <X size={14} /></button>}</div>

      {loading ? (
        <div className="employee-loading"><span className="employee-spinner" /> Loading employees...</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="employee-empty-state">
          <span className="employee-empty-icon">{archived ? <FileClock size={24} /> : <Users size={24} />}</span>
          <h3>{archived ? "No resigned employees" : "No employees yet"}</h3>
          <p>{archived ? "Resigned employees will appear here with their employment history." : canManageEmployees ? "Add your first employee to start tracking team membership and tenure." : "There are no employees to display."}</p>
          {canManageEmployees && !archived && <button className="employee-add-button" type="button" onClick={openCreate} disabled={!teams.length}><Plus size={16} />{teams.length ? "Add first employee" : "Create a team first"}</button>}
        </div>
      ) : (
        <div className="employee-table-viewport">
          <table className="employee-table">
            <thead><tr><th>EMPLOYEE</th><th>3CX</th><th>AWFAR CODE</th><th>AWFAR USER</th><th>EMAIL</th><th>TEAM</th><th>HIRE DATE</th><th>STATUS</th><th>RESIGN DATE</th><th>TENURE</th><th>ACTIONS</th></tr></thead>
            {groupedEmployees.map(([groupId, group]) => (
              <tbody key={groupId} className="employee-team-group">
                <tr className="employee-team-heading"><th colSpan={11}><span className="employee-team-heading-icon"><Users size={15} /></span>{group.name}<span>{group.employees.length} {group.employees.length === 1 ? "employee" : "employees"}</span></th></tr>
                {group.employees.map((employee) => (
                  <EmployeeRow
                    key={employee.id}
                    employee={employee}
                    archived={archived}
                    canManage={canManage}
                    canManageEmployees={canManageEmployees}
                    onEdit={openEdit}
                    onResign={(item) => { setError(""); setDateAction({ action: "resign", employee: item }); }}
                    onRestore={(item) => { setError(""); setDateAction({ action: "restore", employee: item }); }}
                    onDelete={(item) => void deleteEmployee(item)}
                    busy={busyEmployee === employee.id}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <footer className="employee-directory-footer"><span><i /> Dates use your local display timezone</span><span>{archived ? "Employment history is retained when an employee returns." : "Tenure is calculated from hire date through today."}</span></footer>
    </section>

    {dateAction && canManageEmployees && <EmploymentDateDialog action={dateAction.action} employee={dateAction.employee} loading={saving} error={error} onCancel={() => { setDateAction(null); setError(""); }} onConfirm={updateEmploymentDate} />}
  </div>;
}
