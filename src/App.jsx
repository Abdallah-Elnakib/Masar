import { Component, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  CloudDownload,
  Eye,
  EyeOff,
  Headphones,
  LayoutDashboard,
  Layers,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Users,
  X,
} from "lucide-react";
import TeamsPage from "./TeamsPage.jsx";
import EmployeesPage from "./EmployeesPage.jsx";
import QualityEvaluationPage from "./QualityEvaluationPage.jsx";
import TalkingTimePage from "./TalkingTimePage.jsx";
import CallsTrackingPage from "./CallsTrackingPage.jsx";
import CustomKpiPage from "./CustomKpiPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import DashboardPage from "./DashboardPage.jsx";
import AwfarKanbanPage from "./AwfarKanbanPage.jsx";
import PerformancePage from "./PerformancePage.jsx";
import AlertsPage from "./AlertsPage.jsx";
import CoachingPage from "./CoachingPage.jsx";
import "./dashboard-page.css";

const allPages = [
  { id: "Dashboard", icon: LayoutDashboard },
  { id: "Teams", icon: Building2 },
  { id: "Employees", icon: Users },
  { id: "Alerts", icon: Bell },
  { id: "Talking Time", icon: Clock3 },
  { id: "Calls Tracking", icon: Headphones },
  { id: "Awfar Kanban", icon: Layers },
  { id: "Quality Evaluation", icon: ClipboardCheck },
  { id: "Coaching", icon: MessageSquareText },
  { id: "Performance", icon: Activity },
  { id: "Custom KPI", icon: Target },
  { id: "Settings", icon: Settings },
];

