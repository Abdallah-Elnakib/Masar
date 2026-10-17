import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  Clock3,
  Headphones,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { EmployeeCallEvaluationFlow, QualityFormsLibrary } from "./QualityEvaluationWorkflows.jsx";
import "./quality-evaluation.css";

function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function numberLabel(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function getSalesZone(employee, salesValue = employee.sales) {
  if (!employee.salesEnabled || !employee.salesZones || salesValue == null || salesValue === "") return null;
  const sales = Number(salesValue);
  if (!Number.isFinite(sales)) return null;
  const { red, yellow, green } = employee.salesZones;
  if (green?.from != null && sales >= Number(green.from)) return "Green";
  if (yellow?.from != null && yellow?.to != null && sales >= Number(yellow.from) && sales <= Number(yellow.to)) return "Yellow";
  if (red?.from != null && red?.to != null && sales >= Number(red.from) && sales <= Number(red.to)) return "Red";
  return "Below range";
}

function EvaluationCard({ employee, month, saving, message, onSave, onStartEvaluation, canEditSales, canEvaluate }) {
  const [draft, setDraft] = useState({ sales: employee.sales ?? "" });
  const target = Number(employee.kpiTarget) || 0;
  const weight = Number(employee.kpiWeight) || 0;
  const evaluated = Number(employee.evaluatedCalls) || 0;
  const score = employee.qualityScore == null ? null : Number(employee.qualityScore);
  const salesZone = getSalesZone(employee, draft.sales);
  const progress = target > 0 ? Math.min((evaluated / target) * 100, 100) : 0;
  const weightedScore = score === null || !weight ? null : (score * weight) / 100;
  const isDirty = String(draft.sales) !== String(employee.sales ?? "");

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return <article className="evaluation-card">
    <header className="evaluation-card-header">
      <span className="evaluation-avatar">{employee.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
      <div className="evaluation-identity"><h3>{employee.fullName}</h3><div><span className={`evaluation-role ${employee.employeeType.toLowerCase()}`}>{employee.employeeType}</span><span className="evaluation-hire-date"><CalendarDays size={13} /> Hired {dateLabel(employee.hireDate)}</span></div></div>
      <span className={`sales-zone ${salesZone ? salesZone.toLowerCase().replaceAll(" ", "-") : "unavailable"}`}><i />{salesZone || (employee.salesEnabled ? "No sales" : "Non-sales")}</span>
    </header>

    <div className="evaluation-identifiers">
      <span><b>AWFAR</b>{employee.awfarCode || "Not assigned"}</span>
      <span><b>3CX</b>{employee.code3cx || "Not assigned"}</span>
    </div>

    <div className="evaluation-card-metrics">
      <section className="evaluation-metric calls-metric">
        <div className="evaluation-metric-heading"><span><Headphones size={15} /> Evaluated calls</span><strong>{numberLabel(evaluated)} <small>/ {target ? numberLabel(target) : "Not set"}</small></strong></div>
        <div className="evaluation-progress"><i style={{ width: `${progress}%` }} /></div>
        <span className="evaluation-metric-foot">{target ? `${Math.round((evaluated / target) * 100)}% of monthly target` : "Set an Evaluated Calls target on the team"}</span>
      </section>
      <section className="evaluation-metric quality-metric">
        <div className="evaluation-metric-heading"><span><ShieldCheck size={15} /> Quality score</span><strong>{score === null ? "—" : `${numberLabel(score)}%`} <small>/ 100%</small></strong></div>
        <div className="quality-weight-detail"><span>Team weight</span><strong>{weight ? `${numberLabel(weight)}%` : "Not set"}</strong><span>Weighted result</span><strong>{weightedScore === null ? "—" : `${numberLabel(weightedScore)} %`}</strong></div>
      </section>
    </div>

    <div className="evaluation-edit-fields">
      <label className="evaluation-entry-field"><span><TrendingUp size={14} />Monthly sales</span><input type="number" min="0" step="any" value={draft.sales} onChange={(event) => update("sales", event.target.value)} disabled={!canEditSales || !employee.salesEnabled} placeholder={!employee.salesEnabled ? "Not a sales team" : canEditSales ? "Enter sales" : "View only"} /></label>
      <div className="evaluation-entry-field evaluation-readonly-field"><span><Headphones size={14} />Calls evaluated</span><strong>{numberLabel(evaluated)} <small>/ {target ? numberLabel(target) : "No target"}</small></strong></div>
      <div className="evaluation-entry-field evaluation-readonly-field"><span><BadgeCheck size={14} />Quality score (%)</span><strong>{score === null ? "—" : `${numberLabel(score)}%`} <small>monthly average</small></strong></div>
    </div>

    <footer className="evaluation-card-footer">
      <span className="evaluation-saved-state">{message || (employee.updatedAt ? `Saved ${new Date(employee.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : `No ${monthLabel(month)} entry yet`)}</span>
      <div className="evaluation-card-actions">{canEvaluate && <button type="button" className="evaluation-start-button" onClick={() => onStartEvaluation(employee)} disabled={!target}><Headphones size={14} />Start evaluation</button>}{canEditSales && <button type="button" className="evaluation-save-button" onClick={() => onSave(employee, draft)} disabled={saving || !isDirty || (draft.sales !== "" && Number(draft.sales) < 0)}>
        {saving ? <span className="evaluation-spinner" /> : <Check size={15} />}{saving ? "Saving..." : "Save month"}
      </button>}</div>
    </footer>
  </article>;
}

export default function QualityEvaluationPage({ evaluatorId, canEditSales = true, canEvaluate = true, user }) {
  const [month, setMonth] = useState(currentMonth);
  const [screen, setScreen] = useState("dashboard");
  const [activeEmployee, setActiveEmployee] = useState(null);
  
  // Manager cannot edit
  const canEditSalesActual = canEditSales && user?.role !== "Manager";
  const canEvaluateActual = canEvaluate && user?.role !== "Manager";
  const canManageFormsActual = user?.role === "Admin";
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingEmployee, setSavingEmployee] = useState("");
  const [saveMessages, setSaveMessages] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.list(month);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEmployees(result.employees);
      setTeams(result.teams);
      setSaveMessages({});
    } catch {
      setError("Monthly quality data could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    if (teamFilter !== "all" && employee.teamId !== teamFilter) return false;
    if (typeFilter !== "all" && employee.employeeType !== typeFilter) return false;
    if (zoneFilter !== "all" && getSalesZone(employee) !== zoneFilter) return false;
    const needle = query.trim().toLocaleLowerCase();
    if (needle && ![employee.fullName, employee.teamName, employee.email, employee.awfarCode, employee.code3cx]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle))) return false;
    return true;
  }), [employees, query, teamFilter, typeFilter, zoneFilter]);

  // Filter teams based on available employees
  const availableTeams = useMemo(() => {
    const teamSet = new Set(employees.map((employee) => employee.teamId));
    return teams.filter((team) => teamSet.has(team.id));
  }, [employees, teams]);

  const groupedEmployees = useMemo(() => {
    const groups = new Map();
    for (const employee of filteredEmployees) {
      if (!groups.has(employee.teamId)) groups.set(employee.teamId, { name: employee.teamName, employees: [] });
      groups.get(employee.teamId).employees.push(employee);
    }
    return [...groups.values()];
  }, [filteredEmployees]);

  const totalSales = employees.reduce((total, employee) => total + (Number(employee.sales) || 0), 0);
  const totalEvaluated = employees.reduce((total, employee) => total + (Number(employee.evaluatedCalls) || 0), 0);
  const totalTarget = employees.reduce((total, employee) => total + (Number(employee.kpiTarget) || 0), 0);
  const scoredEmployees = employees.filter((employee) => employee.qualityScore != null);
  const averageQuality = scoredEmployees.length
    ? scoredEmployees.reduce((total, employee) => total + Number(employee.qualityScore), 0) / scoredEmployees.length
    : null;
  const completedTargets = employees.filter((employee) => Number(employee.kpiTarget) > 0 && Number(employee.evaluatedCalls) >= Number(employee.kpiTarget)).length;

  if (screen === "forms") return <QualityFormsLibrary canManageForms={canManageFormsActual} onBack={() => setScreen("dashboard")} />;
  if (screen === "calls" && activeEmployee && canEvaluate) return <EmployeeCallEvaluationFlow employee={activeEmployee} month={month} evaluatorId={evaluatorId} onBack={() => { setScreen("dashboard"); void loadData(); }} onOpenForms={canManageFormsActual ? () => setScreen("forms") : undefined} />;

  async function saveEvaluation(employee, draft) {
    setSavingEmployee(employee.id);
    setSaveMessages((current) => ({ ...current, [employee.id]: "" }));
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.save({ employeeId: employee.id, month, sales: draft.sales });
      if (!result.ok) {
        setSaveMessages((current) => ({ ...current, [employee.id]: result.message }));
        return;
      }
      setEmployees((current) => current.map((item) => item.id === employee.id ? {
        ...item,
        sales: draft.sales === "" ? null : Number(draft.sales),
        updatedAt: result.updatedAt,
      } : item));
      setSaveMessages((current) => ({ ...current, [employee.id]: "Saved for this month" }));
    } catch {
      setSaveMessages((current) => ({ ...current, [employee.id]: "Could not save monthly data." }));
    } finally {
      setSavingEmployee("");
    }
  }

  return <div className="quality-workspace">
    <section className="quality-summary-grid" aria-label="Monthly quality statistics">
      <article className="quality-summary-card"><span className="quality-summary-icon forest"><Users size={19} /></span><div><span>Team members</span><strong>{employees.length}</strong></div><small>Active employees in teams</small></article>
      <article className="quality-summary-card"><span className="quality-summary-icon blue"><Headphones size={19} /></span><div><span>Calls evaluated</span><strong>{numberLabel(totalEvaluated)} <small>{totalTarget ? `/ ${numberLabel(totalTarget)}` : ""}</small></strong></div><small>{totalTarget ? `${Math.round((totalEvaluated / totalTarget) * 100)}% of configured target` : "Targets are set per team"}</small></article>
      <article className="quality-summary-card"><span className="quality-summary-icon gold"><ShieldCheck size={19} /></span><div><span>Average quality</span><strong>{averageQuality === null ? "—" : `${numberLabel(averageQuality)}%`}</strong></div><small>{scoredEmployees.length} scored employees this month</small></article>
      <article className="quality-summary-card"><span className="quality-summary-icon mint"><TrendingUp size={19} /></span><div><span>Monthly sales</span><strong>{numberLabel(totalSales)}</strong></div><small>{completedTargets} call targets completed</small></article>
    </section>

    <section className="quality-directory">
      <header className="quality-directory-heading"><div><span className="quality-eyebrow">QUALITY OPERATIONS</span><h2>Quality evaluation</h2><p>Monthly employee results, grouped by their assigned team.</p></div><div className="quality-heading-actions"><button className="quality-forms-button" type="button" onClick={() => setScreen("forms")}><ClipboardList size={16} />Forms</button><label className="quality-month-picker"><CalendarDays size={17} /><span>Evaluation month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} /></label></div></header>
      {error && <div className="quality-page-error" role="alert"><CircleAlert size={16} />{error}</div>}
      <div className="quality-filter-bar">
        <label className="quality-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees, codes or teams" aria-label="Search evaluations" /></label>
        <label><span>Team</span><select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="all">All teams</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label><span>Employee type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="Agent">Agent</option><option value="Senior">Senior</option></select></label>
        <label><span>Sales zone</span><select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}><option value="all">All zones</option><option value="Green">Green</option><option value="Yellow">Yellow</option><option value="Red">Red</option><option value="Below range">Below range</option></select></label>
      </div>

      <div className="quality-period-strip"><span><CalendarDays size={15} /> Showing results for <strong>{monthLabel(month)}</strong></span><span>{filteredEmployees.length} of {employees.length} employees</span></div>

      {loading ? <div className="quality-empty-state"><span className="quality-spinner" /><p>Loading monthly evaluations...</p></div> : employees.length === 0 ? <div className="quality-empty-state"><span className="quality-empty-icon"><Users size={25} /></span><h3>No active employees to evaluate</h3><p>Add employees to a team to see monthly evaluation cards here.</p></div> : filteredEmployees.length === 0 ? <div className="quality-empty-state compact"><Search size={23} /><p>No employees match the selected filters.</p></div> : <div className="quality-team-groups">{groupedEmployees.map((group) => <section className="quality-team-section" key={group.name}>
        <header className="quality-team-heading"><span className="quality-team-icon"><Users size={17} /></span><div><h3>{group.name}</h3><span>{group.employees.length} {group.employees.length === 1 ? "employee" : "employees"}</span></div><span className="quality-team-total"><Activity size={15} />{numberLabel(group.employees.reduce((total, employee) => total + (Number(employee.evaluatedCalls) || 0), 0))} calls evaluated</span></header>
        <div className="evaluation-card-grid">{group.employees.map((employee) => <EvaluationCard key={`${employee.id}-${month}-${employee.sales ?? ""}`} employee={employee} month={month} saving={savingEmployee === employee.id} message={saveMessages[employee.id]} onSave={saveEvaluation} canEditSales={canEditSalesActual} canEvaluate={canEvaluateActual} onStartEvaluation={(item) => { setActiveEmployee(item); setScreen("calls"); }} />)}</div>
      </section>)}</div>}
    </section>
  </div>;
}
