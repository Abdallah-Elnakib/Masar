import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CircleAlert,
  Clock3,
  FileClock,
  Mail,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import "./coaching-page.css";

function formatDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function monthLabel(value) {
  if (!value) return "This month";
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? "This month" : date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function CoachingPage() {
  const [employees, setEmployees] = useState([]);
  const [month, setMonth] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [draft, setDraft] = useState({ coachingDone: "", nextSteps: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function loadEmployees() {
    setLoading(true);
    setLoadError("");
    try {
      const result = await window.qaDesk.coaching.list();
      if (!result.ok) {
        setLoadError(result.message || "Coaching employees could not be loaded.");
        return;
      }
      setEmployees(result.employees);
      setMonth(result.month);
    } catch {
      setLoadError("Coaching employees could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    if (dialog?.mode !== "history") return undefined;
    let active = true;
    setReportsLoading(true);
    setReportsError("");
    setReports([]);
    setSelectedReport(null);
    window.qaDesk.coaching.reportsList(dialog.employee.id).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setReportsError(result.message || "Previous reports could not be loaded.");
        return;
      }
      setReports(result.reports);
    }).catch(() => {
      if (active) setReportsError("Previous reports could not be loaded. Check your connection and try again.");
    }).finally(() => {
      if (active) setReportsLoading(false);
    });
    return () => { active = false; };
  }, [dialog?.mode, dialog?.employee?.id]);

  const groupedEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const groups = new Map();
    for (const employee of employees) {
      if (normalizedQuery && ![
        employee.fullName,
        employee.code3cx,
        employee.awfarCode,
        employee.teamName,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery))) continue;
      const key = employee.teamId || employee.teamName;
      if (!groups.has(key)) groups.set(key, { id: key, name: employee.teamName, employees: [] });
      groups.get(key).employees.push(employee);
    }
    return [...groups.values()];
  }, [employees, query]);

  function openComposer(employee) {
    setDraft({ coachingDone: "", nextSteps: "" });
    setSaveError("");
    setDialog({ mode: "create", employee });
  }

  function closeDialog() {
    if (saving) return;
    setDialog(null);
    setSelectedReport(null);
  }

  async function saveReport(event) {
    event.preventDefault();
    if (!dialog?.employee) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await window.qaDesk.coaching.reportSave({
        employeeId: dialog.employee.id,
        coachingDone: draft.coachingDone,
        nextSteps: draft.nextSteps,
      });
      if (!result.ok) {
        setSaveError(result.message || "The coaching report could not be saved.");
        return;
      }
      setNotice({ message: result.message, emailSent: result.emailSent });
      setDialog(null);
      setDraft({ coachingDone: "", nextSteps: "" });
    } catch {
      setSaveError("The coaching report could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="coaching-page">
    <div className="coaching-overview">
      <div className="coaching-overview-icon"><MessageSquareText size={21} /></div>
      <div className="coaching-overview-copy">
        <span className="coaching-kicker">PEOPLE DEVELOPMENT</span>
        <h2>Coaching conversations</h2>
        <p>Keep clear records of what was discussed and the actions each employee will take next.</p>
      </div>
      <div className="coaching-overview-period"><CalendarDays size={16} /><span>{monthLabel(month)} sales</span></div>
    </div>

    {notice && <div className={`coaching-notice ${notice.emailSent ? "is-success" : "is-warning"}`} role="status">
      {notice.emailSent ? <Mail size={17} /> : <CircleAlert size={17} />}
      <span>{notice.message}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button>
    </div>}

    <section className="coaching-directory">
      <header className="coaching-directory-header">
        <div>
          <span className="coaching-kicker">TEAM DIRECTORY</span>
          <h3>Employees by team</h3>
          <p>Employee visibility follows your assigned team access.</p>
        </div>
        <label className="coaching-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code or team" aria-label="Search coaching employees" /></label>
      </header>

      {loadError && <div className="coaching-empty coaching-error"><CircleAlert size={22} /><strong>{loadError}</strong><button type="button" onClick={() => void loadEmployees()}>Try again</button></div>}
      {loading && <div className="coaching-empty"><span className="coaching-spinner" /><strong>Loading team employees...</strong></div>}
      {!loading && !loadError && groupedEmployees.length === 0 && <div className="coaching-empty"><Users size={23} /><strong>{employees.length ? "No employees match your search." : "No active employees are available for coaching."}</strong><span>Employees appear here according to your team permissions.</span></div>}

      {!loading && !loadError && groupedEmployees.map((group) => <section className="coaching-team" key={group.id}>
        <header className="coaching-team-header">
          <div className="coaching-team-mark"><Users size={17} /></div>
          <div><h4>{group.name}</h4><span>{group.employees.length} {group.employees.length === 1 ? "employee" : "employees"}</span></div>
          {group.employees[0]?.teamLeaderName && <span className="coaching-team-leader">Team leader <strong>{group.employees[0].teamLeaderName}</strong></span>}
        </header>
        <div className="coaching-table-wrap">
          <table className="coaching-table">
            <thead><tr>
              <th>EMPLOYEE</th><th>EMPLOYEE CODES</th><th>HIRE DATE</th><th>{monthLabel(month).toUpperCase()} SALES</th><th>REPORTS</th>
            </tr></thead>
            <tbody>{group.employees.map((employee) => <tr key={employee.id}>
              <td><span className="coaching-employee-name">{employee.fullName}</span><span className="coaching-employee-team">{employee.teamName}</span></td>
              <td><div className="coaching-codes">{employee.code3cx && <span>3CX <strong>{employee.code3cx}</strong></span>}{employee.awfarCode && <span>Awfar <strong>{employee.awfarCode}</strong></span>}{!employee.code3cx && !employee.awfarCode && <span>—</span>}</div></td>
              <td className="coaching-muted">{formatDate(employee.hireDate)}</td>
              <td className="coaching-sales">{employee.sales == null ? "—" : Number(employee.sales).toLocaleString()}</td>
              <td><div className="coaching-row-actions">
                <button type="button" className="coaching-history-button" onClick={() => setDialog({ mode: "history", employee })}><FileClock size={15} />Previous reports</button>
                <button type="button" className="coaching-add-button" onClick={() => openComposer(employee)}><Plus size={15} />Add report</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>)}
      {!loading && !loadError && groupedEmployees.length > 0 && <footer className="coaching-directory-footer"><span>{groupedEmployees.reduce((total, group) => total + group.employees.length, 0)} employees</span><span>Sales for {monthLabel(month)}</span></footer>}
    </section>

    {dialog?.mode === "create" && <div className="coaching-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <form className="coaching-dialog" onSubmit={saveReport} role="dialog" aria-modal="true" aria-labelledby="coaching-dialog-title">
        <header className="coaching-dialog-header">
          <div className="coaching-dialog-icon"><MessageSquareText size={20} /></div>
          <div><span className="coaching-kicker">NEW SESSION REPORT</span><h3 id="coaching-dialog-title">Coaching for {dialog.employee.fullName}</h3><p>{dialog.employee.teamName}{dialog.employee.email ? ` · ${dialog.employee.email}` : " · No employee email on file"}</p></div>
          <button type="button" className="coaching-close-button" onClick={closeDialog} aria-label="Close report form"><X size={18} /></button>
        </header>
        {saveError && <p className="coaching-form-error" role="alert"><CircleAlert size={16} />{saveError}</p>}
        {!dialog.employee.email && <p className="coaching-email-warning"><CircleAlert size={15} />You can save the report, but an email cannot be sent until the employee has a valid email address.</p>}
        <label className="coaching-form-field"><span><BookOpen size={15} />What was covered in the coaching?</span><textarea value={draft.coachingDone} onChange={(event) => setDraft((current) => ({ ...current, coachingDone: event.target.value }))} rows={6} maxLength={10000} required placeholder="Summarize the topics discussed, feedback shared, and employee input..." /><small>{draft.coachingDone.length}/10,000</small></label>
        <label className="coaching-form-field"><span><Clock3 size={15} />Next steps</span><textarea value={draft.nextSteps} onChange={(event) => setDraft((current) => ({ ...current, nextSteps: event.target.value }))} rows={5} maxLength={10000} required placeholder="List the agreed actions, owners, and expected follow-up..." /><small>{draft.nextSteps.length}/10,000</small></label>
        <div className="coaching-email-note"><Mail size={15} /><span>The employee receives the report by email. Their team leader is included in CC when an email address is configured.</span></div>
        <footer className="coaching-dialog-actions"><button type="button" className="coaching-cancel-button" onClick={closeDialog} disabled={saving}>Cancel</button><button type="submit" className="coaching-submit-button" disabled={saving}>{saving ? "Saving report..." : <><Send size={15} />Save and email report</>}</button></footer>
      </form>
    </div>}

    {dialog?.mode === "history" && <div className="coaching-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="coaching-dialog coaching-history-dialog" role="dialog" aria-modal="true" aria-labelledby="coaching-history-title">
        <header className="coaching-dialog-header">
          {selectedReport && <button type="button" className="coaching-back-button" onClick={() => setSelectedReport(null)} aria-label="Back to reports"><ArrowLeft size={17} /></button>}
          <div className="coaching-dialog-icon"><FileClock size={20} /></div>
          <div><span className="coaching-kicker">{selectedReport ? "SAVED COACHING REPORT" : "REPORT HISTORY"}</span><h3 id="coaching-history-title">{selectedReport ? dialog.employee.fullName : `Previous reports · ${dialog.employee.fullName}`}</h3><p>{dialog.employee.teamName}</p></div>
          <button type="button" className="coaching-close-button" onClick={closeDialog} aria-label="Close report history"><X size={18} /></button>
        </header>
        {reportsLoading && <div className="coaching-empty compact"><span className="coaching-spinner" /><strong>Loading previous reports...</strong></div>}
        {reportsError && <p className="coaching-form-error" role="alert"><CircleAlert size={16} />{reportsError}</p>}
        {!reportsLoading && !reportsError && selectedReport && <article className="coaching-report-detail">
          <div className="coaching-report-meta"><span><CalendarDays size={14} />{formatDate(selectedReport.createdAt)}</span><span>Coached by <strong>{selectedReport.authorName}</strong></span></div>
          <h4>What was covered</h4><p>{selectedReport.coachingDone}</p>
          <h4>Next steps</h4><p>{selectedReport.nextSteps}</p>
          {selectedReport.emailStatus !== "sent" && <div className="coaching-email-warning"><CircleAlert size={15} />{selectedReport.emailError || "This report was saved but was not emailed."}</div>}
        </article>}
        {!reportsLoading && !reportsError && !selectedReport && reports.length === 0 && <div className="coaching-empty compact"><FileClock size={22} /><strong>No previous coaching reports</strong><span>New reports will be stored here for future reference.</span></div>}
        {!reportsLoading && !reportsError && !selectedReport && reports.length > 0 && <div className="coaching-report-list">{reports.map((report) => <button type="button" className="coaching-report-item" key={report.id} onClick={() => setSelectedReport(report)}>
          <span className="coaching-report-date"><CalendarDays size={15} />{formatDate(report.createdAt)}</span>
          <span className="coaching-report-summary"><strong>{report.coachingDone.length > 120 ? `${report.coachingDone.slice(0, 120)}…` : report.coachingDone}</strong><small>Next step: {report.nextSteps.length > 100 ? `${report.nextSteps.slice(0, 100)}…` : report.nextSteps}</small></span>
          <span className={`coaching-email-status ${report.emailStatus === "sent" ? "sent" : "not-sent"}`}>{report.emailStatus === "sent" ? "Emailed" : "Not emailed"}</span>
        </button>)}</div>}
      </section>
    </div>}
  </section>;
}

export default CoachingPage;