const rolePages = {
  Admin: allPages.map((page) => page.id),
  Quality: ["Dashboard", "Alerts", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"],
  "Team Leader": ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"],
  Manager: ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"],
};

const pageDetails = {
  Teams: {
    subtitle: "Manage team structure and day-to-day coverage.",
  },
  Employees: {
    subtitle: "A clear view of every agent and their current status.",
  },
  Alerts: {
    subtitle: "Items that need a closer look from your team.",
    action: "View all alerts",
    columns: ["ALERT", "EMPLOYEE", "TEAM", "PRIORITY", "TIME"],
    rows: [
      ["Quality score below target", "ليلى سامي", "Alexandria", "High", "10:42 AM"],
      ["Unusually long hold time", "هنا مصطفى", "Cairo North", "Medium", "10:18 AM"],
      ["Evaluation needs review", "يوسف إبراهيم", "Cairo Central", "Low", "09:56 AM"],
    ],
  },
  "Talking Time": {
    subtitle: "Track daily talk hours and each employee's monthly target contribution.",
  },
  "Calls Tracking": {
    subtitle: "Review recent calls and follow-up status.",
    action: "Export calls",
    columns: ["CALL ID", "EMPLOYEE", "CUSTOMER", "DURATION", "OUTCOME"],
    rows: [
      ["CL-28419", "مريم حسن", "أحمد عبد الله", "08:24", "Resolved"],
      ["CL-28418", "يوسف إبراهيم", "سلمى عادل", "12:06", "Follow-up"],
      ["CL-28417", "ليلى سامي", "كريم نبيل", "06:51", "Escalated"],
      ["CL-28416", "آدم محمود", "ندى فؤاد", "09:32", "Resolved"],
    ],
  },
  "Quality Evaluation": {
    subtitle: "Keep customer conversations consistent and human.",
  },
  Performance: {
    subtitle: "Recognize the work behind every customer conversation.",
    action: "Export report",
    columns: ["EMPLOYEE", "TEAM", "QUALITY", "CSAT", "RANK"],
    rows: [
      ["مريم حسن", "Cairo North", "97.4%", "98.2%", "01"],
      ["آدم محمود", "Giza West", "95.3%", "96.8%", "02"],
      ["نور أحمد", "Alexandria", "94.8%", "96.3%", "03"],
      ["يوسف إبراهيم", "Cairo Central", "92.1%", "94.7%", "04"],
    ],
  },
};

function LoginScreen({ onLogin, notice }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (notice) setError(notice); }, [notice]);

  useEffect(() => {
    let active = true;

    async function loadRememberedCredentials() {
      try {
        const result = await window.qaDesk.auth.loadRemembered();
        if (!active || !result.ok || !result.credentials) return;
        setIdentifier(result.credentials.identifier);
        setPassword(result.credentials.password);
        setRememberMe(true);
      } catch {
        return;
      }
    }

    if (window.qaDesk?.auth?.loadRemembered) void loadRememberedCredentials();
    return () => { active = false; };
  }, []);

  async function toggleRemember(event) {
    const remember = event.target.checked;
    setRememberMe(remember);
    if (remember) return;

    try {
      const result = await window.qaDesk.auth.saveRemembered({ remember: false });
      if (!result.ok) setError(result.message);
    } catch {
      setError("Saved sign-in details could not be cleared.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await window.qaDesk.auth.login({ identifier, password });
      if (!result.ok) {
        setError(result.message);
        return;
      }

      const saved = await window.qaDesk.auth.saveRemembered({ identifier, password, remember: rememberMe });
      if (!saved.ok) {
        setError(saved.message);
        return;
      }
      onLogin(result.user);
    } catch {
      setError("The desktop service could not be reached. Restart the app and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-background">
        <div className="login-mesh-gradient" />
        <div className="login-grid-pattern" />
        <div className="login-gradient-orb orb-1" />
        <div className="login-gradient-orb orb-2" />
        <div className="login-gradient-orb orb-3" />
        <div className="login-gradient-orb orb-4" />
      </div>

      <div className="login-container">
        <div className="login-left-panel">
          <div className="login-illustration">
            <div className="illustration-circle circle-1" />
            <div className="illustration-circle circle-2" />
            <div className="illustration-circle circle-3" />
          </div>

          <div className="login-brand">
            <BrandMark />
            <div className="brand-text">
              <h1>Northstar</h1>
              <p>Quality Operations</p>
            </div>
          </div>

          <div className="login-features">
            <div className="feature-item">
              <div className="feature-icon">
                <ShieldCheck size={24} />
              </div>
              <div className="feature-content">
                <h3>Enterprise Security</h3>
                <p>Advanced encryption and multi-factor authentication</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <Activity size={24} />
              </div>
              <div className="feature-content">
                <h3>Real-time Analytics</h3>
                <p>Comprehensive quality monitoring and insights</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <Users size={24} />
              </div>
              <div className="feature-content">
                <h3>Team Collaboration</h3>
                <p>Seamless communication and workflow management</p>
              </div>
            </div>
          </div>

          <div className="login-testimonial">
            <div className="testimonial-content">
              <p>"Northstar transformed our quality operations. The insights and automation have improved our team's performance by 40%."</p>
              <div className="testimonial-author">
                <span className="author-name">Sarah Mitchell</span>
                <span className="author-role">Quality Director</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-right-panel">
          <div className="login-form-wrapper">
            <div className="login-header">
              <div className="header-badge">
                <span className="badge-icon">✨</span>
                <span>Enhanced Security</span>
              </div>
              <h2>Welcome Back</h2>
              <p>Access your workspace and continue where you left off</p>
            </div>

            <form onSubmit={submit} className="login-form">
              <div className="form-group">
                <label htmlFor="username">
                  <Users size={16} />
                  Username or Email
                </label>
                <div className="form-input-wrapper">
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your username or email"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    required
                  />
                  <div className="input-border" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">
                  <LockKeyhole size={16} />
                  Password
                </label>
                <div className="form-input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <div className="input-border" />
                </div>
                <div className="form-actions">
                  <label className="remember-me" htmlFor="remember-me">
                    <input
                      id="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={toggleRemember}
                    />
                    <span className="checkbox-custom">
                      <Check size={12} />
                    </span>
                    <span>Remember me for 30 days</span>
                  </label>
                  <button
                    type="button"
                    className="forgot-password"
                    onClick={() => setError("Contact your workspace administrator to reset your password.")}
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              {error && (
                <div className="form-error" role="alert">
                  <CircleAlert size={18} />
                  <span>{error}</span>
                  <button onClick={() => setError("")} aria-label="Dismiss">
                    <X size={16} />
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="login-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="spinner" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="login-divider">
              <span>Or continue with</span>
            </div>

            <div className="login-social">
              <button type="button" className="social-btn sso-btn">
                <ShieldCheck size={20} />
                <span>SSO Login</span>
              </button>
            </div>

            <div className="login-footer">
              <div className="footer-security">
                <ShieldCheck size={14} />
                <span>Protected by enterprise-grade encryption</span>
              </div>
              <div className="footer-links">
                <a href="#">Privacy Policy</a>
                <span>•</span>
                <a href="#">Terms of Service</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
      </svg>
    </span>
  );
}

function AlertRow({ tone, title, person, time }) {
  return <div className="alert-row"><span className={`alert-indicator ${tone}`}><Bell size={15} /></span><div className="alert-copy"><strong>{title}</strong><span dir="auto">{person}</span></div><time>{time}</time></div>;
}

function DataTable({ columns, rows }) {
  const statusValues = ["Active", "Review", "Coaching", "Follow-up", "Escalated", "Resolved", "Complete", "Pending"];

  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => {
    const isStatus = cellIndex === row.length - 1 && statusValues.includes(cell);
    return <td key={`${cell}-${cellIndex}`} dir={cellIndex === 0 && /[\u0600-\u06FF]/.test(cell) ? "rtl" : undefined}>{isStatus ? <span className={`status status-${cell.toLowerCase().replaceAll(" ", "-")}`}>{cell}<i /></span> : cell}</td>;
  })}</tr>)}</tbody></table></div>;
}

class PageErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Page render failed:", error);
    console.error("Error stack:", error.stack);
    console.error("Component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <section className="page-render-error" role="alert"><CircleHelp size={22} /><div><strong>This page could not be displayed.</strong><span>{this.state.error?.message || "Return to another page or try opening this page again."}</span></div><button type="button" onClick={() => this.setState({ hasError: false, error: null })}>Retry</button></section>;
    }
    return this.props.children;
  }
}

function PageContent({ page, user, can, onUserUpdate, theme, onThemeChange }) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  if (page === "Teams") return <TeamsPage canManage={can("canManageTeams")} user={user} />;
  if (page === "Employees") return <div className="content-area"><EmployeesPage canManage={can("canManageEmployees")} user={user} /></div>;
  if (page === "Alerts") return <AlertsPage />;
  if (page === "Talking Time") return <TalkingTimePage canEdit={can("canEditTalkingTime")} user={user} />;
  if (page === "Calls Tracking") return <CallsTrackingPage canEdit={can("canEditCalls")} user={user} />;
  if (page === "Awfar Kanban") return <AwfarKanbanPage user={user} />;
  if (page === "Quality Evaluation") return <QualityEvaluationPage evaluatorId={user.id} canEditSales={can("canEditSales")} canEvaluate={can("canEvaluate")} canManageEmployees={can("canManageEmployees")} user={user} />;
  if (page === "Coaching") return <CoachingPage user={user} />;
  if (page === "Custom KPI") return <CustomKpiPage user={user} />;
  if (page === "Performance") return <PerformancePage user={user} />;
  if (page === "Dashboard") return <DashboardPage user={user} can={can} />;
  if (page === "Settings") return <SettingsPage user={user} onUserUpdate={onUserUpdate} theme={theme} onThemeChange={onThemeChange} />;

  const details = pageDetails[page];
  if (!details) return null;
  const rows = details.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(query.toLowerCase())));

  return <section className="panel table-panel list-page-panel">
    <div className="list-toolbar"><div className="table-search"><Search size={16} /><input aria-label={`Search ${page}`} placeholder={`Search ${page.toLowerCase()}...`} value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="quiet-button" onClick={() => setNotice(`${details.action} will be available when workspace data is connected.`)}>{details.action}<ArrowRight size={15} /></button></div>
    {notice && <p className="inline-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></p>}
    <DataTable columns={details.columns} rows={rows} />
    {rows.length === 0 && <p className="empty-results">No matching records.</p>}
    <div className="table-foot"><span>Showing {rows.length} of {details.rows.length} records</span><span>Updated just now</span></div>
  </section>;
}

