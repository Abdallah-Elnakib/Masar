import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleAlert,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

const KPI_DEFINITIONS = [
  { key: "evaluatedCalls", label: "Evaluated calls" },
  { key: "talkingTimeHours", label: "Talking time hours" },
  { key: "dailyCalls", label: "Daily calls" },
];

function createMetric(custom = false) {
  return { enabled: true, ...(custom ? {} : { target: "" }), weight: "" };
}

function createKpiGroup() {
  return {
    evaluatedCalls: createMetric(),
    talkingTimeHours: createMetric(),
    dailyCalls: createMetric(),
    custom: [],
  };
}

function createSalesProfile() {
  return {
    red: { from: "", to: "" },
    yellow: { from: "", to: "" },
    green: { from: "" },
    greenZoneOverride: false,
    redZoneOverride: false,
  };
}

function createBlankTeam() {
  return {
    teamName: "",
    teamLeader: { name: "", email: "" },
    qualityOwnerId: "",
    kpis: { agent: createKpiGroup(), senior: createKpiGroup() },
    performance: { enabled: false, agent: createSalesProfile(), senior: createSalesProfile() },
  };
}

function prepareTeam(team) {
  const blank = createBlankTeam();
  return {
    ...blank,
    ...team,
    teamLeader: { ...blank.teamLeader, ...team.teamLeader },
    qualityOwnerId: team.qualityOwnerId || "",
    kpis: {
      agent: { ...blank.kpis.agent, ...team.kpis?.agent },
      senior: { ...blank.kpis.senior, ...team.kpis?.senior },
    },
    performance: {
      ...blank.performance,
      ...team.performance,
      agent: { ...blank.performance.agent, ...team.performance?.agent },
      senior: { ...blank.performance.senior, ...team.performance?.senior },
    },
  };
}

