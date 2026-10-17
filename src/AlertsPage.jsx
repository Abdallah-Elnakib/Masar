import { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Download,
  FileText,
  Mail,
  Search,
  SlidersHorizontal,
  Users,
  X,
  Loader2,
} from "lucide-react";
import "./alerts-page.css";

const DEFAULT_MONTHS = 3;

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value, digits = 1) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return "—";
  return number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const EmployeeRow = memo(({ employee, onOpenActionPlan, onViewData }) => {
  return (
    <tr key={employee.id}>
      <td className="alerts-name-cell">
        <strong>{employee.fullName}</strong>
        <small>{employee.employeeType || "Agent"}</small>
      </td>
      <td>{employee.code3cx || "—"}</td>
      <td>{employee.awfarCode || "—"}</td>
      <td>{employee.teamName}</td>
      <td>{formatDate(employee.hireDate)}</td>
      <td className="alerts-period-cell">
        <span className="alert-badge">
          <AlertTriangle size={14} />
          {employee.monthsInRedZone} month{employee.monthsInRedZone > 1 ? 's' : ''} in Red Zone
        </span>
      </td>
      <td>
        <button 
          className="alerts-action-btn"
          onClick={() => onOpenActionPlan(employee)}
        >
          <FileText size={16} />
          {employee.actionPlan ? "Edit" : "Create"}
        </button>
      </td>
      <td>
        <button 
          className="alerts-view-btn"
          onClick={() => onViewData(employee)}
        >
          <Download size={16} />
          View Data
        </button>
      </td>
    </tr>
  );
});

EmployeeRow.displayName = "EmployeeRow";

EmployeeRow.displayName = "EmployeeRow";

