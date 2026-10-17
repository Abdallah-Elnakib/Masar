import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  CircleAlert,
  Pencil,
  Save,
  Search,
  Target,
  Users,
  X,
  SlidersHorizontal,
} from "lucide-react";
import "./custom-kpi.css";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function calculateAchievement(actual, target) {
  if (!target || target === 0) return 0;
  return Math.min(100, (actual / target) * 100);
}

function calculateWeightedScore(achievement, weight) {
  if (!weight || weight === 0) return 0;
  return (achievement / 100) * weight;
}

function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function customKpiStorageKey(name) {
  return encodeURIComponent(name).replaceAll(".", "%2E");
}

function getCustomKpiActual(employee, kpiName, month) {
  const monthly = employee.customKpiAchievementsByMonth || {};
  const key = customKpiStorageKey(kpiName);
  if (Object.hasOwn(monthly[month] || {}, key)) return Number(monthly[month][key] ?? 0);
  return month === currentMonth() ? Number(employee.customKpiAchievements?.[kpiName] || 0) : 0;
}

function getManualKpiValue(employee, month) {
  const monthly = employee.manualKpiByMonth || {};
  if (Object.hasOwn(monthly, month)) return Number(monthly[month] ?? 0);
  return month === currentMonth() ? Number(employee.manualKpi || 0) : 0;
}