function metricWeightTotal(group) {
  return [group.evaluatedCalls, group.talkingTimeHours, group.dailyCalls, ...(group.custom || [])]
    .reduce((total, metric) => total + (metric.enabled ? Number(metric.weight) || 0 : 0), 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function MetricToggleRow({ metric, label, onChange, onRemove, custom = false }) {
  return <div className={`team-kpi-row ${metric.enabled ? "" : "is-disabled"}`}>
    {custom ? <div className="custom-kpi-name">
      <input className="team-text-input" value={metric.name} onChange={(event) => onChange({ name: event.target.value })} aria-label="Additional KPI name" placeholder="KPI name" required />
      <button className="team-icon-button destructive" type="button" onClick={onRemove} title="Remove KPI" aria-label="Remove KPI"><X size={15} /></button>
    </div> : null}
    <label className="team-kpi-toggle">
      <input type="checkbox" checked={metric.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
      <span className="team-checkbox"><Check size={12} /></span>
      <span>{label}</span>
    </label>
    {!custom && <label className="team-small-field"><span>Target</span><input className="team-text-input" type="number" min="0.01" step="any" value={metric.target ?? ""} onChange={(event) => onChange({ target: event.target.value })} disabled={!metric.enabled} required={metric.enabled} placeholder="0" /></label>}
    <label className="team-small-field"><span>Weight (%)</span><span className="team-number-suffix"><input className="team-text-input" type="number" min="0.01" max="100" step="0.01" value={metric.weight ?? ""} onChange={(event) => onChange({ weight: event.target.value })} disabled={!metric.enabled} required={metric.enabled} placeholder="0" /><b>%</b></span></label>
  </div>;
}

function KpiGroup({ level, group, onChange }) {
  const total = metricWeightTotal(group);

  function updateBuiltin(key, patch) {
    onChange({ ...group, [key]: { ...group[key], ...patch } });
  }

  function updateCustom(id, patch) {
    onChange({ ...group, custom: group.custom.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  return <section className="team-kpi-group">
    <header className="team-kpi-heading"><div><span className="team-section-kicker">{level}</span><h3>{level} KPI targets</h3></div><span className={`team-weight-total ${total > 100 ? "over-limit" : ""}`}>{total.toFixed(2).replace(/\.00$/, "")}% <small>allocated</small></span></header>
    <div className="team-weight-track"><i className={total > 100 ? "over-limit" : ""} style={{ width: `${Math.min(total, 100)}%` }} /></div>
    {KPI_DEFINITIONS.map(({ key, label }) => <MetricToggleRow key={key} metric={group[key]} label={label} onChange={(patch) => updateBuiltin(key, patch)} />)}
    {group.custom.map((metric) => <MetricToggleRow key={metric.id} metric={metric} label="Additional KPI" custom onChange={(patch) => updateCustom(metric.id, patch)} onRemove={() => onChange({ ...group, custom: group.custom.filter((item) => item.id !== metric.id) })} />)}
    {total > 100 && <p className="team-inline-error"><CircleAlert size={14} /> Total {level.toLowerCase()} KPI weight cannot exceed 100%.</p>}
    <button className="team-add-kpi" type="button" onClick={() => onChange({ ...group, custom: [...group.custom, { id: crypto.randomUUID(), name: "", ...createMetric(true) }] })}><Plus size={15} /> Add KPI</button>
  </section>;
}

function SalesRange({ title, value, fields, onChange, disabled }) {
  const zone = title.toLowerCase().split(" ")[0];
  return <div className="team-sales-range">
    <span className={`sales-zone-name ${zone}`}>{title}<i /></span>
    {fields.map((field) => <label className="team-small-field" key={field.key}><span>{field.label}</span><input className="team-text-input" type="number" min="0" step="any" value={value[field.key] ?? ""} onChange={(event) => onChange({ ...value, [field.key]: event.target.value })} disabled={disabled} required={!disabled} placeholder="0" /></label>)}
  </div>;
}

function SalesProfile({ level, profile, onChange, disabled }) {
  return <section className={`team-sales-profile ${disabled ? "is-disabled" : ""}`}>
    <header><span className="team-section-kicker">{level}</span><h3>{level} sales zones</h3></header>
    <SalesRange title="Red zone" value={profile.red} fields={[{ key: "from", label: "From" }, { key: "to", label: "To" }]} onChange={(red) => onChange({ ...profile, red })} disabled={disabled} />
    <label className="team-zone-override">
      <input type="checkbox" checked={profile.redZoneOverride || false} onChange={(event) => onChange({ ...profile, redZoneOverride: event.target.checked })} disabled={disabled} />
      <span>Calculate KPI normally instead of 0%</span>
    </label>
    <SalesRange title="Yellow zone" value={profile.yellow} fields={[{ key: "from", label: "From" }, { key: "to", label: "To" }]} onChange={(yellow) => onChange({ ...profile, yellow })} disabled={disabled} />
    <SalesRange title="Green zone" value={profile.green} fields={[{ key: "from", label: "From" }]} onChange={(green) => onChange({ ...profile, green })} disabled={disabled} />
    <label className="team-zone-override">
      <input type="checkbox" checked={profile.greenZoneOverride || false} onChange={(event) => onChange({ ...profile, greenZoneOverride: event.target.checked })} disabled={disabled} />
      <span>Calculate KPI normally instead of 100%</span>
    </label>
  </section>;
}

function TeamEditor({ team, qualityAccounts, loading, error, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => prepareTeam(team || createBlankTeam()));

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateLeader(key, value) {
    setDraft((current) => ({ ...current, teamLeader: { ...current.teamLeader, [key]: value } }));
  }

  function updateKpis(level, value) {
    setDraft((current) => ({ ...current, kpis: { ...current.kpis, [level]: value } }));
  }

  function updatePerformance(level, value) {
    setDraft((current) => ({ ...current, performance: { ...current.performance, [level]: value } }));
  }

  return <form className="team-editor" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <div className="team-editor-heading">
      <button className="team-back-button" type="button" onClick={onCancel}><ArrowLeft size={16} /> Back to teams</button>
      <div className="team-editor-title"><span className="team-editor-icon"><Users size={20} /></span><div><span className="team-section-kicker">TEAM SETUP</span><h2>{team ? "Edit team" : "Create a new team"}</h2><p>Set up ownership, operating targets and sales thresholds.</p></div></div>
    </div>
    {error && <div className="team-form-error" role="alert"><CircleAlert size={16} />{error}</div>}

    <section className="team-form-section">
      <header className="team-section-heading"><span className="team-section-number">01</span><div><span className="team-section-kicker">TEAM DETAILS</span><h3>Ownership & assignment</h3><p>Give this team a name and set its day-to-day contacts.</p></div></header>
      <div className="team-form-grid">
        <label className="team-field"><span>Team name <b>*</b></span><input className="team-text-input" value={draft.teamName} onChange={(event) => updateField("teamName", event.target.value)} maxLength={100} autoFocus required placeholder="e.g. Cairo North" /></label>
        <label className="team-field"><span>Team leader name <b>*</b></span><input className="team-text-input" value={draft.teamLeader.name} onChange={(event) => updateLeader("name", event.target.value)} maxLength={120} required placeholder="Full name" /></label>
        <label className="team-field"><span>Team leader email <b>*</b></span><input className="team-text-input" type="email" value={draft.teamLeader.email} onChange={(event) => updateLeader("email", event.target.value)} maxLength={254} required placeholder="leader@company.com" /></label>
        <label className="team-field"><span>Assigned Quality account</span><select className="team-text-input" value={draft.qualityOwnerId} onChange={(event) => updateField("qualityOwnerId", event.target.value)}><option value="">No assignment</option>{qualityAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.email ? ` · ${account.email}` : ""}</option>)}</select>{qualityAccounts.length === 0 && <small className="team-field-hint">No active Quality accounts available yet.</small>}</label>
      </div>
    </section>

    <section className="team-form-section">
      <header className="team-section-heading"><span className="team-section-number">02</span><div><span className="team-section-kicker">KPIS & TARGETS</span><h3>Operating standards</h3><p>Define separate requirements for Agents and Seniors. Each group's active weights may total up to 100%.</p></div></header>
      <div className="team-kpi-grid">
        <KpiGroup level="agent" group={draft.kpis.agent} onChange={(value) => updateKpis("agent", value)} />
        <KpiGroup level="senior" group={draft.kpis.senior} onChange={(value) => updateKpis("senior", value)} />
      </div>
    </section>

    <section className="team-form-section sales-form-section">
      <header className="team-section-heading"><span className="team-section-number">03</span><div><span className="team-section-kicker">PERFORMANCE</span><h3>Sales targets</h3><p>Set red, yellow and green sales ranges separately for Agents and Seniors.</p></div><label className="team-switch-label"><input type="checkbox" checked={draft.performance.enabled} onChange={(event) => updateField("performance", { ...draft.performance, enabled: event.target.checked })} /><span className="team-switch" /><span>{draft.performance.enabled ? "Enabled" : "Not a sales team"}</span></label></header>
      <div className={`team-sales-grid ${draft.performance.enabled ? "" : "is-disabled"}`}>
        <SalesProfile level="agent" profile={draft.performance.agent} onChange={(value) => updatePerformance("agent", value)} disabled={!draft.performance.enabled} />
        <SalesProfile level="senior" profile={draft.performance.senior} onChange={(value) => updatePerformance("senior", value)} disabled={!draft.performance.enabled} />
      </div>
    </section>

    <div className="team-form-actions"><button className="team-cancel-button" type="button" onClick={onCancel}>Cancel</button><button className="team-save-button" type="submit" disabled={loading}>{loading ? <span className="team-spinner" /> : <Save size={16} />}{loading ? "Saving..." : team ? "Save changes" : "Save team"}</button></div>
  </form>;
}

export default function TeamsPage({ canManage = true, user }) {
  const [teams, setTeams] = useState([]);
  const [qualityAccounts, setQualityAccounts] = useState([]);
  const [mode, setMode] = useState("list");
  const [editingTeam, setEditingTeam] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTeam, setBusyTeam] = useState("");
  const [error, setError] = useState("");
  
  // Manager cannot manage teams
  const canManageTeams = canManage && user?.role !== "Manager";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.qaDesk.teams.list();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTeams(result.teams);
      setQualityAccounts(result.qualityAccounts);
    } catch {
      setError("Teams could not be loaded. Check the database connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return teams;
    return teams.filter((team) => [team.teamName, team.teamLeader?.name, team.teamLeader?.email, team.qualityOwnerName]
      .some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery)));
  }, [query, teams]);

  const employeeCount = teams.reduce((total, team) => total + team.employeeCount, 0);
  const activeCount = teams.filter((team) => team.isActive).length;
  const averageTeamSize = teams.length ? (employeeCount / teams.length).toFixed(1) : "0.0";

  function openCreate() {
    setEditingTeam(null);
    setError("");
    setMode("form");
  }

  function openEdit(team) {
    setEditingTeam(team);
    setError("");
    setMode("form");
  }

  async function saveTeam(draft) {
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.teams.save(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMode("list");
      setEditingTeam(null);
      await loadData();
    } catch {
      setError("Team could not be saved. Check the database connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(team) {
    if (team.employeeCount > 0) return;
    if (!window.confirm(`Delete "${team.teamName}"? This action cannot be undone.`)) return;

    setBusyTeam(team.id);
    setError("");
    try {
      const result = await window.qaDesk.teams.delete(team.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await loadData();
    } catch {
      setError("Team could not be deleted. Check the database connection and try again.");
    } finally {
      setBusyTeam("");
    }
  }

  function cancelEditor() {
    setError("");
    setMode("list");
    setEditingTeam(null);
  }

  if (mode === "form" && canManageTeams) {
    return <TeamEditor team={editingTeam} qualityAccounts={qualityAccounts} loading={saving} error={error} onCancel={cancelEditor} onSave={saveTeam} />;
  }

  return <div className="teams-workspace">
    <section className="teams-summary-grid" aria-label="Team statistics">
      <article className="teams-summary-card"><span className="teams-summary-icon forest"><Users size={17} /></span><div><span>Total teams</span><strong>{teams.length}</strong></div><small>Configured in workspace</small></article>
      <article className="teams-summary-card"><span className="teams-summary-icon mint"><Activity size={17} /></span><div><span>Active teams</span><strong>{activeCount}</strong></div><small>With assigned employees</small></article>
      <article className="teams-summary-card"><span className="teams-summary-icon blue"><UserRound size={17} /></span><div><span>Team employees</span><strong>{employeeCount}</strong></div><small>Across all teams</small></article>
      <article className="teams-summary-card"><span className="teams-summary-icon gold"><BarChart3 size={17} /></span><div><span>Average team size</span><strong>{averageTeamSize}</strong></div><small>Employees per team</small></article>
    </section>

    <section className="team-list-panel">
      <header className="team-list-toolbar"><div><span className="team-section-kicker">WORKSPACE DIRECTORY</span><h2>Teams <span>{teams.length}</span></h2></div><div className="team-list-actions"><label className="team-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teams..." aria-label="Search teams" /></label>{canManageTeams && <button className="team-create-button" type="button" onClick={openCreate}><Plus size={16} /> Add team</button>}</div></header>
      {error && <div className="team-list-error" role="alert"><CircleAlert size={15} />{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
      {loading ? <div className="team-loading"><span className="team-spinner" /> Loading teams...</div> : teams.length === 0 ? <div className="teams-empty-state"><span className="teams-empty-icon"><Users size={23} /></span><h3>No teams yet</h3><p>{canManageTeams ? "Create the first team to define its leadership, quality ownership and targets." : "There are no teams to display."}</p>{canManageTeams && <button className="team-create-button" type="button" onClick={openCreate}><Plus size={16} /> Add your first team</button>}</div> : filteredTeams.length === 0 ? <div className="teams-empty-state compact"><Search size={21} /><p>No teams match this search.</p></div> : <>
        <div className="team-table-scroll"><table className="teams-table"><thead><tr><th>TEAM</th><th>TEAM LEADER</th><th>QUALITY OWNER</th><th>EMPLOYEES</th><th>STATUS</th><th>CREATED</th><th aria-label="Actions" /></tr></thead><tbody>{filteredTeams.map((team) => <tr key={team.id}>
          <td><strong className="team-name-cell">{team.teamName}</strong></td>
          <td><span className="team-person-cell"><b>{team.teamLeader.name}</b><small>{team.teamLeader.email}</small></span></td>
          <td>{team.qualityOwnerName ? <span className="team-quality-cell"><ShieldCheck size={14} />{team.qualityOwnerName}</span> : <span className="team-unassigned">Unassigned</span>}</td>
          <td><span className="team-employee-count"><Users size={14} />{team.employeeCount}</span></td>
          <td><span className={`team-status ${team.isActive ? "active" : "inactive"}`}><i />{team.isActive ? "Active" : "No employees"}</span></td>
          <td><span className="team-date-cell"><CalendarDays size={14} />{formatDate(team.createdAt)}</span></td>
          <td>{canManageTeams && <div className="team-row-actions"><button className="team-icon-button" type="button" onClick={() => openEdit(team)} title="Edit team" aria-label={`Edit ${team.teamName}`}><Pencil size={15} /></button><button className="team-icon-button destructive" type="button" onClick={() => void deleteTeam(team)} disabled={team.employeeCount > 0 || busyTeam === team.id} title={team.employeeCount > 0 ? "Reassign employees before deleting" : "Delete team"} aria-label={`Delete ${team.teamName}`}><Trash2 size={15} /></button></div>}</td>
        </tr>)}</tbody></table></div>
        <footer className="team-table-footer"><span>Showing {filteredTeams.length} of {teams.length} teams</span><span>Activity is based on current employee assignments</span></footer>
      </>}
    </section>
  </div>;
}
