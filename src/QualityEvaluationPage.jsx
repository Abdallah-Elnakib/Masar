import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
  Filter,
  MoreVertical,
  Download,
  RefreshCw,
  Sparkles,
  Award,
  Star,
  Zap,
  X,
  Pencil,
  RotateCcw,
  UserMinus,
  Trash2,
} from "lucide-react";
import { EmployeeCallEvaluationFlow, QualityFormsLibrary } from "./QualityEvaluationWorkflows.jsx";
import { EmployeeEditor, EmploymentDateDialog } from "./EmployeesPage.jsx";
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

function EvaluationCard({ employee, month, saving, message, onSave, onStartEvaluation, canEditSales, canEvaluate, canManageEmployees, user, onEdit, onResign, onRestore, onDelete, openMenuId, setOpenMenuId }) {
  const [draft, setDraft] = useState({ sales: employee.sales ?? "" });
  const menuRef = useRef(null);
  const target = Number(employee.kpiTarget) || 0;
  const weight = Number(employee.kpiWeight) || 0;
  const evaluated = Number(employee.evaluatedCalls) || 0;
  const score = employee.qualityScore == null ? null : Number(employee.qualityScore);
  const salesZone = getSalesZone(employee, draft.sales);
  const progress = target > 0 ? Math.min((evaluated / target) * 100, 100) : 0;
  const weightedScore = score === null || !weight ? null : (score * weight) / 100;
  const isDirty = String(draft.sales) !== String(employee.sales ?? "");
  const menuOpen = openMenuId === employee.id;

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen, setOpenMenuId]);

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const getScoreColor = (score) => {
    if (score == null) return "neutral";
    if (score >= 90) return "excellent";
    if (score >= 80) return "good";
    if (score >= 70) return "fair";
    return "poor";
  };

  const scoreColor = getScoreColor(score);

  return <article className="evaluation-card">
    <div className="card-header">
      <div className="employee-info">
        <div className="employee-avatar">
          {employee.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
        </div>
        <div className="employee-details">
          <h3>{employee.fullName}</h3>
          <div className="employee-meta">
            <span className={`role-badge ${employee.employeeType.toLowerCase()}`}>{employee.employeeType}</span>
            <span className="hire-date"><CalendarDays size={11} /> {dateLabel(employee.hireDate)}</span>
          </div>
        </div>
      </div>
      <div className="card-actions">
        <div className="dropdown-container" ref={menuRef}>
          <button className="icon-button" aria-label="More options" onClick={() => setOpenMenuId(menuOpen ? null : employee.id)}>
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="dropdown-menu">
              <button className="dropdown-item" disabled={!canManageEmployees} onClick={() => { if (canManageEmployees) { setOpenMenuId(null); onEdit(employee); } }}>
                <Pencil size={14} />
                Edit
                {!canManageEmployees && <small>Manage employees required</small>}
              </button>
              {employee.employmentStatus === "Resigned" ? (
                <button className="dropdown-item" disabled={!canManageEmployees} onClick={() => { if (canManageEmployees) { setOpenMenuId(null); onRestore(employee); } }}>
                  <RotateCcw size={14} />
                  Restore
                  {!canManageEmployees && <small>Manage employees required</small>}
                </button>
              ) : (
                <button className="dropdown-item" disabled={!canManageEmployees} onClick={() => { if (canManageEmployees) { setOpenMenuId(null); onResign(employee); } }}>
                  <UserMinus size={14} />
                  Resign
                  {!canManageEmployees && <small>Manage employees required</small>}
                </button>
              )}
              <button className="dropdown-item danger" disabled={!canManageEmployees} onClick={() => { if (canManageEmployees) { setOpenMenuId(null); onDelete(employee); } }}>
                <Trash2 size={14} />
                Delete
                {!canManageEmployees && <small>Manage employees required</small>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    <div className="card-identifiers">
      <div className="identifier-item">
        <span className="identifier-label">AWFAR</span>
        <span className="identifier-value">{employee.awfarCode || "—"}</span>
      </div>
      <div className="identifier-item">
        <span className="identifier-label">3CX</span>
        <span className="identifier-value">{employee.code3cx || "—"}</span>
      </div>
      {salesZone && (
        <div className={`zone-badge ${salesZone.toLowerCase().replaceAll(" ", "-")}`}>
          <Sparkles size={11} />
          {salesZone}
        </div>
      )}
    </div>

    <div className="card-metrics">
      <div className="metric-card">
        <div className="metric-header">
          <div className="metric-icon calls-icon">
            <Headphones size={16} />
          </div>
          <span className="metric-label">Calls</span>
        </div>
        <div className="metric-value">
          <strong>{numberLabel(evaluated)}</strong>
          <span className="metric-target">/ {target ? numberLabel(target) : "—"}</span>
        </div>
        <div className="metric-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">{target ? `${Math.round((evaluated / target) * 100)}%` : "—"}</span>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-header">
          <div className={`metric-icon quality-icon ${scoreColor}`}>
            <ShieldCheck size={16} />
          </div>
          <span className="metric-label">Quality</span>
        </div>
        <div className="metric-value">
          <strong className={scoreColor}>{score === null ? "—" : `${numberLabel(score)}%`}</strong>
          <span className="metric-target">/ 100%</span>
        </div>
        <div className="metric-details">
          <div className="detail-item">
            <span>Weight</span>
            <strong>{weight ? `${numberLabel(weight)}%` : "—"}</strong>
          </div>
          <div className="detail-item">
            <span>Weighted</span>
            <strong>{weightedScore === null ? "—" : `${numberLabel(weightedScore)}%`}</strong>
          </div>
        </div>
      </div>
    </div>

    <div className="card-fields">
      {employee.salesEnabled && (
        <div className="field-group">
          <label className="field-label">
            <TrendingUp size={12} />
            Monthly Sales
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={draft.sales}
            onChange={(event) => update("sales", event.target.value)}
            disabled={!canEditSales}
            placeholder={canEditSales ? "Enter sales" : "View only"}
            className="field-input"
          />
        </div>
      )}
    </div>

    <div className="card-footer">
      <div className="footer-status">
        {message && <span className="status-message">{message}</span>}
        {!message && employee.updatedAt && (
          <span className="last-saved">
            <Check size={11} />
            Saved {new Date(employee.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="footer-actions">
        {canEvaluate && (
          <button
            type="button"
            className="action-button primary-button"
            onClick={() => onStartEvaluation(employee)}
            disabled={!target}
          >
            <Headphones size={14} />
            Start
          </button>
        )}
        {canEditSales && employee.salesEnabled && (
          <button
            type="button"
            className="action-button secondary-button"
            onClick={() => onSave(employee, draft)}
            disabled={saving || !isDirty || (draft.sales !== "" && Number(draft.sales) < 0)}
          >
            {saving ? <RefreshCw size={14} className="spinner" /> : <Check size={14} />}
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  </article>;
}

export default function QualityEvaluationPage({ evaluatorId, canEditSales = true, canEvaluate = true, canManageEmployees = false, user }) {
  const [month, setMonth] = useState(currentMonth);
  const [screen, setScreen] = useState("dashboard");
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [mode, setMode] = useState("list");
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [dateAction, setDateAction] = useState(null);
  const [busyEmployee, setBusyEmployee] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);

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
  const [saving, setSaving] = useState(false);

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
  if (mode === "employee-form" && canManageEmployees) {
    return <EmployeeEditor employee={editingEmployee} teams={teams} loading={saving} error={error} onCancel={cancelEditor} onSave={saveEmployee} />;
  }

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

  function openEdit(employee) {
    setEditingEmployee(employee);
    setError("");
    setMode("employee-form");
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

  function openResign(employee) {
    setError("");
    setDateAction({ action: "resign", employee });
  }

  function openRestore(employee) {
    setError("");
    setDateAction({ action: "restore", employee });
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

  return <div className="quality-workspace">
    <div className="workspace-header">
      <div className="header-content">
        <div className="header-badges">
          <span className="badge badge-primary">
            <Award size={14} />
            Quality Operations
          </span>
          <span className="badge badge-secondary">
            <Star size={14} />
            Premium
          </span>
        </div>
        <h1>Quality Evaluation</h1>
        <p>Monitor and evaluate team performance with comprehensive quality metrics</p>
      </div>
      <div className="header-actions">
        <button className="action-btn" onClick={() => setScreen("forms")}>
          <ClipboardList size={18} />
          Forms
        </button>
        <button className="action-btn secondary">
          <Download size={18} />
          Export
        </button>
        <button className="action-btn icon-only" onClick={() => void loadData()}>
          <RefreshCw size={18} />
        </button>
      </div>
    </div>

    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon users">
          <Users size={24} />
        </div>
        <div className="stat-content">
          <span className="stat-label">Team Members</span>
          <strong className="stat-value">{employees.length}</strong>
          <span className="stat-sub">Active employees</span>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon calls">
          <Headphones size={24} />
        </div>
        <div className="stat-content">
          <span className="stat-label">Calls Evaluated</span>
          <strong className="stat-value">{numberLabel(totalEvaluated)}</strong>
          <span className="stat-sub">{totalTarget ? `${Math.round((totalEvaluated / totalTarget) * 100)}% of target` : "—"}</span>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon quality">
          <ShieldCheck size={24} />
        </div>
        <div className="stat-content">
          <span className="stat-label">Average Quality</span>
          <strong className="stat-value">{averageQuality === null ? "—" : `${numberLabel(averageQuality)}%`}</strong>
          <span className="stat-sub">{scoredEmployees.length} scored</span>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon sales">
          <TrendingUp size={24} />
        </div>
        <div className="stat-content">
          <span className="stat-label">Monthly Sales</span>
          <strong className="stat-value">{numberLabel(totalSales)}</strong>
          <span className="stat-sub">{completedTargets} targets met</span>
        </div>
      </div>
    </div>

    <div className="content-section">
      <div className="section-header">
        <div className="section-title">
          <h2>Employee Evaluations</h2>
          <span className="period-badge">
            <CalendarDays size={14} />
            {monthLabel(month)}
          </span>
        </div>
        <div className="section-actions">
          <div className="month-selector">
            <CalendarDays size={16} />
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonth())}
            />
          </div>
        </div>
      </div>

      {error && <div className="error-banner">
        <CircleAlert size={20} />
        <span>{error}</span>
        <button onClick={() => setError("")}>
          <X size={18} />
        </button>
      </div>}

      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employees, codes or teams..."
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">
            <Filter size={14} />
            Team
          </label>
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="all">All teams</option>
            {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">
            <Filter size={14} />
            Type
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="Agent">Agent</option>
            <option value="Senior">Senior</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">
            <Filter size={14} />
            Zone
          </label>
          <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
            <option value="all">All zones</option>
            <option value="Green">Green</option>
            <option value="Yellow">Yellow</option>
            <option value="Red">Red</option>
            <option value="Below range">Below range</option>
          </select>
        </div>
      </div>

      <div className="results-info">
        <span>Showing {filteredEmployees.length} of {employees.length} employees</span>
      </div>

      {loading ? <div className="loading-state">
        <RefreshCw size={32} className="spinner" />
        <p>Loading evaluations...</p>
      </div> : employees.length === 0 ? <div className="empty-state">
        <div className="empty-icon">
          <Users size={48} />
        </div>
        <h3>No employees to evaluate</h3>
        <p>Add employees to a team to see monthly evaluation cards here.</p>
      </div> : filteredEmployees.length === 0 ? <div className="empty-state">
        <div className="empty-icon">
          <Search size={48} />
        </div>
        <h3>No matching employees</h3>
        <p>Try adjusting your filters or search terms.</p>
      </div> : <div className="team-grid">{groupedEmployees.map((group) => <section className="team-section" key={group.name}>
        <div className="team-header">
          <div className="team-info">
            <div className="team-icon">
              <Users size={20} />
            </div>
            <div>
              <h3>{group.name}</h3>
              <span>{group.employees.length} {group.employees.length === 1 ? "employee" : "employees"}</span>
            </div>
          </div>
          <div className="team-stats">
            <span className="team-stat">
              <Activity size={16} />
              {numberLabel(group.employees.reduce((total, employee) => total + (Number(employee.evaluatedCalls) || 0), 0))} calls
            </span>
          </div>
        </div>
        <div className="cards-grid">{group.employees.map((employee) => <EvaluationCard key={`${employee.id}-${month}-${employee.sales ?? ""}`} employee={employee} month={month} saving={savingEmployee === employee.id} message={saveMessages[employee.id]} onSave={saveEvaluation} canEditSales={canEditSalesActual} canEvaluate={canEvaluateActual} canManageEmployees={canManageEmployees} user={user} onStartEvaluation={(item) => { setActiveEmployee(item); setScreen("calls"); }} onEdit={openEdit} onResign={openResign} onRestore={openRestore} onDelete={deleteEmployee} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} />)}</div>
      </section>)}</div>}
    </div>

    {dateAction && canManageEmployees && <EmploymentDateDialog action={dateAction.action} employee={dateAction.employee} loading={saving} error={error} onCancel={() => { setDateAction(null); setError(""); }} onConfirm={updateEmploymentDate} />}
  </div>;
}