export default function CustomKpiPage({ user }) {
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [customKpis, setCustomKpis] = useState([]);
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingActual, setEditingActual] = useState(null);
  const [actualValue, setActualValue] = useState("");
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetValue, setTargetValue] = useState("");
  const [showManualKpiModal, setShowManualKpiModal] = useState(false);
  const [manualKpiValues, setManualKpiValues] = useState({});
  const [manualKpiSaving, setManualKpiSaving] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedKpiTeam, setSelectedKpiTeam] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [manualKpiMonth, setManualKpiMonth] = useState(currentMonth);
  const [manualKpiQuery, setManualKpiQuery] = useState("");
  const [manualKpiKpiRange, setManualKpiKpiRange] = useState({ min: 0, max: 100 });
  
  const canEditCustomKpi = user?.role === "Admin" || user?.permissions?.canManageEmployees === true;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamsResult, employeesResult] = await Promise.all([
        window.qaDesk.teams.list(),
        window.qaDesk.employees.list(),
      ]);

      if (!teamsResult.ok) {
        setError(teamsResult.message);
        return;
      }
      if (!employeesResult.ok) {
        setError(employeesResult.message);
        return;
      }

      setTeams(teamsResult.teams);
      setEmployees(employeesResult.employees);

      // Extract custom KPIs from teams
      const customKpiList = [];
      teamsResult.teams.forEach((team) => {
        const agentCustom = team.kpis?.agent?.custom || [];
        const seniorCustom = team.kpis?.senior?.custom || [];
        
        agentCustom.forEach((kpi) => {
          if (!customKpiList.find((k) => k.name === kpi.name && k.level === "agent")) {
            customKpiList.push({
              id: kpi.id,
              name: kpi.name,
              level: "agent",
              weight: kpi.weight,
              enabled: kpi.enabled,
            });
          }
        });

        seniorCustom.forEach((kpi) => {
          if (!customKpiList.find((k) => k.name === kpi.name && k.level === "senior")) {
            customKpiList.push({
              id: kpi.id,
              name: kpi.name,
              level: "senior",
              weight: kpi.weight,
              enabled: kpi.enabled,
            });
          }
        });
      });

      setCustomKpis(customKpiList);
      if (customKpiList.length > 0 && !selectedKpi) {
        setSelectedKpi(customKpiList[0]);
      }
    } catch {
      setError("Data could not be loaded. Check the database connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedKpi]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredEmployees = useMemo(() => {
    if (!selectedKpi) return [];

    const normalizedQuery = query.trim().toLocaleLowerCase();
    return employees.filter((employee) => {
      if (employee.employmentStatus !== "Active") return false;
      if (selectedKpiTeam !== "all" && employee.teamId !== selectedKpiTeam) return false;

      const employeeTeam = teams.find((t) => t.id === employee.teamId);
      if (!employeeTeam) return false;

      // Check if this team has this custom KPI
      const teamKpis = employee.employeeType === "Agent"
        ? employeeTeam.kpis?.agent?.custom || []
        : employeeTeam.kpis?.senior?.custom || [];

      const hasKpi = teamKpis.some((kpi) => kpi.name === selectedKpi.name && kpi.enabled);
      if (!hasKpi) return false;

      if (!normalizedQuery) return true;
      return [employee.fullName, employee.code3cx, employee.awfarCode, employee.email, employeeTeam.teamName]
        .some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [query, employees, teams, selectedKpi, selectedKpiTeam]);

  const manualKpiFilteredEmployees = useMemo(() => {
    const normalizedQuery = manualKpiQuery.trim().toLocaleLowerCase();
    return employees.filter((employee) => {
      if (employee.employmentStatus !== "Active") return false;

      const employeeTeam = teams.find((t) => t.id === employee.teamId);
      if (!employeeTeam) return false;

      // Filter by team
      if (selectedTeam !== "all" && employee.teamId !== selectedTeam) return false;

      // Filter by search query
      if (normalizedQuery) {
        const matchesSearch = [employee.fullName, employee.code3cx, employee.awfarCode, employee.email, employeeTeam.teamName]
          .some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery));
        if (!matchesSearch) return false;
      }

      // Filter by KPI range
      const currentKpi = getManualKpiValue(employee, manualKpiMonth);
      if (currentKpi < manualKpiKpiRange.min || currentKpi > manualKpiKpiRange.max) return false;

      return true;
    });
  }, [manualKpiQuery, employees, teams, selectedTeam, manualKpiKpiRange, manualKpiMonth]);

  const employeesByTeam = useMemo(() => {
    const grouped = {};
    manualKpiFilteredEmployees.forEach((employee) => {
      const teamId = employee.teamId || "unassigned";
      if (!grouped[teamId]) {
        grouped[teamId] = {
          team: teams.find((t) => t.id === teamId) || { teamName: "Unassigned" },
          employees: [],
        };
      }
      grouped[teamId].employees.push(employee);
    });
    return grouped;
  }, [manualKpiFilteredEmployees, teams]);

  const tableData = useMemo(() => {
    if (!selectedKpi) return [];

    return filteredEmployees.map((employee) => {
      const employeeTeam = teams.find((t) => t.id === employee.teamId);
      const teamKpis = employee.employeeType === "Agent" 
        ? employeeTeam.kpis?.agent?.custom || []
        : employeeTeam.kpis?.senior?.custom || [];
      
      const monthlyTargets = employee.customKpiTargetsByMonth?.[selectedMonth] || {};
      const targetKey = customKpiStorageKey(selectedKpi.name);
      const target = Object.hasOwn(monthlyTargets, targetKey) ? Number(monthlyTargets[targetKey] ?? 0) : 0;
      
      // Get actual achievement from employee data
      const actual = getCustomKpiActual(employee, selectedKpi.name, selectedMonth);
      const achievement = calculateAchievement(actual, target);
      const weightedScore = calculateWeightedScore(achievement, selectedKpi.weight);

      return {
        employee,
        team: employeeTeam,
        target,
        actual,
        achievement,
        weightedScore,
      };
    });
  }, [filteredEmployees, teams, selectedKpi, selectedMonth]);

  async function updateEmployeeActual(employeeId, newActual) {
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.employees.updateCustomKpiActual({
        employeeId,
        kpiName: selectedKpi.name,
        month: selectedMonth,
        actual: Number(newActual),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      await loadData();
      setEditingActual(null);
      setActualValue("");
    } catch {
      setError("Actual value could not be updated. Check the database connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function updateEmployeeTarget(employeeId, newTarget) {
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.employees.updateCustomKpiTarget({
        employeeId,
        kpiName: selectedKpi.name,
        month: selectedMonth,
        target: newTarget,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await loadData();
      setEditingTarget(null);
      setTargetValue("");
    } catch {
      setError("Target could not be updated. Check the database connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(employeeId, currentActual) {
    setEditingActual(employeeId);
    setActualValue(String(currentActual));
  }

  function cancelEditing() {
    setEditingActual(null);
    setActualValue("");
  }

  function startEditingTarget(employeeId, currentTarget) {
    setEditingTarget(employeeId);
    setTargetValue(currentTarget ? String(currentTarget) : "");
  }

  function cancelEditingTarget() {
    setEditingTarget(null);
    setTargetValue("");
  }

  function openManualKpiModal() {
    setShowManualKpiModal(true);
    setSelectedTeam("all");
    setManualKpiQuery("");
    setManualKpiKpiRange({ min: 0, max: 100 });
    // Initialize manual KPI values from current employee data
    const initialValues = {};
    employees.forEach((employee) => {
      initialValues[employee.id] = getManualKpiValue(employee, manualKpiMonth);
    });
    setManualKpiValues(initialValues);
  }

  function closeManualKpiModal() {
    setShowManualKpiModal(false);
    setManualKpiValues({});
  }

  async function saveManualKpi() {
    setManualKpiSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.employees.updateManualKpi({
        month: manualKpiMonth,
        updates: manualKpiValues,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      await loadData();
      closeManualKpiModal();
    } catch {
      setError("Manual KPI could not be saved. Check the database connection and try again.");
    } finally {
      setManualKpiSaving(false);
    }
  }

  if (loading) {
    return <div className="custom-kpi-page">
      <div className="page-loading"><span className="spinner" /> Loading custom KPI data...</div>
    </div>;
  }

  return <div className="custom-kpi-page">
    <section className="custom-kpi-header">
      <div>
        <span className="eyebrow">CUSTOM KPI MANAGEMENT</span>
        <h2>Custom KPI targets</h2>
        <p>Manage monthly targets and actual performance for each employee across your teams.</p>
      </div>
      {canEditCustomKpi && <button
        className="manual-kpi-button"
        onClick={openManualKpiModal}
        disabled={loading}
      >
        <SlidersHorizontal size={16} />
        Manual KPI
      </button>}
    </section>

    <section className="custom-kpi-selector">
      {customKpis.length > 0 ? <div className="kpi-tabs">
        {customKpis.map((kpi) => (
          <button
            key={kpi.id}
            className={`kpi-tab ${selectedKpi?.id === kpi.id ? "active" : ""}`}
            onClick={() => setSelectedKpi(kpi)}
          >
            <span>{kpi.name}</span>
            <small>{kpi.level} · {kpi.weight}% weight</small>
          </button>
        ))}
      </div> : <div className="empty-results"><p>No custom KPIs are configured. Manual KPI values can still be managed.</p></div>}
    </section>

    {selectedKpi && (
      <section className="custom-kpi-content">
        <div className="kpi-details">
          <div className="kpi-detail-item">
            <span className="label">KPI Name</span>
            <strong>{selectedKpi.name}</strong>
          </div>
          <div className="kpi-detail-item">
            <span className="label">Level</span>
            <strong>{selectedKpi.level}</strong>
          </div>
          <div className="kpi-detail-item">
            <span className="label">Weight</span>
            <strong>{selectedKpi.weight}%</strong>
          </div>
          <div className="kpi-detail-item">
            <span className="label">Status</span>
            <span className={`status ${selectedKpi.enabled ? "active" : "disabled"}`}>
              {selectedKpi.enabled ? "Active" : "Disabled"}
            </span>
          </div>
        </div>

        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employees..."
              aria-label="Search employees"
            />
          </div>
          <div className="custom-kpi-filters">
            <label>Team<select value={selectedKpiTeam} onChange={(event) => setSelectedKpiTeam(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}</select></label>
            <label>Month<input type="month" value={selectedMonth} max={currentMonth()} onChange={(event) => setSelectedMonth(event.target.value)} /></label>
          </div>
        </div>

        {error && <div className="inline-error" role="alert"><CircleAlert size={15} />{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}

        <div className="table-scroll">
          <table className="custom-kpi-table">
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>TEAM</th>
                <th>CODES</th>
                <th>{selectedMonth} TARGET</th>
                <th>ACTUAL</th>
                <th>ACHIEVEMENT %</th>
                <th>WEIGHTED SCORE</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tableData.map(({ employee, team, target, actual, achievement, weightedScore }) => (
                <tr key={employee.id}>
                  <td><strong>{employee.fullName}</strong></td>
                  <td>{team?.teamName || "—"}</td>
                  <td>
                    <div className="codes-cell">
                      {employee.code3cx && <span>3CX: {employee.code3cx}</span>}
                      {employee.awfarCode && <span>Afwar: {employee.awfarCode}</span>}
                    </div>
                  </td>
                  <td>
                    {editingTarget === employee.id ? (
                      <div className="actual-edit">
                        <input type="number" min="0.01" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} disabled={saving} aria-label={`Monthly target for ${employee.fullName}`} />
                        <button className="icon-button small" type="button" onClick={() => updateEmployeeTarget(employee.id, targetValue)} disabled={saving} title="Save monthly target" aria-label="Save monthly target"><Save size={14} /></button>
                        <button className="icon-button small" type="button" onClick={cancelEditingTarget} disabled={saving} title="Cancel" aria-label="Cancel target edit"><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="actual-display">
                        <span>{target || "—"}</span>
                        {canEditCustomKpi && <button className="icon-button small" type="button" onClick={() => startEditingTarget(employee.id, target)} title="Edit monthly target" aria-label={`Edit monthly target for ${employee.fullName}`}><Pencil size={14} /></button>}
                      </div>
                    )}
                  </td>
                  <td>
                    {editingActual === employee.id ? (
                      <div className="actual-edit">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={actualValue}
                          onChange={(e) => setActualValue(e.target.value)}
                          disabled={saving}
                        />
                        <button
                          className="icon-button small"
                          onClick={() => updateEmployeeActual(employee.id, actualValue)}
                          disabled={saving}
                          title="Save"
                        >
                          <Save size={14} />
                        </button>
                        <button
                          className="icon-button small"
                          onClick={cancelEditing}
                          disabled={saving}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="actual-display">
                        <span>{actual || "—"}</span>
                        {canEditCustomKpi && <button
                          className="icon-button small"
                          onClick={() => startEditing(employee.id, actual)}
                          title="Edit actual"
                        >
                          <Pencil size={14} />
                        </button>}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`achievement-badge ${achievement >= 100 ? "excellent" : achievement >= 80 ? "good" : achievement >= 60 ? "fair" : "poor"}`}>
                      {achievement.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span className="weighted-score">{weightedScore.toFixed(2)}%</span>
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tableData.length === 0 && (
          <div className="empty-results">
            <p>No employees found with this custom KPI.</p>
          </div>
        )}

        <div className="table-foot">
          <span>Showing {tableData.length} employees</span>
          <span>Updated just now</span>
        </div>
      </section>
    )}

    {showManualKpiModal && (
      <div className="modal-overlay" onClick={closeManualKpiModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Manual KPI Adjustment</h3>
            <button className="modal-close" onClick={closeManualKpiModal}>
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-description">
              Set manual KPI values for all active employees. These values will override the calculated KPI in the Dashboard.
            </p>
            <div className="manual-kpi-filters">
              <div className="filter-group">
                <label>
                  Team
                  <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                    <option value="all">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.teamName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Month
                  <input type="month" value={manualKpiMonth} max={currentMonth()} onChange={(e) => setManualKpiMonth(e.target.value)} />
                </label>
                <label>
                  Search
                  <input
                    type="search"
                    placeholder="Search employee, 3CX, Awfar..."
                    value={manualKpiQuery}
                    onChange={(e) => setManualKpiQuery(e.target.value)}
                  />
                </label>
                <label>
                  KPI from
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={manualKpiKpiRange.min}
                    onChange={(e) => setManualKpiKpiRange((prev) => ({ ...prev, min: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  KPI to
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={manualKpiKpiRange.max}
                    onChange={(e) => setManualKpiKpiRange((prev) => ({ ...prev, max: Number(e.target.value) }))}
                  />
                </label>
              </div>
            </div>
            <div className="manual-kpi-list">
              {Object.entries(employeesByTeam).map(([teamId, { team, employees: teamEmployees }]) => (
                <div key={teamId} className="team-section">
                  <div className="team-header">
                    <strong>{team.teamName}</strong>
                    <span>{teamEmployees.length} employees</span>
                  </div>
                  <div className="team-employees">
                    {teamEmployees.map((employee) => (
                      <div key={employee.id} className="manual-kpi-item">
                        <div className="employee-info">
                          <strong>{employee.fullName}</strong>
                          <small>{employee.code3cx || employee.awfarCode || "—"}</small>
                        </div>
                        <label className="manual-kpi-input">
                          <span>Manual KPI %</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={manualKpiValues[employee.id] || 0}
                            onChange={(e) =>
                              setManualKpiValues((prev) => ({
                                ...prev,
                                [employee.id]: Number(e.target.value),
                              }))
                            }
                            disabled={manualKpiSaving}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(employeesByTeam).length === 0 && (
                <div className="empty-results">
                  <p>No employees match the current filters.</p>
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-button secondary" onClick={closeManualKpiModal} disabled={manualKpiSaving}>
              Cancel
            </button>
            <button className="modal-button primary" onClick={saveManualKpi} disabled={manualKpiSaving}>
              {manualKpiSaving ? <span className="spinner small" /> : <Save size={16} />}
              {manualKpiSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}