function App() {
  const [user, setUser] = useState(null);
  const [accessNotice, setAccessNotice] = useState("");
  const [page, setPage] = useState("Dashboard");
  const [theme, setTheme] = useState(() => window.localStorage.getItem("qa-theme") === "dark" ? "dark" : "light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [globalResults, setGlobalResults] = useState([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const requestedPages = Array.isArray(user?.permissions?.pages) ? user.permissions.pages : null;
  const allowedPages = useMemo(() => {
    const pages = user?.role === "Admin"
      ? allPages.map((item) => item.id)
      : requestedPages || rolePages[user?.role] || [];
    return pages.includes("Awfar Kanban") && !pages.includes("Settings")
      ? [...pages, "Settings"]
      : pages;
  }, [user?.role, requestedPages]);
  const can = (permission) => user?.role === "Admin" || user?.permissions?.[permission] === true;
  const visiblePages = useMemo(() => allPages.filter((item) => allowedPages.includes(item.id)), [allowedPages]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem("qa-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.qaDesk?.updater?.getVersion?.().then((result) => {
      if (result?.ok) {
        setAppVersion(result.version);
      }
    });
  }, []);

  useEffect(() => {
    if (!user?.id || !window.qaDesk?.settings?.heartbeat) return undefined;
    let active = true;
    async function heartbeat() {
      try {
        const result = await window.qaDesk.settings.heartbeat(user.id);
        if (!active) return;
        if (result.maintenance) {
          setAccessNotice("Workspace access is temporarily paused by an Admin.");
          setUser(null);
        } else if (result.inactive) {
          setAccessNotice("This account is no longer active. Contact an Admin.");
          setUser(null);
        } else if (result.permissions) {
          setUser((current) => current?.id === user.id ? { ...current, permissions: result.permissions } : current);
        }
      } catch {
        return;
      }
    }
    void heartbeat();
    const interval = window.setInterval(() => { void heartbeat(); }, 20_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [user?.id]);

  useEffect(() => {
    if (!window.qaDesk?.updater?.onUpdateStatus) return undefined;
    const listener = (data) => {
      setUpdateStatus(data.status);
      if (data.status === "available" || data.status === "downloaded") {
        setUpdateDismissed(false);
      }
    };
    window.qaDesk.updater.onUpdateStatus(listener);
    return () => {
      window.qaDesk.updater.onUpdateStatus(null);
    };
  }, []);

  useEffect(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      setGlobalResults([]);
      setGlobalSearchLoading(false);
      return undefined;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      setGlobalSearchLoading(true);
      const results = [];
      for (const item of visiblePages) {
        if (item.id.toLocaleLowerCase().includes(query)) {
          results.push({ type: "page", title: item.id, detail: "Open page", pageId: item.id });
        }
      }

      const [employeeResult, teamResult] = await Promise.allSettled([
        window.qaDesk.employees.list(),
        window.qaDesk.teams.list(),
      ]);

      if (employeeResult.status === "fulfilled" && employeeResult.value.ok) {
        for (const employee of employeeResult.value.employees) {
          if (![employee.fullName, employee.code3cx, employee.awfarCode, employee.email, employee.teamName]
            .some((value) => String(value || "").toLocaleLowerCase().includes(query))) continue;
          results.push({
            type: "employee",
            title: employee.fullName,
            detail: [employee.teamName, employee.code3cx && `3CX ${employee.code3cx}`, employee.awfarCode && `Awfar ${employee.awfarCode}`].filter(Boolean).join(" · "),
            pageId: "Employees",
          });
        }
      }

      if (teamResult.status === "fulfilled" && teamResult.value.ok) {
        for (const team of teamResult.value.teams) {
          if (![team.teamName, team.teamLeader?.name, team.teamLeader?.email, team.qualityOwnerName]
            .some((value) => String(value || "").toLocaleLowerCase().includes(query))) continue;
          results.push({ type: "team", title: team.teamName, detail: `${team.employeeCount} employees · Team`, pageId: "Teams" });
        }
      }

      for (const [pageId, details] of Object.entries(pageDetails)) {
        if (!allowedPages.includes(pageId) || !details.rows) continue;
        for (const row of details.rows) {
          if (!row.some((value) => String(value).toLocaleLowerCase().includes(query))) continue;
          results.push({ type: "record", title: row[0], detail: `${pageId} · ${row.slice(1, 3).join(" · ")}`, pageId });
        }
      }

      if (active) {
        setGlobalResults(results.slice(0, 12));
        setGlobalSearchLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [search, visiblePages, allowedPages]);

  if (!user) return <LoginScreen notice={accessNotice} onLogin={(signedInUser) => { setAccessNotice(""); setUser(signedInUser); setPage("Dashboard"); }} />;

  const currentPage = allowedPages.includes(page) ? page : allowedPages[0];
  const heading = currentPage === "Dashboard" ? "Good morning" : currentPage;
  const subheading = currentPage === "Dashboard" ? "Here's what's happening across your teams today." : currentPage === "Coaching" ? "Document coaching conversations and follow-up plans for your teams." : pageDetails[currentPage]?.subtitle || "Manage your workspace preferences.";
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  function openGlobalResult(result) {
    if (!allowedPages.includes(result.pageId)) return;
    setPage(result.pageId);
    setSearch("");
    setGlobalSearchOpen(false);
    setMenuOpen(false);
  }

  return <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-theme={theme}>
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="sidebar-brand"><BrandMark /><span className="sidebar-brand-name">Northstar</span><button className="sidebar-collapse-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace-switcher"><span className="workspace-symbol">N</span><span className="workspace-name"><strong>Northstar Ops</strong><small>Quality workspace</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">{visiblePages.map(({ id, icon: Icon }) => <button className={`nav-item ${currentPage === id ? "active" : ""}`} key={id} title={sidebarCollapsed ? id : undefined} onClick={() => { setPage(id); setMenuOpen(false); }}><Icon size={17} strokeWidth={1.8} /><span>{id}</span>{id === "Alerts" && <i className="nav-count">3</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-account"><span className="avatar">{initials}</span><span className="account-copy"><strong>{user.name}</strong><small>{user.role}</small>{appVersion && <small className="version-tag">v{appVersion}</small>}</span><button className="logout-button" title="Sign out" onClick={() => { void window.qaDesk.settings.logout(user.id); setUser(null); }}><LogOut size={16} /></button></div></div>
    </aside>
    {sidebarCollapsed && <button className="sidebar-toggle-float" onClick={() => setSidebarCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar"><PanelLeftOpen size={16} /></button>}
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    {(updateStatus === "available" || updateStatus === "downloaded") && !updateDismissed && <div className="global-update-notification">
      <div className="global-update-notification-content">
        <CloudDownload size={20} />
        <div>
          <strong>New update available!</strong>
          <small>A new version is ready to install. Please update to continue using the latest features.</small>
        </div>
        <div className="global-update-notification-actions">
          <button type="button" className="global-update-dismiss" onClick={() => setUpdateDismissed(true)}>Dismiss</button>
          <button type="button" className="global-update-action" onClick={() => { setPage("Settings"); setTimeout(() => window.qaDesk?.updater?.download?.(), 100); }}>Update now</button>
        </div>
      </div>
    </div>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{currentPage}</strong></div><div className="global-search-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setGlobalSearchOpen(false); }}><label className="global-search"><Search size={16} /><input placeholder="Search anything..." value={search} onFocus={() => setGlobalSearchOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setSearch(""); setGlobalSearchOpen(false); } if (event.key === "Enter" && globalResults[0]) openGlobalResult(globalResults[0]); }} onChange={(event) => { setSearch(event.target.value); setGlobalSearchOpen(true); }} /><kbd>⌘ K</kbd></label>{globalSearchOpen && search.trim() && <div className="global-search-results" role="listbox" aria-label="Search results">{globalSearchLoading ? <div className="global-search-empty">Searching workspace...</div> : globalResults.length ? globalResults.map((result, index) => { const Icon = result.type === "page" ? (visiblePages.find((item) => item.id === result.pageId)?.icon || Search) : result.type === "team" || result.type === "employee" ? Users : Search; return <button type="button" className="global-search-result" role="option" key={`${result.type}-${result.pageId}-${result.title}-${index}`} onClick={() => openGlobalResult(result)}><span className={`global-result-icon ${result.type}`}><Icon size={15} /></span><span><strong>{result.title}</strong><small>{result.detail}</small></span><ArrowRight size={14} /></button>; }) : <div className="global-search-empty">No results found.</div>}</div>}</div></header>
      <div className={`content-area ${currentPage === "Dashboard" ? "is-dashboard" : ""}`}>
        {currentPage !== "Dashboard" && (
          <div className="page-heading">
            <div>
              <div className="date-line"><span className="live-dot" /> WORKSPACE</div>
              <h1>{heading}</h1>
              <p>{subheading}</p>
            </div>
          </div>
        )}
        <PageErrorBoundary key={currentPage}>
          <PageContent page={currentPage} user={user} can={can} onUserUpdate={(updatedUser) => setUser((current) => ({ ...current, ...updatedUser }))} theme={theme} onThemeChange={setTheme} />
        </PageErrorBoundary>
      </div>
      <footer className="app-footer"><span>Northstar Operations <i /> Internal workspace</span><span>All systems operational <i className="footer-live" /></span></footer>
    </main>
  </div>;
}

export default App;
