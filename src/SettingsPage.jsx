import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, CalendarDays, Check, CheckCircle2, CircleAlert, Clock3, CloudDownload, CloudUpload, Download, FileSpreadsheet, Headphones,
  Layers, LockKeyhole, Moon, Pencil, Plus, RefreshCw, ShieldCheck, Sun, Trash2, Upload, UserRound, Users, UserX, X,
} from "lucide-react";
import "./settings-page.css";

const accountPages = ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"];
const rolePermissionDefaults = {
  Quality: { pages: ["Dashboard", "Alerts", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"], canEditSales: true, canEvaluate: true, canEditTalkingTime: false, canEditCalls: false, canManageEmployees: false, canManageTeams: false, canManageQualityForms: false, canImportTalkingTime: false, canImportSales: false, canSendEmails: true },
  "Team Leader": { pages: ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"], canEditSales: false, canEvaluate: false, canEditTalkingTime: true, canEditCalls: true, canManageEmployees: true, canManageTeams: true, canManageQualityForms: false, canImportTalkingTime: false, canImportSales: false, canSendEmails: false },
  Manager: { pages: ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"], canEditSales: false, canEvaluate: false, canEditTalkingTime: false, canEditCalls: false, canManageEmployees: false, canManageTeams: false, canManageQualityForms: false, canImportTalkingTime: false, canImportSales: false, canSendEmails: false },
};
const blankAccount = () => ({ id: "", name: "", username: "", email: "", role: "Quality", permissions: { ...rolePermissionDefaults.Quality }, password: "" });
const blankTransfer = () => ({ kind: "team", sourceTeamId: "", employeeId: "", toQualityId: "", targetTeamId: "" });
const permissionLabels = [
  ["canEditSales", "Edit monthly sales", "Change and import employee sales figures."],
  ["canEvaluate", "Allow call evaluations", "Start, submit, and edit quality evaluations."],
  ["canEditTalkingTime", "Edit talking time", "Add or update daily talking-time entries."],
  ["canEditCalls", "Edit call counts", "Add call counts, leave, or system-outage entries."],
  ["canManageEmployees", "Manage employees", "Create, edit, archive, and remove employees."],
  ["canManageTeams", "Manage teams", "Create, edit, or remove teams and targets."],
  ["canImportTalkingTime", "Upload talking time", "Import 3CX or Afwar time for any active employee."],
  ["canImportSales", "Upload sales sheets", "Import monthly sales for all active employees."],
  ["canSendEmails", "Send emails", "Send dashboard reports and quality evaluation emails."],
];

function formatDate(value) {
  if (!value) return "Never signed in";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never signed in" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function initials(value) {
  return String(value || "User").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function AccountEditor({ account, onClose, onSave, saving, error, availableTeams }) {
  const [draft, setDraft] = useState(() => account
    ? { ...account, permissions: account.permissions || { ...rolePermissionDefaults[account.role] }, password: "", teamIds: account.teamIds || [] }
    : blankAccount());
  function change(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const savedPermissions = account?.permissions || rolePermissionDefaults[account?.role || draft.role];
  const hasChanges = Boolean(account && (
    ["name", "username", "email", "role"].some((key) => draft[key] !== (account[key] || ""))
    || draft.password.length > 0
    || JSON.stringify(draft.permissions) !== JSON.stringify(savedPermissions)
    || JSON.stringify(draft.teamIds || []) !== JSON.stringify(account.teamIds || [])
  ));

  function closeEditor() {
    if (saving) return;
    const createIsComplete = draft.name.trim() && draft.username.trim() && draft.password.length >= 8;
    if (hasChanges || (!account && createIsComplete)) onSave(draft);
    else onClose();
  }

  function togglePage(page) {
    const selected = draft.permissions.pages.includes(page);
    change("permissions", { ...draft.permissions, pages: selected ? draft.permissions.pages.filter((item) => item !== page) : [...draft.permissions.pages, page] });
  }

  function toggleTeam(teamId) {
    const selected = (draft.teamIds || []).includes(teamId);
    change("teamIds", selected ? (draft.teamIds || []).filter((id) => id !== teamId) : [...(draft.teamIds || []), teamId]);
  }

  return <div className="settings-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
    <form className="settings-dialog" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <header><div><span className="settings-eyebrow">ACCOUNT ACCESS</span><h3>{account ? "Edit account" : "Create account"}</h3></div><button type="button" className="settings-icon-button" onClick={closeEditor} aria-label="Save and close" title="Save and close" disabled={saving}><X size={17} /></button></header>
      {error && <p className="settings-inline-error" role="alert"><CircleAlert size={15} />{error}</p>}
      <label className="settings-field"><span>Display name</span><input autoFocus value={draft.name} onChange={(event) => change("name", event.target.value)} maxLength={120} required /></label>
      <div className="settings-field-grid"><label className="settings-field"><span>Username</span><input autoComplete="off" value={draft.username} onChange={(event) => change("username", event.target.value)} minLength={3} maxLength={40} required /></label><label className="settings-field"><span>Role</span><select value={draft.role} onChange={(event) => { const role = event.target.value; change("role", role); change("permissions", { ...rolePermissionDefaults[role] }); if (role !== "Team Leader") change("teamIds", []); }}><option>Quality</option><option>Team Leader</option><option>Manager</option><option>Admin</option></select></label></div>
      <label className="settings-field"><span>Email address <small>Optional</small></span><input type="email" value={draft.email} onChange={(event) => change("email", event.target.value)} maxLength={254} /></label>
      <label className="settings-field"><span>Password {account && <small>Leave blank to keep it unchanged</small>}</span><input type="password" autoComplete="new-password" value={draft.password} onChange={(event) => change("password", event.target.value)} minLength={8} required={!account} /></label>
      {draft.role === "Team Leader" && <section className="settings-permission-group"><header><strong>Assigned Teams</strong><small>Select the teams this Team Leader can manage.</small></header><div className="settings-permission-grid">{availableTeams.map((team) => <label className="settings-permission-toggle" key={team.id}><input type="checkbox" checked={(draft.teamIds || []).includes(team.id)} onChange={() => toggleTeam(team.id)} /><span>{team.teamName}</span></label>)}</div></section>}
      {draft.role !== "Admin" && <div className="settings-permission-groups">
        <section className="settings-permission-group"><header><strong>Visible pages</strong><small>Select the pages this account can open.</small></header><div className="settings-permission-grid">{accountPages.map((page) => <label className="settings-permission-toggle" key={page}><input type="checkbox" checked={draft.permissions.pages.includes(page)} onChange={() => togglePage(page)} /><span>{page}</span></label>)}</div></section>
        <section className="settings-permission-group"><header><strong>Actions</strong><small>Control which records and workspace resources this account can change.</small></header><div className="settings-permission-actions">{permissionLabels.map(([key, label, description]) => <label className="settings-permission-action" key={key}><input type="checkbox" checked={Boolean(draft.permissions[key])} onChange={(event) => change("permissions", { ...draft.permissions, [key]: event.target.checked })} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div></section>
      </div>}
      {draft.role === "Admin" && <p className="settings-admin-note"><ShieldCheck size={15} />Admin accounts always retain full page and action access.</p>}
      <footer><button className="settings-secondary-button" type="button" onClick={closeEditor} disabled={saving}>{account ? "Save and close" : "Close"}</button><button className="settings-primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : account ? "Save account" : "Create account"}</button></footer>
    </form>
  </div>;
}

function SettingsPage({ user, onUserUpdate, theme, onThemeChange }) {
  const isAdmin = user.role === "Admin";
  const canImportTalkingTime = isAdmin || user.permissions?.canImportTalkingTime === true;
  const canImportSales = isAdmin || user.permissions?.canImportSales === true;
  const [section, setSection] = useState("profile");
  const [profile, setProfile] = useState({ name: user.name || "", username: user.username || "", email: user.email || "", currentPassword: "", newPassword: "" });
  const [accounts, setAccounts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [receivingTeams, setReceivingTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [qualityAccounts, setQualityAccounts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [maintenance, setMaintenance] = useState(false);
  const [transfer, setTransfer] = useState(blankTransfer);
  const [editingAccount, setEditingAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [threecxConfig, setThreecxConfig] = useState({ configured: false, username: "", groupNumber: "GRP0000" });
  const [threecxCredentials, setThreecxCredentials] = useState({ username: "", password: "", groupNumber: "GRP0000" });
  const [threecxMode, setThreecxMode] = useState("date");
  const [threecxDate, setThreecxDate] = useState(localDateValue());
  const [threecxMonth, setThreecxMonth] = useState(currentMonth());
  const [afwarConfig, setAfwarConfig] = useState({ configured: false, extension: "" });
  const [afwarCredentials, setAfwarCredentials] = useState({ extension: "", password: "" });
  const [awfarKanbanConfig, setAwfarKanbanConfig] = useState({ configured: false, username: "" });
  const [awfarKanbanCredentials, setAwfarKanbanCredentials] = useState({ username: "", password: "" });
  const [afwarMode, setAfwarMode] = useState("date");
  const [afwarDate, setAfwarDate] = useState(localDateValue());
  const [afwarMonth, setAfwarMonth] = useState(currentMonth());
  const [salesMonth, setSalesMonth] = useState(currentMonth());
  const [importBusy, setImportBusy] = useState(false);
  const salesFileRef = useRef(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    setProfile({ name: user.name || "", username: user.username || "", email: user.email || "", currentPassword: "", newPassword: "" });
    // Get current app version
    window.qaDesk.updater.getVersion().then((result) => {
      if (result.ok) {
        setCurrentVersion(result.version);
      }
    });
  }, [user.id, user.name, user.username, user.email]);

  useEffect(() => {
    const listener = (data) => {
      console.log("Update status received:", data);
      setUpdateStatus(data.status);
      if (data.info) {
        setUpdateInfo(data.info);
      }
      if (data.progress) {
        setUpdateProgress(Math.round(data.progress.percent || 0));
      }
      if (data.status === "error" && data.error) {
        setError(data.error);
      }
    };
    window.qaDesk.updater.onUpdateStatus(listener);
    return () => {
      window.qaDesk.updater.onUpdateStatus(null);
    };
  }, []);

  // Auto-check for updates when entering the updates section
  useEffect(() => {
    if (section === "updates") {
      setUpdateStatus(null);
      setError("");
      setTimeout(() => {
        void checkForUpdates();
      }, 100);
    }
  }, [section]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [optionsResult, requestsResult, accountsResult, maintenanceResult, threecxResult, afwarResult, awfarKanbanResult, teamsResult] = await Promise.all([
        window.qaDesk.settings.transferOptions(user.id),
        window.qaDesk.settings.transfersList(user.id),
        isAdmin ? window.qaDesk.settings.accountsList(user.id) : Promise.resolve(null),
        isAdmin ? window.qaDesk.settings.maintenanceGet(user.id) : Promise.resolve(null),
        canImportTalkingTime ? window.qaDesk.settings.threecxConfigGet(user.id) : Promise.resolve(null),
        canImportTalkingTime ? window.qaDesk.settings.afwarConfigGet(user.id) : Promise.resolve(null),
        window.qaDesk.settings.awfarKanbanConfigGet(user.id),
        isAdmin ? window.qaDesk.teams.listAll() : Promise.resolve(null),
      ]);
      if (!optionsResult.ok) throw new Error(optionsResult.message);
      if (!requestsResult.ok) throw new Error(requestsResult.message);
      setTeams(optionsResult.teams);
      setReceivingTeams(optionsResult.receivingTeams);
      setEmployees(optionsResult.employees);
      setQualityAccounts(optionsResult.qualityAccounts);
      setRequests(requestsResult.requests);
      if (isAdmin && accountsResult?.ok) setAccounts(accountsResult.accounts);
      if (isAdmin && maintenanceResult?.ok) setMaintenance(maintenanceResult.enabled);
      if (threecxResult?.ok) {
        setThreecxConfig({ configured: threecxResult.configured, username: threecxResult.username, groupNumber: threecxResult.groupNumber });
        if (canImportTalkingTime) setThreecxCredentials((current) => ({ ...current, username: threecxResult.username, groupNumber: threecxResult.groupNumber }));
      }
      if (afwarResult?.ok) {
        setAfwarConfig({ configured: afwarResult.configured, extension: afwarResult.extension });
        if (canImportTalkingTime) setAfwarCredentials((current) => ({ ...current, extension: afwarResult.extension }));
      }
      if (awfarKanbanResult?.ok) {
        setAwfarKanbanConfig({ configured: awfarKanbanResult.configured, username: awfarKanbanResult.username });
        setAwfarKanbanCredentials((current) => ({ ...current, username: awfarKanbanResult.username }));
      }
      // Use teams from teams:list for Admin to get all teams
      if (isAdmin && teamsResult?.ok) setTeams(teamsResult.teams);
      if (isAdmin && accountsResult && !accountsResult.ok) throw new Error(accountsResult.message);
      if (isAdmin && maintenanceResult && !maintenanceResult.ok) throw new Error(maintenanceResult.message);
      if (threecxResult && !threecxResult.ok) throw new Error(threecxResult.message);
      if (afwarResult && !afwarResult.ok) throw new Error(afwarResult.message);
      if (!awfarKanbanResult.ok) throw new Error(awfarKanbanResult.message);
    } catch (caught) {
      setError(caught.message || "Settings could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
    }
  }, [canImportTalkingTime, isAdmin, user.id]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const tabs = [
    { id: "profile", label: "My profile", icon: UserRound },
    ...(isAdmin ? [{ id: "accounts", label: "Accounts", icon: Users }] : []),
    ...(canImportTalkingTime || canImportSales ? [{ id: "uploads", label: "API data uploads", icon: CloudUpload }] : []),
    { id: "transfers", label: "Quality transfers", icon: RefreshCw, count: requests.filter((request) => request.status === "pending" && request.toQualityId === user.id).length },
    ...(isAdmin ? [{ id: "status", label: "Account status", icon: Activity }] : []),
    { id: "updates", label: "App updates", icon: CloudDownload },
  ];
  const selectedTeam = teams.find((team) => team.id === transfer.sourceTeamId);
  const destinationTeams = receivingTeams.filter((team) => team.qualityOwnerId === transfer.toQualityId && team.id !== transfer.sourceTeamId);
  const sourceEmployees = employees.filter((employee) => employee.teamId === transfer.sourceTeamId);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const onlineCount = accounts.filter((account) => account.online && account.isActive).length;
  const offlineCount = accounts.filter((account) => !account.online && account.isActive).length;
  const frozenCount = accounts.filter((account) => !account.isActive).length;

  async function save3cxConfig(event) {
    event.preventDefault();
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.threecxConfigSave({ actorId: user.id, ...threecxCredentials });
      if (!result.ok) { setError(result.message); return; }
      setThreecxConfig({ configured: true, username: result.username, groupNumber: result.groupNumber });
      setThreecxCredentials((current) => ({ ...current, password: "", username: result.username, groupNumber: result.groupNumber }));
      setNotice("3CX credentials were encrypted and saved on this device.");
    } catch {
      setError("3CX credentials could not be saved securely.");
    } finally { setImportBusy(false); }
  }

  async function import3cxTalkingTime(event) {
    event.preventDefault();
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.threecxImportTalkingTime(threecxMode === "date"
        ? { mode: "date", date: threecxDate }
        : { mode: "month", month: threecxMonth });
      if (!result.ok) { setError(result.message); return; }
      setNotice(result.processedDays
        ? `3CX import completed for ${result.processedDays} day(s): ${result.importedEmployees} employee-day entries added; ${result.unmatchedExtensions} extensions did not match an active employee.`
        : result.message);
    } catch {
      setError("3CX talking time could not be imported. Check the API connection and try again.");
    } finally { setImportBusy(false); }
  }

  async function saveAfwarConfig(event) {
    event.preventDefault();
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.afwarConfigSave({ actorId: user.id, ...afwarCredentials });
      if (!result.ok) { setError(result.message); return; }
      setAfwarConfig({ configured: true, extension: result.extension });
      setAfwarCredentials((current) => ({ ...current, password: "", extension: result.extension }));
      setNotice("Afwar credentials were encrypted and saved on this device.");
    } catch {
      setError("Afwar credentials could not be saved securely.");
    } finally { setImportBusy(false); }
  }

  async function saveAwfarKanbanConfig(event) {
    event.preventDefault();
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.awfarKanbanConfigSave(awfarKanbanCredentials);
      if (!result.ok) { setError(result.message); return; }
      setAwfarKanbanConfig({ configured: true, username: result.username });
      setAwfarKanbanCredentials((current) => ({ ...current, username: result.username, password: "" }));
      setNotice("Your separate Awfar Kanban account credentials were encrypted and saved.");
    } catch {
      setError("Your Awfar Kanban account credentials could not be saved securely.");
    } finally { setImportBusy(false); }
  }

  async function importAfwarTalkingTime(event) {
    event.preventDefault();
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.afwarImportTalkingTime(afwarMode === "date"
        ? { mode: "date", date: afwarDate }
        : { mode: "month", month: afwarMonth });
      if (!result.ok) { setError(result.message); return; }
      setNotice(result.processedDays
        ? `Afwar import completed for ${result.processedDays} day(s): ${result.importedEmployees} employee-day entries added; ${result.unmatchedAgents} agents did not match an active employee.`
        : result.message);
    } catch {
      setError("Afwar talking time could not be imported. Check the API connection and try again.");
    } finally { setImportBusy(false); }
  }

  async function importSalesWorkbook(file) {
    if (!file) return;
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.qualityEvaluation.importSales({ month: salesMonth, workbookData: await file.arrayBuffer() });
      if (!result.ok) { setError(result.message); return; }
      if (!result.totalRows) { setError("No employee sales rows were found in Sheet1."); return; }
      setNotice(`Sales imported for ${salesMonth}: ${result.imported} employees updated across the company; unmatched ${result.unmatched}, duplicate codes ${result.duplicates}, ambiguous codes ${result.ambiguous}, invalid rows ${result.invalid}.`);
    } catch (caught) {
      setError(caught.message || "The sales workbook could not be read.");
    } finally { setImportBusy(false); }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.profileSave({ userId: user.id, ...profile });
      if (!result.ok) { setError(result.message); return; }
      onUserUpdate(result.user);
      let successMessage = "Profile updated.";
      if (window.qaDesk.auth?.loadRemembered && window.qaDesk.auth?.saveRemembered) {
        const remembered = await window.qaDesk.auth.loadRemembered();
        const previousIdentifiers = [user.username, user.email].filter(Boolean).map((value) => value.toLocaleLowerCase());
        if (remembered.ok && remembered.credentials && previousIdentifiers.includes(remembered.credentials.identifier.toLocaleLowerCase())) {
          const saved = await window.qaDesk.auth.saveRemembered({
            identifier: result.user.username,
            password: profile.newPassword || remembered.credentials.password,
            remember: true,
          });
          if (!saved.ok) successMessage = "Profile updated. Saved sign-in details may need to be refreshed at your next sign-in.";
        }
      }
      setProfile((current) => ({ ...current, ...result.user, currentPassword: "", newPassword: "" }));
      setNotice(successMessage);
    } catch {
      setError("Profile could not be saved. Check the database connection and try again.");
    } finally { setSaving(false); }
  }

  async function saveAccount(draft) {
    setSaving(true); setError("");
    try {
      const result = await window.qaDesk.settings.accountSave({ ...draft, actorId: user.id });
      if (!result.ok) { setError(result.message); return; }
      setEditingAccount(null);
      setNotice(draft.id ? "Account updated." : "Account created.");
      await refresh();
    } catch {
      setError("Account could not be saved. Check the database connection and try again.");
    } finally { setSaving(false); }
  }

  async function changeAccountState(account, active) {
    setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.accountFreeze({ actorId: user.id, id: account.id, active });
      if (!result.ok) { setError(result.message); return; }
      setNotice(active ? "Account reactivated." : "Account frozen.");
      await refresh();
    } catch {
      setError("Account status could not be changed. Check the desktop service and try again.");
    }
  }

  async function unlockAccount(account) {
    setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.accountUnlock({ actorId: user.id, id: account.id });
      if (!result.ok) { setError(result.message); return; }
      setNotice("Account unlocked successfully.");
      await refresh();
    } catch {
      setError("Account could not be unlocked. Check the desktop service and try again.");
    }
  }

  async function deleteAccount(account) {
    if (!window.confirm(`Permanently delete ${account.name}'s account? This cannot be undone.`)) return;
    setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.accountDelete({ actorId: user.id, id: account.id });
      if (!result.ok) { setError(result.message); return; }
      setNotice("Account deleted.");
      await refresh();
    } catch {
      setError("Account could not be deleted. Check the desktop service and try again.");
    }
  }

  async function changeMaintenance(enabled) {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.maintenanceSet({ actorId: user.id, enabled });
      if (!result.ok) { setError(result.message); return; }
      setMaintenance(result.enabled);
      setNotice(enabled ? "Workspace access is paused for non-admin accounts." : "Workspace access is open for all active accounts.");
    } catch {
      setError("Workspace access could not be changed.");
    } finally { setSaving(false); }
  }

  async function createTransfer(event) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.transferCreate({ actorId: user.id, ...transfer });
      if (!result.ok) { setError(result.message); return; }
      setNotice(result.immediate ? "Transfer completed." : "Transfer request sent to the receiving Quality account.");
      setTransfer(blankTransfer());
      await refresh();
    } catch {
      setError("The transfer could not be submitted. Check the database connection and try again.");
    } finally { setSaving(false); }
  }

  async function respondToTransfer(request, approve) {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await window.qaDesk.settings.transferRespond({ actorId: user.id, requestId: request.id, approve });
      if (!result.ok) { setError(result.message); return; }
      setNotice(approve ? "Transfer approved and completed." : "Transfer request declined.");
      await refresh();
    } catch {
      setError("The request could not be handled. Check the database connection and try again.");
    } finally { setSaving(false); }
  }

  async function changeTransferKind(kind) {
    setTransfer((current) => ({ ...current, ...blankTransfer(), kind }));
  }

  async function checkForUpdates() {
    setUpdateStatus("checking");
    setError("");
    try {
      await window.qaDesk.updater.check();
    } catch {
      setError("Could not check for updates.");
      setUpdateStatus("error");
    }
  }

  async function downloadUpdate() {
    setUpdateStatus("downloading");
    try {
      const result = await window.qaDesk.updater.download();
      if (!result.ok) {
        setError(result.message);
        setUpdateStatus("error");
      }
    } catch {
      setError("Could not download update.");
      setUpdateStatus("error");
    }
  }

  async function installUpdate() {
    try {
      const result = await window.qaDesk.updater.install();
      if (!result.ok) {
        setError(result.message);
      }
    } catch {
      setError("Could not install update.");
    }
  }

  return <div className="settings-page">
    <header className="settings-page-heading"><div><span className="settings-eyebrow">WORKSPACE CONTROL</span><h2>Settings</h2><p>Account security, access, appearance, and Quality assignments.</p></div><button type="button" className="settings-refresh" title="Refresh settings" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? "is-spinning" : ""} />Refresh</button></header>
    <nav className="settings-tabs" aria-label="Settings sections">{tabs.map(({ id, label, icon: Icon, count }) => <button type="button" key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setError(""); setNotice(""); }}><Icon size={16} />{label}{count > 0 && <span>{count}</span>}</button>)}</nav>
    {(error || notice) && <div className={`settings-feedback ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}{error || notice}</div>}
    {updateStatus === "available" && <div className="settings-update-notification">
      <div className="settings-update-notification-content">
        <Download size={20} />
        <div>
          <strong>New update available!</strong>
          <small>A new version is ready to install. Go to "App updates" to download and install it.</small>
        </div>
        <button type="button" className="settings-notification-button" onClick={() => setSection("updates")}>View update</button>
      </div>
    </div>}

    {section === "profile" && <div className="settings-content-grid">
      <form className="settings-panel settings-profile-panel" onSubmit={saveProfile}>
        <header className="settings-panel-heading"><span className="settings-panel-icon"><UserRound size={18} /></span><div><h3>Account profile</h3><p>Update your sign-in and contact details.</p></div></header>
        <label className="settings-field"><span>Display name</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} maxLength={120} required /></label>
        <label className="settings-field"><span>Username</span><input autoComplete="username" value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} minLength={3} maxLength={40} required /></label>
        <label className="settings-field"><span>Email address <small>Optional</small></span><input type="email" autoComplete="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} maxLength={254} /></label>
        <div className="settings-password-divider"><LockKeyhole size={15} /><span>Change password</span><small>Leave blank to keep it</small></div>
        <label className="settings-field"><span>Current password</span><input type="password" autoComplete="current-password" value={profile.currentPassword} onChange={(event) => setProfile({ ...profile, currentPassword: event.target.value })} /></label>
        <label className="settings-field"><span>New password <small>At least 8 characters</small></span><input type="password" autoComplete="new-password" value={profile.newPassword} onChange={(event) => setProfile({ ...profile, newPassword: event.target.value })} minLength={8} /></label>
        <footer className="settings-form-footer"><span><ShieldCheck size={14} />Passwords are securely encrypted.</span><button className="settings-primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button></footer>
      </form>
      <div className="settings-side-stack">
        <section className="settings-panel"><header className="settings-panel-heading"><span className="settings-panel-icon is-gold"><Sun size={17} /></span><div><h3>Appearance</h3><p>Choose a workspace color theme.</p></div></header><div className="settings-theme-switch"><button type="button" className={theme === "light" ? "active" : ""} onClick={() => onThemeChange("light")}><Sun size={16} />Light</button><button type="button" className={theme === "dark" ? "active" : ""} onClick={() => onThemeChange("dark")}><Moon size={16} />Dark</button></div></section>
        <section className="settings-panel settings-role-panel"><header className="settings-panel-heading"><span className="settings-panel-icon is-blue"><ShieldCheck size={17} /></span><div><h3>Workspace role</h3><p>Your role controls available actions.</p></div></header><div className="settings-role-value"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><CheckCircle2 size={17} /></div></section>
        <section className="settings-panel">
          <header className="settings-panel-heading"><span className="settings-panel-icon is-gold"><Layers size={17} /></span><div><h3>Awfar Kanban account</h3><p>These credentials are separate from your QA-SYS sign-in and are saved only for your user.</p></div></header>
          <form className="settings-api-config" onSubmit={saveAwfarKanbanConfig}>
            <label className="settings-field"><span>Awfar username</span><input value={awfarKanbanCredentials.username} onChange={(event) => setAwfarKanbanCredentials((current) => ({ ...current, username: event.target.value }))} autoComplete="off" maxLength={120} required /></label>
            <label className="settings-field"><span>Password <small>{awfarKanbanConfig.configured ? "Leave blank to keep the saved password" : "Encrypted when saved"}</small></span><input type="password" value={awfarKanbanCredentials.password} onChange={(event) => setAwfarKanbanCredentials((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required={!awfarKanbanConfig.configured} /></label>
            <button className="settings-secondary-button" type="submit" disabled={importBusy}>{importBusy ? "Saving..." : "Save Awfar credentials"}</button>
          </form>
        </section>
        {isAdmin && <section className={`settings-panel settings-maintenance ${maintenance ? "is-paused" : ""}`}><header className="settings-panel-heading"><span className="settings-panel-icon is-coral"><UserX size={17} /></span><div><h3>Pause workspace access</h3><p>Temporarily sign out and block all non-admin accounts.</p></div></header><div className="settings-maintenance-control"><div><strong>{maintenance ? "Access paused" : "Workspace open"}</strong><small>{maintenance ? "Admins can still sign in and resume access." : "Active Quality, Manager, and Team Leader accounts can sign in."}</small></div><button type="button" role="switch" aria-checked={maintenance} className={`settings-switch ${maintenance ? "on" : ""}`} onClick={() => void changeMaintenance(!maintenance)} disabled={saving}><span /></button></div></section>}
      </div>
    </div>}

    {section === "uploads" && (
      <div className="settings-upload-grid">
        {canImportTalkingTime && (
          <>
            <section className="settings-panel settings-api-panel">
              <header className="settings-panel-heading"><span className="settings-panel-icon is-blue"><Headphones size={18} /></span><div><h3>3CX talking time</h3><p>Fetch extension reports and add call counts and talking time for every matching active employee.</p></div><span className={`settings-api-status ${threecxConfig.configured ? "configured" : "pending"}`}><i />{threecxConfig.configured ? "Connected" : "Needs setup"}</span></header>
              {isAdmin ? <form className="settings-api-config" onSubmit={save3cxConfig}><div className="settings-api-fields"><label className="settings-field"><span>3CX username</span><input value={threecxCredentials.username} onChange={(event) => setThreecxCredentials((current) => ({ ...current, username: event.target.value }))} autoComplete="off" required /></label><label className="settings-field"><span>3CX group number</span><input value={threecxCredentials.groupNumber} onChange={(event) => setThreecxCredentials((current) => ({ ...current, groupNumber: event.target.value }))} placeholder="GRP0000" required /></label><label className="settings-field"><span>Password <small>{threecxConfig.configured ? "Leave blank to keep the saved password" : "Stored encrypted on this device"}</small></span><input type="password" autoComplete="new-password" value={threecxCredentials.password} onChange={(event) => setThreecxCredentials((current) => ({ ...current, password: event.target.value }))} required={!threecxConfig.configured} /></label></div><button className="settings-secondary-button" type="submit" disabled={importBusy}>{importBusy ? "Saving..." : "Save encrypted credentials"}</button></form> : <p className="settings-api-note">{threecxConfig.configured ? "3CX credentials are managed by an Admin." : "Ask an Admin to configure the 3CX connection."}</p>}
                            {canImportTalkingTime ? <form className="settings-api-config" onSubmit={save3cxConfig}><div className="settings-api-fields"><label className="settings-field"><span>3CX username</span><input value={threecxCredentials.username} onChange={(event) => setThreecxCredentials((current) => ({ ...current, username: event.target.value }))} autoComplete="off" required /></label><label className="settings-field"><span>3CX group number</span><input value={threecxCredentials.groupNumber} onChange={(event) => setThreecxCredentials((current) => ({ ...current, groupNumber: event.target.value }))} placeholder="GRP0000" required /></label><label className="settings-field"><span>Password <small>{threecxConfig.configured ? "Leave blank to keep the saved password" : "Stored encrypted on this device"}</small></span><input type="password" autoComplete="new-password" value={threecxCredentials.password} onChange={(event) => setThreecxCredentials((current) => ({ ...current, password: event.target.value }))} required={!threecxConfig.configured} /></label></div><button className="settings-secondary-button" type="submit" disabled={importBusy}>{importBusy ? "Saving..." : "Save encrypted credentials"}</button></form> : <p className="settings-api-note">{threecxConfig.configured ? "3CX credentials are managed by an Admin." : "Ask an Admin to configure the 3CX connection."}</p>}
              <form className="settings-api-import" onSubmit={import3cxTalkingTime}><div className="settings-api-section-title"><strong>Import reports</strong><span>Existing entries are added to, not replaced.</span></div><div className="settings-segmented" role="group" aria-label="3CX import range"><button type="button" className={threecxMode === "date" ? "active" : ""} onClick={() => setThreecxMode("date")}>Single day</button><button type="button" className={threecxMode === "month" ? "active" : ""} onClick={() => setThreecxMode("month")}>Full month</button></div>{threecxMode === "date" ? <label className="settings-field"><span>Report date</span><input type="date" value={threecxDate} max={localDateValue()} onChange={(event) => setThreecxDate(event.target.value)} required /></label> : <label className="settings-field"><span>Report month</span><input type="month" value={threecxMonth} max={currentMonth()} onChange={(event) => setThreecxMonth(event.target.value)} required /><small className="settings-api-note">For the current month, completed days are imported through yesterday.</small></label>}<button className="settings-primary-button settings-api-submit" type="submit" disabled={importBusy || !threecxConfig.configured}>{importBusy ? "Importing..." : "Import 3CX data"}</button></form>
            </section>
            <section className="settings-panel settings-api-panel">
              <header className="settings-panel-heading"><span className="settings-panel-icon is-gold"><Clock3 size={18} /></span><div><h3>Afwar talking time</h3><p>Fetch agent reports and add call counts and talking time for every matching active employee.</p></div><span className={`settings-api-status ${afwarConfig.configured ? "configured" : "pending"}`}><i />{afwarConfig.configured ? "Connected" : "Needs setup"}</span></header>
              {isAdmin ? <form className="settings-api-config" onSubmit={saveAfwarConfig}><div className="settings-api-fields"><label className="settings-field"><span>Afwar extension</span><input value={afwarCredentials.extension} onChange={(event) => setAfwarCredentials((current) => ({ ...current, extension: event.target.value }))} autoComplete="off" required /></label><label className="settings-field"><span>Password <small>{afwarConfig.configured ? "Leave blank to keep the saved password" : "Stored encrypted on this device"}</small></span><input type="password" autoComplete="new-password" value={afwarCredentials.password} onChange={(event) => setAfwarCredentials((current) => ({ ...current, password: event.target.value }))} required={!afwarConfig.configured} /></label></div><button className="settings-secondary-button" type="submit" disabled={importBusy}>{importBusy ? "Saving..." : "Save encrypted credentials"}</button></form> : <p className="settings-api-note">{afwarConfig.configured ? "Afwar credentials are managed by an Admin." : "Ask an Admin to configure the Afwar connection."}</p>}
                            {canImportTalkingTime ? <form className="settings-api-config" onSubmit={saveAfwarConfig}><div className="settings-api-fields"><label className="settings-field"><span>Afwar extension</span><input value={afwarCredentials.extension} onChange={(event) => setAfwarCredentials((current) => ({ ...current, extension: event.target.value }))} autoComplete="off" required /></label><label className="settings-field"><span>Password <small>{afwarConfig.configured ? "Leave blank to keep the saved password" : "Stored encrypted on this device"}</small></span><input type="password" autoComplete="new-password" value={afwarCredentials.password} onChange={(event) => setAfwarCredentials((current) => ({ ...current, password: event.target.value }))} required={!afwarConfig.configured} /></label></div><button className="settings-secondary-button" type="submit" disabled={importBusy}>{importBusy ? "Saving..." : "Save encrypted credentials"}</button></form> : <p className="settings-api-note">{afwarConfig.configured ? "Afwar credentials are managed by an Admin." : "Ask an Admin to configure the Afwar connection."}</p>}
              <form className="settings-api-import" onSubmit={importAfwarTalkingTime}><div className="settings-api-section-title"><strong>Import reports</strong><span>Existing entries are added to, not replaced.</span></div><div className="settings-segmented" role="group" aria-label="Afwar import range"><button type="button" className={afwarMode === "date" ? "active" : ""} onClick={() => setAfwarMode("date")}>Single day</button><button type="button" className={afwarMode === "month" ? "active" : ""} onClick={() => setAfwarMode("month")}>Full month</button></div>{afwarMode === "date" ? <label className="settings-field"><span>Report date</span><input type="date" value={afwarDate} max={localDateValue()} onChange={(event) => setAfwarDate(event.target.value)} required /></label> : <label className="settings-field"><span>Report month</span><input type="month" value={afwarMonth} max={currentMonth()} onChange={(event) => setAfwarMonth(event.target.value)} required /><small className="settings-api-note">For the current month, completed days are imported through yesterday.</small></label>}<button className="settings-primary-button settings-api-submit" type="submit" disabled={importBusy || !afwarConfig.configured}>{importBusy ? "Importing..." : "Import Afwar data"}</button></form>
            </section>
          </>
        )}
        {canImportSales && (
          <section className="settings-panel settings-api-panel settings-sales-import-panel">
            <header className="settings-panel-heading"><span className="settings-panel-icon is-coral"><FileSpreadsheet size={18} /></span><div><h3>Monthly sales workbook</h3><p>Upload the Quality Evaluation sales sheet for all active employees, across every team.</p></div></header>
            <div className="settings-api-fields settings-sales-fields"><label className="settings-field"><span>Sales month</span><input type="month" value={salesMonth} max={currentMonth()} onChange={(event) => setSalesMonth(event.target.value)} required /></label><input ref={salesFileRef} className="settings-upload-file" type="file" accept=".xlsx,.xls" onChange={(event) => { const [file] = event.target.files || []; event.target.value = ""; if (file) void importSalesWorkbook(file); }} /></div>
            <button className="settings-primary-button settings-api-submit" type="button" disabled={importBusy || !salesMonth} onClick={() => salesFileRef.current?.click()}><Upload size={15} />{importBusy ? "Importing..." : "Choose sales workbook"}</button>
            <p className="settings-api-note">The Sheet1 columns must contain 3CX and Total. Existing employees are matched by 3CX/Awfar code.</p>
          </section>
        )}
      </div>
    )}

    {section === "accounts" && isAdmin && <section className="settings-panel settings-accounts-panel"><header className="settings-panel-heading"><span className="settings-panel-icon"><Users size={18} /></span><div><h3>Accounts</h3><p>Create users, adjust roles, freeze access, or remove accounts.</p></div><button className="settings-primary-button" type="button" onClick={() => { setError(""); setEditingAccount(blankAccount()); }}><Plus size={15} />Add account</button></header><div className="settings-account-list">{accounts.map((account) => <article className={`settings-account-row ${!account.isActive ? "is-frozen" : ""} ${account.isLocked ? "is-locked" : ""}`} key={account.id}><span className="settings-account-avatar">{initials(account.name)}</span><div className="settings-account-identity"><strong>{account.name}</strong><span>@{account.username}{account.email ? ` · ${account.email}` : ""}</span></div><span className="settings-role-pill">{account.role}</span><span className={`settings-presence ${account.isLocked ? "locked" : !account.isActive ? "frozen" : account.online ? "online" : "offline"}`}><i />{account.isLocked ? "Locked" : !account.isActive ? "Frozen" : account.online ? "Online" : "Offline"}</span><div className="settings-row-actions"><button type="button" className="settings-icon-button" title="Edit account" aria-label={`Edit ${account.name}`} onClick={() => { setError(""); setEditingAccount(account); }}><Pencil size={15} /></button>{account.id !== user.id && <><button type="button" className="settings-icon-button" title={account.isActive ? "Freeze account" : "Reactivate account"} aria-label={account.isActive ? `Freeze ${account.name}` : `Reactivate ${account.name}`} onClick={() => void changeAccountState(account, !account.isActive)}><LockKeyhole size={15} /></button>{account.isLocked && <button type="button" className="settings-icon-button is-success" title="Unlock account" aria-label={`Unlock ${account.name}`} onClick={() => void unlockAccount(account)}><ShieldCheck size={15} /></button>}<button type="button" className="settings-icon-button is-danger" title="Delete account" aria-label={`Delete ${account.name}`} onClick={() => void deleteAccount(account)}><Trash2 size={15} /></button></>}</div></article>)}{!loading && !accounts.length && <div className="settings-empty">No accounts found.</div>}</div></section>}

    {section === "status" && isAdmin && <section className="settings-panel settings-status-panel"><header className="settings-panel-heading"><span className="settings-panel-icon is-blue"><Activity size={18} /></span><div><h3>Account status</h3><p>Live presence updates while signed-in accounts are active.</p></div><span className="settings-live-label"><i />LIVE</span></header><div className="settings-status-summary"><article><span className="is-online"><i />Online</span><strong>{onlineCount}</strong></article><article><span className="is-offline"><i />Offline</span><strong>{offlineCount}</strong></article><article><span className="is-frozen"><i />Frozen</span><strong>{frozenCount}</strong></article></div><div className="settings-status-table"><div className="settings-status-header"><span>ACCOUNT</span><span>ROLE</span><span>STATUS</span><span>LAST SEEN</span></div>{accounts.map((account) => <div className="settings-status-row" key={account.id}><div><strong>{account.name}</strong><small>@{account.username}{account.email ? ` · ${account.email}` : ""}</small></div><span>{account.role}</span><span className={`settings-presence ${!account.isActive ? "frozen" : account.online ? "online" : "offline"}`}><i />{!account.isActive ? "Frozen" : account.online ? "Online" : "Offline"}</span><time>{formatDate(account.lastSeenAt)}</time></div>)}</div></section>}

    {section === "transfers" && <div className="settings-transfer-layout">
      <form className="settings-panel settings-transfer-form" onSubmit={createTransfer}><header className="settings-panel-heading"><span className="settings-panel-icon is-blue"><RefreshCw size={18} /></span><div><h3>Start a transfer</h3><p>{isAdmin ? "Admin transfers take effect immediately." : "The receiving Quality account must approve the request."}</p></div></header>
        <div className="settings-segmented" role="group" aria-label="Transfer type"><button type="button" className={transfer.kind === "team" ? "active" : ""} onClick={() => void changeTransferKind("team")}>Team</button><button type="button" className={transfer.kind === "employee" ? "active" : ""} onClick={() => void changeTransferKind("employee")}>Employee</button></div>
        <label className="settings-field"><span>{transfer.kind === "team" ? "Team to transfer" : "Employee's current team"}</span><select required value={transfer.sourceTeamId} onChange={(event) => setTransfer({ ...transfer, sourceTeamId: event.target.value, employeeId: "", targetTeamId: "" })}><option value="">Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.qualityOwnerId ? "" : " · Unassigned"}</option>)}</select></label>
        {transfer.kind === "employee" && <label className="settings-field"><span>Employee</span><select required value={transfer.employeeId} onChange={(event) => setTransfer({ ...transfer, employeeId: event.target.value })} disabled={!transfer.sourceTeamId}><option value="">Choose an active employee</option>{sourceEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeType}</option>)}</select></label>}
        <label className="settings-field"><span>Receiving Quality account</span><select required value={transfer.toQualityId} onChange={(event) => setTransfer({ ...transfer, toQualityId: event.target.value, targetTeamId: "" })}><option value="">Choose Quality account</option>{qualityAccounts.filter((account) => account.id !== selectedTeam?.qualityOwnerId).map((account) => <option key={account.id} value={account.id}>{account.name}{account.email ? ` · ${account.email}` : ""}</option>)}</select></label>
        {transfer.kind === "employee" && <label className="settings-field"><span>Receiving team</span><select required value={transfer.targetTeamId} onChange={(event) => setTransfer({ ...transfer, targetTeamId: event.target.value })} disabled={!transfer.toQualityId}><option value="">Choose a team assigned to this account</option>{destinationTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>{transfer.toQualityId && !destinationTeams.length && <small className="settings-field-note">The receiving account has no other assigned teams.</small>}</label>}
        {isAdmin && <p className="settings-admin-note"><ShieldCheck size={15} />This transfer updates the assignment immediately without recipient approval.</p>}
        <button className="settings-primary-button settings-transfer-submit" type="submit" disabled={saving || loading}>{saving ? "Working..." : isAdmin ? "Transfer now" : "Send approval request"}</button>
      </form>
      <section className="settings-panel settings-requests-panel"><header className="settings-panel-heading"><span className="settings-panel-icon is-gold"><Clock3 size={18} /></span><div><h3>Transfer requests</h3><p>Incoming approvals and recent assignment activity.</p></div><span className="settings-request-count">{pendingRequests.length} pending</span></header>
        <div className="settings-request-list">{requests.map((request) => {
          const incoming = request.toQualityId === user.id;
          const canRespond = request.status === "pending" && (isAdmin || incoming);
          const description = request.kind === "team"
            ? `${request.sourceTeamName} · team ownership`
            : `${request.employeeName} · ${request.sourceTeamName} to ${request.targetTeamName}`;
          return <article className="settings-request-row" key={request.id}><span className={`settings-request-icon ${request.status}`}><RefreshCw size={15} /></span><div className="settings-request-copy"><strong>{request.kind === "team" ? "Team ownership transfer" : "Employee transfer"}</strong><span>{description}</span><small>{request.fromQualityName} → {request.toQualityName} · {formatDate(request.createdAt)}</small>{request.statusNote && request.status !== "pending" && <small>{request.statusNote}</small>}</div><span className={`settings-request-status ${request.status}`}>{request.status}</span>{canRespond && <div className="settings-request-actions"><button type="button" title="Approve" aria-label="Approve transfer" disabled={saving} onClick={() => void respondToTransfer(request, true)}><Check size={15} /></button><button type="button" title="Decline" aria-label="Decline transfer" disabled={saving} onClick={() => void respondToTransfer(request, false)}><X size={15} /></button></div>}</article>;
        })}{!loading && !requests.length && <div className="settings-empty">No transfer requests yet.</div>}</div>
      </section>
    </div>}

    {section === "updates" && <section className="settings-panel settings-updates-panel">
      <header className="settings-panel-heading"><span className="settings-panel-icon is-blue"><CloudDownload size={18} /></span><div><h3>App updates</h3><p>Stay up to date with the latest features and improvements.</p>{currentVersion && <span className="settings-version-badge">v{currentVersion}</span>}</div></header>
      <div className="settings-update-status">
        {!updateStatus && <div className="settings-update-idle">
          <CloudDownload size={32} />
          <strong>Check for updates</strong>
          <small>Click the button below to see if a new version is available.</small>
        </div>}
        {updateStatus === "checking" && <div className="settings-update-checking">
          <RefreshCw size={32} className="is-spinning" />
          <strong>Checking for updates...</strong>
          <small>Please wait while we check for the latest version.</small>
        </div>}
        {updateStatus === "available" && <div className="settings-update-available">
          <Download size={32} />
          <strong>New update available!</strong>
          <small>{updateInfo ? `Version ${updateInfo.version} is available (${updateInfo.releaseName || ""})` : "A new version is ready to download."}</small>
          <small>After installation, you'll need to close and reopen the application.</small>
          <button className="settings-primary-button" type="button" onClick={downloadUpdate} disabled={updateStatus === "downloading"}><Download size={15} />Download update</button>
        </div>}
        {updateStatus === "downloading" && <div className="settings-update-downloading">
          <RefreshCw size={32} className="is-spinning" />
          <strong>Downloading update...</strong>
          <small>{updateProgress}% complete. Please don't close the application.</small>
        </div>}
        {updateStatus === "downloaded" && <div className="settings-update-downloaded">
          <CheckCircle2 size={32} />
          <strong>Update ready to install</strong>
          <small>The update has been downloaded. Click below to install and restart the application automatically.</small>
          <button className="settings-primary-button settings-update-install-button" type="button" onClick={installUpdate}><RefreshCw size={15} />Install and restart application</button>
          <p className="settings-update-warning"><CircleAlert size={14} />The application will close and restart automatically during installation.</p>
        </div>}
        {updateStatus === "not-available" && <div className="settings-update-not-available">
          <CheckCircle2 size={32} />
          <strong>You're up to date</strong>
          <small>The application is running the latest version.</small>
        </div>}
        {updateStatus === "error" && <div className="settings-update-error">
          <CircleAlert size={32} />
          <strong>Update error</strong>
          <small>There was a problem checking for or downloading updates. Please try again later.</small>
        </div>}
        {updateStatus === "cancelled" && <div className="settings-update-error">
          <CircleAlert size={32} />
          <strong>Update cancelled</strong>
          <small>The update was cancelled. Please try again later.</small>
        </div>}
      </div>
      <footer className="settings-form-footer">
        <button className="settings-secondary-button" type="button" onClick={checkForUpdates} disabled={updateStatus === "checking" || updateStatus === "downloading"}><RefreshCw size={15} />Check for updates</button>
      </footer>
    </section>}

    {editingAccount && <AccountEditor account={editingAccount.id ? editingAccount : null} onClose={() => { setEditingAccount(null); setError(""); }} onSave={saveAccount} saving={saving} error={error} availableTeams={teams} />}
  </div>;
}

export default SettingsPage;