export default function AlertsPage() {
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [alertsData, setAlertsData] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showActionPlanModal, setShowActionPlanModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [actionPlanData, setActionPlanData] = useState({ strengths: "", weaknesses: "", nextSteps: "" });
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [emailCC, setEmailCC] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailDataOptions, setEmailDataOptions] = useState({
    includeEmployeeData: true,
    includePerformanceMetrics: true,
    includeActionPlan: true,
    includeTeamLeaderInfo: true,
    includeSales: true,
    includeCalls: true,
    includeQualityPercent: true,
    includeTalkTime: true,
    includeKPI: true,
  });

  const loadAlertsData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!window.qaDesk?.alerts?.list) {
        setError("Alerts API is not available. Restart the desktop app.");
        return;
      }
      const result = await window.qaDesk.alerts.list({ 
        months,
        teamId: selectedTeam === "all" ? null : selectedTeam 
      });
      if (!result.ok) {
        setError(result.message || "Alerts data could not be loaded.");
        return;
      }
      setAlertsData(result);
      setEmailRecipients(result.employees.map((emp) => ({
        ...emp,
        selected: true,
        selectedCC: false,
      })));
    } catch {
      setError("Alerts data could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
    }
  }, [months, selectedTeam]);

  useEffect(() => {
    void loadAlertsData();
  }, [loadAlertsData]);

  const filteredEmployees = useMemo(() => {
    if (!alertsData?.employees) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return alertsData.employees;
    
    return alertsData.employees.filter((employee) => {
      const searchFields = [
        employee.fullName,
        employee.code3cx,
        employee.awfarCode,
        employee.teamName,
      ].map((value) => String(value || "").toLowerCase());
      
      return searchFields.some((field) => field.includes(query));
    });
  }, [alertsData, searchQuery]);

  const handleViewEmployeeData = (employee) => {
    setSelectedEmployee(employee);
    setShowEmployeeModal(true);
  };

  const handleOpenActionPlan = (employee) => {
    setSelectedEmployee(employee);
    setActionPlanData({
      strengths: employee.actionPlan?.strengths || "",
      weaknesses: employee.actionPlan?.weaknesses || "",
      nextSteps: employee.actionPlan?.nextSteps || "",
    });
    setShowActionPlanModal(true);
  };

  const handleSaveActionPlan = async () => {
    if (!selectedEmployee) return;
    
    try {
      if (!window.qaDesk?.alerts?.saveActionPlan) {
        setError("Action Plan API is not available.");
        return;
      }
      
      const result = await window.qaDesk.alerts.saveActionPlan({
        employeeId: selectedEmployee.id,
        strengths: actionPlanData.strengths,
        weaknesses: actionPlanData.weaknesses,
        nextSteps: actionPlanData.nextSteps,
      });
      
      if (!result.ok) {
        setError(result.message || "Action Plan could not be saved.");
        return;
      }
      
      // Update local data
      setAlertsData((prev) => ({
        ...prev,
        employees: prev.employees.map((emp) => 
          emp.id === selectedEmployee.id 
            ? { ...emp, actionPlan: actionPlanData }
            : emp
        ),
      }));
      
      setShowActionPlanModal(false);
      setError("Action Plan saved successfully!");
    } catch {
      setError("Action Plan could not be saved. Check the database connection.");
    }
  };

  const handleSendEmail = async () => {
    const selectedRecipients = emailRecipients.filter((r) => r.selected);
    const ccEmails = emailCC.split(/[\s,;]+/).filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    
    if (selectedRecipients.length === 0) {
      setError("Please select at least one recipient.");
      return;
    }

    setSendingEmail(true);
    setError("Sending warning emails...");

    try {
      if (!window.qaDesk?.alerts?.sendWarningEmail) {
        setError("Email API is not available. Restart the desktop app.");
        setSendingEmail(false);
        return;
      }
      
      const result = await window.qaDesk.alerts.sendWarningEmail({
        recipients: selectedRecipients,
        cc: ccEmails,
        dataOptions: emailDataOptions,
        months,
      });
      
      if (!result.ok) {
        setError(result.message || "Email could not be sent.");
        setSendingEmail(false);
        return;
      }
      
      setShowEmailModal(false);
      setError(`✓ Warning emails sent successfully to ${selectedRecipients.length} recipient${selectedRecipients.length > 1 ? 's' : ''}!`);
      setSendingEmail(false);
    } catch (err) {
      console.error("Email error:", err);
      setError("Email could not be sent. Check your connection and SMTP settings.");
      setSendingEmail(false);
    }
  };

  if (loading && !alertsData) {
    return (
      <div className="alerts-page">
        <div className="alerts-loading">
          <Loader2 size={48} />
          <p>Loading alerts data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-page">
      <header className="alerts-header">
        <div className="alerts-title-block">
          <h1>
            <AlertTriangle size={32} />
            Performance Alerts
          </h1>
          <p>Employees requiring immediate attention</p>
        </div>
        
        <div className="alerts-controls">
          <div className="alerts-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search employee, codes, team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="alerts-months-selector">
            <label>
              <Calendar size={18} />
              <span>Months:</span>
              <select 
                value={months} 
                onChange={(e) => setMonths(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((m) => (
                  <option key={m} value={m}>{m} Month{m > 1 ? 's' : ''}</option>
                ))}
              </select>
            </label>
          </div>
          
          <div className="alerts-team-selector">
            <label>
              <Users size={18} />
              <span>Team:</span>
              <select 
                value={selectedTeam} 
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <option value="all">All Teams</option>
                {alertsData?.teams?.map((team) => (
                  <option key={team.id} value={team.id}>{team.teamName}</option>
                ))}
              </select>
            </label>
          </div>
          
          <button 
            className="alerts-email-btn"
            onClick={() => setShowEmailModal(true)}
            disabled={filteredEmployees.length === 0}
          >
            <Mail size={18} />
            Send Warning Email
          </button>
        </div>
      </header>

      {error && (
        <div className={`alerts-error ${error.startsWith('✓') ? 'success' : ''}`} role="alert">
          {error}
          <button onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}

      <div className="alerts-stats">
        <div className="alert-stat">
          <AlertTriangle size={24} />
          <div>
            <strong>{alertsData?.employees?.length || 0}</strong>
            <span>Employees at Risk</span>
          </div>
        </div>
        <div className="alert-stat">
          <Calendar size={24} />
          <div>
            <strong>{months} Month{months > 1 ? 's' : ''}</strong>
            <span>Period</span>
          </div>
        </div>
        <div className="alert-stat">
          <FileText size={24} />
          <div>
            <strong>{filteredEmployees.length}</strong>
            <span>Filtered Results</span>
          </div>
        </div>
      </div>

      <div className="alerts-table-container">
        <table className="alerts-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>3CX Code</th>
              <th>Awfar Code</th>
              <th>Team</th>
              <th>Hire Date</th>
              <th>Alert Period</th>
              <th>Action Plan</th>
              <th>View Data</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <EmployeeRow 
                key={employee.id}
                employee={employee}
                onOpenActionPlan={handleOpenActionPlan}
                onViewData={handleViewEmployeeData}
              />
            ))}
            {!filteredEmployees.length && (
              <tr>
                <td colSpan={8} className="alerts-empty-row">
                  No employees match the current criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Employee Data Modal */}
      {showEmployeeModal && selectedEmployee && (
        <div className="alerts-modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="alerts-modal alerts-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="alerts-modal-header">
              <h2>
                <Download size={24} />
                Employee Performance Data
              </h2>
              <button onClick={() => setShowEmployeeModal(false)}><X size={20} /></button>
            </div>
            <div className="alerts-modal-body">
              <div className="employee-data-summary">
                <h3>{selectedEmployee.fullName}</h3>
                <p>{selectedEmployee.teamName} • {selectedEmployee.employeeType}</p>
                <p className="alert-period-text">
                  <AlertTriangle size={16} />
                  {selectedEmployee.monthsInRedZone} month{selectedEmployee.monthsInRedZone > 1 ? 's' : ''} in Red Zone
                </p>
              </div>
              
              <div className="employee-data-grid">
                {selectedEmployee.performanceData?.map((monthData, index) => (
                  <div key={index} className="month-data-card">
                    <h4>{monthData.month}</h4>
                    <div className="data-grid">
                      <div className="data-item">
                        <span>Sales</span>
                        <strong>{formatNumber(monthData.sales, 0)}</strong>
                      </div>
                      <div className="data-item">
                        <span>Calls</span>
                        <strong>{formatNumber(monthData.calls, 0)}</strong>
                      </div>
                      <div className="data-item">
                        <span>Quality %</span>
                        <strong>{monthData.qualityWeightedPercent !== undefined ? formatNumber(monthData.qualityWeightedPercent, 0) : "—"}</strong>
                      </div>
                      <div className="data-item">
                        <span>Talk Time</span>
                        <strong>{monthData.talkingTime}</strong>
                      </div>
                      <div className="data-item">
                        <span>KPI</span>
                        <strong className={monthData.kpi < 80 ? "danger" : ""}>{formatNumber(monthData.kpi, 0)}%</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Plan Modal */}
      {showActionPlanModal && selectedEmployee && (
        <div className="alerts-modal-overlay" onClick={() => setShowActionPlanModal(false)}>
          <div className="alerts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="alerts-modal-header">
              <h2>
                <FileText size={24} />
                Action Plan
              </h2>
              <button onClick={() => setShowActionPlanModal(false)}><X size={20} /></button>
            </div>
            <div className="alerts-modal-body">
              <div className="action-plan-employee-info">
                <h3>{selectedEmployee.fullName}</h3>
                <p>{selectedEmployee.teamName}</p>
              </div>
              
              <div className="action-plan-form">
                <div className="form-group">
                  <label>
                    <span className="label-icon">💪</span>
                    Strengths
                  </label>
                  <textarea
                    value={actionPlanData.strengths}
                    onChange={(e) => setActionPlanData({ ...actionPlanData, strengths: e.target.value })}
                    placeholder="Enter the employee's strengths..."
                    rows={3}
                  />
                </div>
                
                <div className="form-group">
                  <label>
                    <span className="label-icon">⚠️</span>
                    Weaknesses
                  </label>
                  <textarea
                    value={actionPlanData.weaknesses}
                    onChange={(e) => setActionPlanData({ ...actionPlanData, weaknesses: e.target.value })}
                    placeholder="Enter areas for improvement..."
                    rows={3}
                  />
                </div>
                
                <div className="form-group">
                  <label>
                    <span className="label-icon">📋</span>
                    Next Steps
                  </label>
                  <textarea
                    value={actionPlanData.nextSteps}
                    onChange={(e) => setActionPlanData({ ...actionPlanData, nextSteps: e.target.value })}
                    placeholder="Define action steps for the upcoming period..."
                    rows={4}
                  />
                </div>
              </div>
            </div>
            <div className="alerts-modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowActionPlanModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={handleSaveActionPlan}
              >
                Save Action Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="alerts-modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="alerts-modal alerts-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="alerts-modal-header">
              <h2>
                <Mail size={24} />
                Send Warning Emails
              </h2>
              <button onClick={() => setShowEmailModal(false)}><X size={20} /></button>
            </div>
            <div className="alerts-modal-body">
              <div className="email-section">
                <h3>Recipients</h3>
                <div className="email-recipients-list">
                  {emailRecipients.map((recipient) => (
                    <div key={recipient.id} className="email-recipient-item">
                      <label className="recipient-checkbox">
                        <input
                          type="checkbox"
                          checked={recipient.selected}
                          onChange={(e) => {
                            setEmailRecipients(emailRecipients.map((r) => 
                              r.id === recipient.id ? { ...r, selected: e.target.checked } : r
                            ));
                          }}
                        />
                        <span className="recipient-name">{recipient.fullName}</span>
                        <span className="recipient-team">{recipient.teamName}</span>
                      </label>
                      <div className="recipient-emails">
                        {recipient.email && (
                          <span className="recipient-email">👤 {recipient.email}</span>
                        )}
                        {recipient.teamLeaderEmail && (
                          <span className="recipient-email leader">👔 {recipient.teamLeaderEmail}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="email-section">
                <h3>CC (Additional Recipients)</h3>
                <input
                  type="text"
                  className="email-cc-input"
                  placeholder="Enter email addresses separated by commas..."
                  value={emailCC}
                  onChange={(e) => setEmailCC(e.target.value)}
                />
              </div>

              <div className="email-section">
                <h3>Email Content Options</h3>
                <div className="email-options-grid">
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeEmployeeData}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeEmployeeData: e.target.checked })}
                    />
                    <span>Include Employee Basic Data</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includePerformanceMetrics}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includePerformanceMetrics: e.target.checked })}
                    />
                    <span>Include Performance Metrics</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeActionPlan}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeActionPlan: e.target.checked })}
                    />
                    <span>Include Action Plan (if available)</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeTeamLeaderInfo}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeTeamLeaderInfo: e.target.checked })}
                    />
                    <span>Include Team Leader Info</span>
                  </label>
                </div>
              </div>

              <div className="email-section">
                <h3>Performance Metrics Details</h3>
                <div className="email-options-grid">
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeSales}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeSales: e.target.checked })}
                    />
                    <span>Include Sales</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeCalls}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeCalls: e.target.checked })}
                    />
                    <span>Include Calls</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeQualityPercent}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeQualityPercent: e.target.checked })}
                    />
                    <span>Include Quality %</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeTalkTime}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeTalkTime: e.target.checked })}
                    />
                    <span>Include Talk Time</span>
                  </label>
                  <label className="email-option">
                    <input
                      type="checkbox"
                      checked={emailDataOptions.includeKPI}
                      onChange={(e) => setEmailDataOptions({ ...emailDataOptions, includeKPI: e.target.checked })}
                    />
                    <span>Include KPI</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="alerts-modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowEmailModal(false)}
                disabled={sendingEmail}
              >
                Cancel
              </button>
              <button 
                className="btn-primary btn-danger"
                onClick={handleSendEmail}
                disabled={sendingEmail}
              >
                {sendingEmail ? (
                  <>
                    <Loader2 size={18} className="spinner-icon" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    Send Warning Emails
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
