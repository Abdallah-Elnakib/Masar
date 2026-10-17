import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Download,
  Filter,
  History,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
  X,
} from "lucide-react";
import "./performance-page.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value, digits = 1) {
  const number = Number(value) || 0;
  return number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function localStamp(value = new Date()) {
  return {
    month: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`,
    date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
  };
}

function monthChoices() {
  const choices = [];
  const now = new Date();
  for (let offset = 0; offset < 18; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    choices.push({
      value,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return choices;
}

function daysInMonth(month) {
  const [year, number] = String(month).split("-").map(Number);
  return new Date(year, number, 0).getDate();
}

function clampDateToMonth(month, date) {
  const maxDay = daysInMonth(month);
  const requested = Number(String(date || "").slice(-2)) || 1;
  return `${month}-${String(Math.min(Math.max(requested, 1), maxDay)).padStart(2, "0")}`;
}

export default function PerformancePage({ user }) {
  const today = useMemo(() => localStamp(), []);
  const months = useMemo(() => monthChoices(), []);
  const [month, setMonth] = useState(today.month);
  const [date, setDate] = useState(today.date);
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedSalesZone, setSelectedSalesZone] = useState("all");
  const [kpiRange, setKpiRange] = useState({ min: 0, max: 100 });
  const [salesRange, setSalesRange] = useState({ min: 0, max: 100000 });
  const [callsRange, setCallsRange] = useState({ min: 0, max: 10000 });
  const [talkTimeRange, setTalkTimeRange] = useState({ min: 0, max: 500000 });
  const [callPercentRange, setCallPercentRange] = useState({ min: 0, max: 100 });
  const [talkPercentRange, setTalkPercentRange] = useState({ min: 0, max: 100 });
  const [qualityRange, setQualityRange] = useState({ min: 0, max: 100 });
  const [showFilters, setShowFilters] = useState(false);
  
  // Rankings
  const [teamRankBy, setTeamRankBy] = useState("sales");
  const [employeeRankBy, setEmployeeRankBy] = useState("kpi");
  const [teamRankCount, setTeamRankCount] = useState(5);
  const [employeeRankCount, setEmployeeRankCount] = useState(5);
  
  // History modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyEmployee, setHistoryEmployee] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // History Performance Mode
  const [showHistoryMode, setShowHistoryMode] = useState(false);
  const [historyConfig, setHistoryConfig] = useState({
    team: "all",
    employee: "all",
    duration: "3", // 3, 6, 12, custom
    customStartMonth: "",
    customEndMonth: "",
  });
  const [historyPerformanceData, setHistoryPerformanceData] = useState(null);
  const [historyPerformanceLoading, setHistoryPerformanceLoading] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState(new Set());

  // Table Sorting
  const [sortColumn, setSortColumn] = useState("totalKpi");
  const [sortDirection, setSortDirection] = useState("desc");

  const loadPerformanceData = useCallback(async (nextMonth, nextDate, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      if (!window.qaDesk?.dashboard?.summary) {
        setError("Dashboard API is not available. Restart the desktop app.");
        return;
      }
      const dashboardResult = await window.qaDesk.dashboard.summary({
        month: nextMonth,
        date: nextDate,
      });
      if (!dashboardResult.ok) {
        setError(dashboardResult.message || "Performance data could not be loaded.");
        return;
      }
      setPerformanceData(dashboardResult);
    } catch {
      setError("Performance data could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPerformanceData(month, date, false);
  }, [month, date, loadPerformanceData]);

  const dayOptions = useMemo(() => {
    const count = performanceData?.daysInMonth || daysInMonth(month);
    return Array.from({ length: count }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { value: `${month}-${day}`, label: day };
    });
  }, [performanceData, month]);

  const uniqueTeams = useMemo(() => {
    if (!performanceData?.employees) return [];
    return [...new Set(performanceData.employees.map((employee) => employee.teamName).filter(Boolean))].sort();
  }, [performanceData]);

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (performanceData?.employees || []).filter((employee) => {
      const matchesSearch = !query || [employee.fullName, employee.code3cx, employee.awfarCode, employee.teamName]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesTeam = selectedTeam === "all" || employee.teamName === selectedTeam;
      const matchesSalesZone = selectedSalesZone === "all" || employee.salesZone === selectedSalesZone;
      const matchesKpi = employee.totalKpi >= kpiRange.min && employee.totalKpi <= kpiRange.max;
      const matchesSales = Number(employee.sales) >= salesRange.min && Number(employee.sales) <= salesRange.max;
      const matchesCalls = Number(employee.monthlyCalls) >= callsRange.min && Number(employee.monthlyCalls) <= callsRange.max;
      const matchesTalkTime = Number(employee.monthlyTalkingTime) >= talkTimeRange.min && Number(employee.monthlyTalkingTime) <= talkTimeRange.max;
      const matchesCallPercent = Number(employee.callsPercent) >= callPercentRange.min && Number(employee.callsPercent) <= callPercentRange.max;
      const matchesTalkPercent = Number(employee.talkingTimePercent) >= talkPercentRange.min && Number(employee.talkingTimePercent) <= talkPercentRange.max;
      const matchesQuality = Number(employee.qualityPercent) >= qualityRange.min && Number(employee.qualityPercent) <= qualityRange.max;
      return matchesSearch && matchesTeam && matchesSalesZone && matchesKpi && matchesSales && matchesCalls && matchesTalkTime && matchesCallPercent && matchesTalkPercent && matchesQuality;
    });
  }, [performanceData, searchQuery, selectedTeam, selectedSalesZone, kpiRange, salesRange, callsRange, talkTimeRange, callPercentRange, talkPercentRange, qualityRange]);

  const sortedEmployees = useMemo(() => {
    const next = [...filteredEmployees];
    next.sort((a, b) => {
      let aVal, bVal;

      switch (sortColumn) {
        case "fullName":
          aVal = String(a.fullName || "").toLowerCase();
          bVal = String(b.fullName || "").toLowerCase();
          break;
        case "code3cx":
          aVal = String(a.code3cx || "").toLowerCase();
          bVal = String(b.code3cx || "").toLowerCase();
          break;
        case "awfarCode":
          aVal = String(a.awfarCode || "").toLowerCase();
          bVal = String(b.awfarCode || "").toLowerCase();
          break;
        case "teamName":
          aVal = String(a.teamName || "").toLowerCase();
          bVal = String(b.teamName || "").toLowerCase();
          break;
        case "hireDate":
          aVal = new Date(a.hireDate || 0).getTime();
          bVal = new Date(b.hireDate || 0).getTime();
          break;
        case "sales":
          aVal = Number(a.sales) || 0;
          bVal = Number(b.sales) || 0;
          break;
        case "salesZone":
          const zoneOrder = { "Green": 1, "Yellow": 2, "Red": 3, "Below": 4 };
          aVal = zoneOrder[a.salesZone] || 5;
          bVal = zoneOrder[b.salesZone] || 5;
          break;
        case "monthlyCalls":
          aVal = Number(a.monthlyCalls) || 0;
          bVal = Number(b.monthlyCalls) || 0;
          break;
        case "monthlyTalkingTime":
          aVal = Number(a.monthlyTalkingTime) || 0;
          bVal = Number(b.monthlyTalkingTime) || 0;
          break;
        case "callsPercent":
          aVal = Number(a.callsPercent) || 0;
          bVal = Number(b.callsPercent) || 0;
          break;
        case "talkingTimePercent":
          aVal = Number(a.talkingTimePercent) || 0;
          bVal = Number(b.talkingTimePercent) || 0;
          break;
        case "qualityPercent":
          aVal = Number(a.qualityPercent) || 0;
          bVal = Number(b.qualityPercent) || 0;
          break;
        case "totalKpi":
        default:
          aVal = Number(a.totalKpi) || 0;
          bVal = Number(b.totalKpi) || 0;
          break;
      }

      if (typeof aVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return next;
  }, [filteredEmployees, sortColumn, sortDirection]);

  // Keep employee rankings separate from table sorting
  const rankedEmployees = useMemo(() => {
    const next = [...filteredEmployees];
    next.sort((a, b) => {
      let aVal, bVal;

      switch (employeeRankBy) {
        case "sales":
          aVal = Number(a.sales) || 0;
          bVal = Number(b.sales) || 0;
          break;
        case "talkingTime":
          aVal = Number(a.monthlyTalkingTime) || 0;
          bVal = Number(b.monthlyTalkingTime) || 0;
          break;
        case "calls":
          aVal = Number(a.monthlyCalls) || 0;
          bVal = Number(b.monthlyCalls) || 0;
          break;
        case "kpi":
        default:
          aVal = Number(a.totalKpi) || 0;
          bVal = Number(b.totalKpi) || 0;
          break;
      }

      return bVal - aVal; // Descending order
    });
    return next;
  }, [filteredEmployees, employeeRankBy]);

  const teamStats = useMemo(() => {
    const stats = {};
    (performanceData?.employees || []).forEach((employee) => {
      const teamName = employee.teamName || "Unassigned";
      if (!stats[teamName]) {
        stats[teamName] = {
          teamName,
          sales: 0,
          monthlyTalkingTime: 0,
          monthlyCalls: 0,
          totalKpi: 0,
          employeeCount: 0,
        };
      }
      stats[teamName].sales += Number(employee.sales) || 0;
      stats[teamName].monthlyTalkingTime += Number(employee.monthlyTalkingTime) || 0;
      stats[teamName].monthlyCalls += Number(employee.monthlyCalls) || 0;
      stats[teamName].totalKpi += Number(employee.totalKpi) || 0;
      stats[teamName].employeeCount += 1;
    });

    // Calculate averages
    Object.values(stats).forEach((team) => {
      if (team.employeeCount > 0) {
        team.avgKpi = team.totalKpi / team.employeeCount;
      }
    });

    return Object.values(stats);
  }, [performanceData]);

  const sortedTeams = useMemo(() => {
    const next = [...teamStats];
    next.sort((a, b) => {
      let aVal, bVal;
      
      switch (teamRankBy) {
        case "sales":
          aVal = a.sales;
          bVal = b.sales;
          break;
        case "talkingTime":
          aVal = a.monthlyTalkingTime;
          bVal = b.monthlyTalkingTime;
          break;
        case "calls":
          aVal = a.monthlyCalls;
          bVal = b.monthlyCalls;
          break;
        case "kpi":
        default:
          aVal = a.avgKpi || 0;
          bVal = b.avgKpi || 0;
          break;
      }
      
      return bVal - aVal; // Descending order
    });
    return next;
  }, [teamStats, teamRankBy]);

  const loadSalesHistory = useCallback(async (employee) => {
    setHistoryEmployee(employee);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setError("");
    
    try {
      // Calculate previous 3 months
      const currentDate = new Date(`${month}-01`);
      const historyMonths = [];
      
      for (let i = 1; i <= 3; i++) {
        const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
        historyMonths.push(prevMonth);
      }

      // Load data for each month
      const historyResults = await Promise.all(
        historyMonths.map(async (histMonth) => {
          try {
            const result = await window.qaDesk.dashboard.summary({
              month: histMonth,
              date: `${histMonth}-${String(daysInMonth(histMonth)).padStart(2, "0")}`,
            });
            if (result.ok) {
              const emp = result.employees.find((e) => e.id === employee.id);
              return {
                month: histMonth,
                sales: emp?.sales || 0,
                salesZone: emp?.salesZone || "—",
              };
            }
            return { month: histMonth, sales: 0, salesZone: "—" };
          } catch {
            return { month: histMonth, sales: 0, salesZone: "—" };
          }
        })
      );

      setHistoryData(historyResults);
    } catch {
      setError("Sales history could not be loaded.");
    } finally {
      setHistoryLoading(false);
    }
  }, [month]);

  function resetFilters() {
    setSearchQuery("");
    setSelectedTeam("all");
    setSelectedSalesZone("all");
    setKpiRange({ min: 0, max: 100 });
    setSalesRange({ min: 0, max: 100000 });
    setCallsRange({ min: 0, max: 10000 });
    setTalkTimeRange({ min: 0, max: 500000 });
    setCallPercentRange({ min: 0, max: 100 });
    setTalkPercentRange({ min: 0, max: 100 });
    setQualityRange({ min: 0, max: 100 });
  }

  function getValueClass(value, thresholds = { high: 80, medium: 50 }) {
    const num = Number(value) || 0;
    if (num >= thresholds.high) return "high";
    if (num >= thresholds.medium) return "medium";
    return "low";
  }

  function getCallsClass(value) {
    const num = Number(value) || 0;
    if (num >= 5000) return "high";
    if (num >= 2000) return "medium";
    return "low";
  }

  function getTalkTimeClass(value) {
    const num = Number(value) || 0;
    if (num >= 300000) return "high";
    if (num >= 150000) return "medium";
    return "low";
  }

  function toggleHistoryMode() {
    setShowHistoryMode((prev) => !prev);
    if (showHistoryMode) {
      setHistoryPerformanceData(null);
      setHiddenColumns(new Set());
    }
  }

  function toggleColumn(column) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  }

  const loadHistoryPerformance = useCallback(async () => {
    setHistoryPerformanceLoading(true);
    setError("");
    try {
      if (!window.qaDesk?.dashboard?.summary) {
        setError("Dashboard API is not available. Restart the desktop app.");
        return;
      }

      let monthsToLoad = [];
      const currentDate = new Date(`${month}-01`);

      if (historyConfig.duration === "custom") {
        // Custom range
        const start = new Date(`${historyConfig.customStartMonth}-01`);
        const end = new Date(`${historyConfig.customEndMonth}-01`);
        let current = new Date(start);
        while (current <= end) {
          monthsToLoad.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
          current.setMonth(current.getMonth() + 1);
        }
      } else {
        // Predefined durations
        const count = Number(historyConfig.duration);
        for (let i = 0; i < count; i++) {
          const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
          monthsToLoad.push(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`);
        }
      }

      // Load data for each month
      const results = await Promise.all(
        monthsToLoad.map(async (histMonth) => {
          try {
            const lastDay = daysInMonth(histMonth);
            const result = await window.qaDesk.dashboard.summary({
              month: histMonth,
              date: `${histMonth}-${String(lastDay).padStart(2, "0")}`,
            });
            if (result.ok) {
              return {
                month: histMonth,
                ...result,
              };
            }
            return null;
          } catch {
            return null;
          }
        })
      );

      const validResults = results.filter(Boolean);

      // Filter by team/employee if selected
      let filteredResults = validResults;
      if (historyConfig.team !== "all") {
        filteredResults = validResults.map((result) => ({
          ...result,
          employees: result.employees.filter((emp) => emp.teamName === historyConfig.team),
        }));
      }
      if (historyConfig.employee !== "all") {
        filteredResults = filteredResults.map((result) => ({
          ...result,
          employees: result.employees.filter((emp) => emp.id === historyConfig.employee),
        }));
      }

      setHistoryPerformanceData(filteredResults.reverse());
    } catch {
      setError("History performance data could not be loaded.");
    } finally {
      setHistoryPerformanceLoading(false);
    }
  }, [historyConfig, month]);

  const exportToExcel = useCallback(() => {
    try {
      const dataToExport = showHistoryMode ? historyPerformanceData : [performanceData];
      if (!dataToExport || dataToExport.length === 0) {
        setError("No data available to export.");
        return;
      }

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Process each month's data
      dataToExport.forEach((monthData, monthIndex) => {
        const sheetName = showHistoryMode ? monthData.month : "Performance Data";
        const employees = showHistoryMode ? monthData.employees : monthData.employees;

        // Sort employees by KPI
        const sortedEmployees = [...employees].sort((a, b) => Number(b.totalKpi) - Number(a.totalKpi));

        // Create header row
        const headers = [
          ["PERFORMANCE REPORT"],
          [showHistoryMode ? `Month: ${monthData.month}` : `Date: ${formatDate(date)}`],
          [showHistoryMode ? `Exported: ${new Date().toLocaleDateString()}` : `Exported: ${new Date().toLocaleDateString()}`],
          [],
          ["Employee", "Code 3CX", "Code Awfar", "Team", "Hire Date", "Sales", "Zone", "Monthly Calls", "Talking Time", "Call %", "Talk %", "Quality %", "Total KPI"],
        ];

        // Create data rows
        const dataRows = sortedEmployees.map((employee, index) => [
          employee.fullName,
          employee.code3cx || "—",
          employee.awfarCode || "—",
          employee.teamName || "—",
          formatDate(employee.hireDate),
          Number(employee.sales),
          employee.salesZone || "—",
          Number(employee.monthlyCalls),
          formatTime(employee.monthlyTalkingTime),
          `${formatNumber(employee.callsPercent)}%`,
          `${formatNumber(employee.talkingTimePercent)}%`,
          `${formatNumber(employee.qualityPercent, 2)}%`,
          `${formatNumber(employee.totalKpi)}%`,
        ]);

        // Combine headers and data
        const allData = [...headers, ...dataRows];

        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(allData);

        // Set column widths
        ws["!cols"] = [
          { wch: 30 }, // Employee
          { wch: 15 }, // Code 3CX
          { wch: 15 }, // Code Awfar
          { wch: 25 }, // Team
          { wch: 18 }, // Hire Date
          { wch: 15 }, // Sales
          { wch: 12 }, // Zone
          { wch: 15 }, // Monthly Calls
          { wch: 18 }, // Talking Time
          { wch: 12 }, // Call %
          { wch: 12 }, // Talk %
          { wch: 15 }, // Quality %
          { wch: 15 }, // Total KPI
        ];

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Excel sheet name max 31 chars
      });

      // Add summary sheet
      const totalEmployees = showHistoryMode
        ? historyPerformanceData.reduce((sum, m) => sum + m.employees.length, 0)
        : performanceData?.employees?.length || 0;

      const totalSales = showHistoryMode
        ? historyPerformanceData.reduce((sum, m) => sum + m.employees.reduce((s, e) => s + Number(e.sales), 0), 0)
        : performanceData?.employees?.reduce((sum, emp) => sum + Number(emp.sales), 0) || 0;

      const avgKpi = showHistoryMode
        ? historyPerformanceData.reduce((sum, m) => sum + m.employees.reduce((s, e) => s + Number(e.totalKpi), 0), 0) / historyPerformanceData.reduce((sum, m) => sum + m.employees.length, 0)
        : performanceData?.employees?.reduce((sum, emp) => sum + Number(emp.totalKpi), 0) / performanceData?.employees?.length || 0;

      const summaryData = [
        ["PERFORMANCE SUMMARY"],
        [],
        ["Metric", "Value"],
        ["Total Employees", totalEmployees],
        ["Total Teams", uniqueTeams.length],
        ["Average KPI", `${formatNumber(avgKpi)}%`],
        ["Total Sales", totalSales.toLocaleString()],
        ["Export Date", new Date().toLocaleString()],
        ["Export Time", new Date().toLocaleTimeString()],
      ];

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWs["!cols"] = [{ wch: 25 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

      // Add team rankings sheet
      const teamRankingData = [
        ["TEAM RANKINGS"],
        [],
        [`Ranked by: ${teamRankBy.toUpperCase()}`],
        [],
        ["Rank", "Team", "Employees", "Sales", "Avg KPI", "Total Calls", "Total Talk Time"],
        ...sortedTeams.map((team, index) => [
          index + 1,
          team.teamName,
          team.employeeCount,
          team.sales.toLocaleString(),
          `${formatNumber(team.avgKpi)}%`,
          team.monthlyCalls.toLocaleString(),
          formatTime(team.monthlyTalkingTime),
        ]),
      ];

      const teamRankingWs = XLSX.utils.aoa_to_sheet(teamRankingData);
      teamRankingWs["!cols"] = [
        { wch: 8 },
        { wch: 25 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 },
      ];
      XLSX.utils.book_append_sheet(wb, teamRankingWs, "Team Rankings");

      // Generate and download
      const fileName = `Performance_Report_${showHistoryMode ? "History" : formatDate(date).replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setError("");
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export data. Please try again.");
    }
  }, [showHistoryMode, historyPerformanceData, performanceData, date, uniqueTeams, sortedTeams, teamRankBy, formatDate, formatNumber, formatTime]);

  function changeMonth(nextMonth) {
    setMonth(nextMonth);
    setDate(clampDateToMonth(nextMonth, date));
  }

  if (loading && !performanceData) {
    return <div className="performance-page"><div className="perf-loading">Loading performance data…</div></div>;
  }

  return (
    <div className="performance-page">
      <header className="perf-header">
        <div className="perf-title-block">
          <h2>Performance</h2>
          <span>{formatDate(date)}</span>
        </div>
        <div className="perf-control-bar">
          <label className="perf-search">
            <Search size={15} />
            <input
              type="search"
              placeholder="Search employee, 3CX, Awfar, team"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <div className="perf-period-group" aria-label="Period">
            <select value={month} onChange={(event) => changeMonth(event.target.value)} aria-label="Month">
              {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={date} onChange={(event) => setDate(event.target.value)} aria-label="Day">
              {dayOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="perf-actions">
            <button type="button" className={showHistoryMode ? "is-on" : ""} onClick={toggleHistoryMode}>
              <History size={15} /> History Performance
            </button>
            <button type="button" className="perf-export" onClick={exportToExcel}>
              <Download size={15} /> Export Excel
            </button>
            <button type="button" className={showFilters ? "is-on" : ""} onClick={() => setShowFilters((value) => !value)}>
              <Filter size={15} /> Filters
            </button>
            <button type="button" className="perf-refresh" disabled={refreshing} onClick={() => void loadPerformanceData(month, date, true)}>
              <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="perf-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {showHistoryMode && (
        <section className="perf-history-config">
          <div className="perf-history-config-header">
            <h3>History Performance Configuration</h3>
            <button type="button" className="perf-close-history" onClick={toggleHistoryMode}>
              <X size={16} />
            </button>
          </div>
          <div className="perf-history-config-body">
            <label>
              Team
              <select value={historyConfig.team} onChange={(event) => setHistoryConfig((prev) => ({ ...prev, team: event.target.value }))}>
                <option value="all">All teams</option>
                {uniqueTeams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>
            <label>
              Employee
              <select
                value={historyConfig.employee}
                onChange={(event) => setHistoryConfig((prev) => ({ ...prev, employee: event.target.value }))}
                disabled={historyConfig.team === "all"}
              >
                <option value="all">All employees</option>
                {historyConfig.team !== "all" && performanceData?.employees
                  .filter((emp) => emp.teamName === historyConfig.team)
                  .map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
              </select>
            </label>
            <label>
              Duration
              <select value={historyConfig.duration} onChange={(event) => setHistoryConfig((prev) => ({ ...prev, duration: event.target.value }))}>
                <option value="3">Last 3 months</option>
                <option value="6">Last 6 months</option>
                <option value="12">Last 1 year</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {historyConfig.duration === "custom" && (
              <>
                <label>
                  Start Month
                  <select
                    value={historyConfig.customStartMonth}
                    onChange={(event) => setHistoryConfig((prev) => ({ ...prev, customStartMonth: event.target.value }))}
                  >
                    <option value="">Select start month</option>
                    {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>
                  End Month
                  <select
                    value={historyConfig.customEndMonth}
                    onChange={(event) => setHistoryConfig((prev) => ({ ...prev, customEndMonth: event.target.value }))}
                  >
                    <option value="">Select end month</option>
                    {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </>
            )}
            <button
              type="button"
              className="perf-load-history"
              onClick={loadHistoryPerformance}
              disabled={historyPerformanceLoading || (historyConfig.duration === "custom" && (!historyConfig.customStartMonth || !historyConfig.customEndMonth))}
            >
              {historyPerformanceLoading ? "Loading..." : "Load Data"}
            </button>
          </div>
        </section>
      )}

      {showHistoryMode && historyPerformanceData && (
        <section className="perf-history-results">
          <div className="perf-history-results-header">
            <h3>History Performance Results</h3>
            <div className="perf-column-toggles">
              <span>Hide columns:</span>
              {["Employee", "Code", "Hire Date", "Sales", "Zone", "Calls", "Talking Time", "Call %", "Talk %", "Quality %", "Total KPI"].map((col) => (
                <button
                  key={col}
                  type="button"
                  className={hiddenColumns.has(col) ? "is-hidden" : ""}
                  onClick={() => toggleColumn(col)}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>
          <div className="perf-table-container">
            <table className="perf-table">
              <thead>
                <tr>
                  <th>Month</th>
                  {!hiddenColumns.has("Employee") && <th>Employee</th>}
                  {!hiddenColumns.has("Code") && <th>Code</th>}
                  {!hiddenColumns.has("Hire Date") && <th>Hire Date</th>}
                  {!hiddenColumns.has("Sales") && <th>Sales</th>}
                  {!hiddenColumns.has("Zone") && <th>Zone</th>}
                  {!hiddenColumns.has("Calls") && <th>Calls</th>}
                  {!hiddenColumns.has("Talking Time") && <th>Talking Time</th>}
                  {!hiddenColumns.has("Call %") && <th>Call %</th>}
                  {!hiddenColumns.has("Talk %") && <th>Talk %</th>}
                  {!hiddenColumns.has("Quality %") && <th>Quality %</th>}
                  {!hiddenColumns.has("Total KPI") && <th>Total KPI</th>}
                </tr>
              </thead>
              <tbody>
                {historyPerformanceData.map((monthData) => (
                  monthData.employees.map((employee, empIndex) => {
                    return (
                      <tr key={`${monthData.month}-${employee.id}`} className={employee.salesZone === "Green" ? "is-green" : employee.salesZone === "Red" ? "is-red" : employee.salesZone === "Yellow" ? "is-yellow" : ""}>
                        <td className="perf-month-cell">
                          <strong>{monthData.month}</strong>
                        </td>
                        {!hiddenColumns.has("Employee") && (
                          <td className="perf-name-cell">
                            <strong>{employee.fullName}</strong>
                            <small>{employee.employeeType}</small>
                          </td>
                        )}
                        {!hiddenColumns.has("Code") && (
                          <td className="perf-code-cell">
                            <span>{employee.code3cx || "—"}</span>
                            <span>{employee.awfarCode || "—"}</span>
                          </td>
                        )}
                        {!hiddenColumns.has("Hire Date") && <td>{formatDate(employee.hireDate)}</td>}
                        {!hiddenColumns.has("Sales") && (
                          <td className={`perf-number-cell ${employee.salesZone?.toLowerCase() || ""}`}>{Number(employee.sales).toLocaleString()}</td>
                        )}
                        {!hiddenColumns.has("Zone") && (
                          <td>
                            <span className={`zone-badge ${employee.salesZone?.toLowerCase()}`}>
                              {employee.salesZone || "—"}
                            </span>
                          </td>
                        )}
                        {!hiddenColumns.has("Calls") && (
                          <td className={`perf-number-cell ${getCallsClass(employee.monthlyCalls)}`}>{Number(employee.monthlyCalls).toLocaleString()}</td>
                        )}
                        {!hiddenColumns.has("Talking Time") && (
                          <td className={`perf-time-cell ${getTalkTimeClass(employee.monthlyTalkingTime)}`}>{formatTime(employee.monthlyTalkingTime)}</td>
                        )}
                        {!hiddenColumns.has("Call %") && (
                          <td className={`perf-percent-cell ${getValueClass(employee.callsPercent)}`}>{formatNumber(employee.callsPercent)}%</td>
                        )}
                        {!hiddenColumns.has("Talk %") && (
                          <td className={`perf-percent-cell ${getValueClass(employee.talkingTimePercent)}`}>{formatNumber(employee.talkingTimePercent)}%</td>
                        )}
                        {!hiddenColumns.has("Quality %") && (
                          <td className={`perf-percent-cell ${getValueClass(employee.qualityPercent)}`}>{formatNumber(employee.qualityPercent, 2)}%</td>
                        )}
                        {!hiddenColumns.has("Total KPI") && (
                          <td className="perf-kpi-cell">
                            <span className={`kpi-badge ${employee.totalKpi >= 80 ? "excellent" : employee.totalKpi >= 60 ? "good" : employee.totalKpi >= 40 ? "fair" : "poor"}`}>
                              {formatNumber(employee.totalKpi)}%
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!showHistoryMode && showFilters && (
        <section className="perf-filters">
          <label>
            Team
            <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}>
              <option value="all">All teams</option>
              {uniqueTeams.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </label>
          <label>
            Sales zone
            <select value={selectedSalesZone} onChange={(event) => setSelectedSalesZone(event.target.value)}>
              <option value="all">All zones</option>
              <option value="Green">Green</option>
              <option value="Yellow">Yellow</option>
              <option value="Red">Red</option>
              <option value="Below">Below</option>
            </select>
          </label>
          <label>
            KPI Range
            <div className="filter-range">
              <input type="number" min="0" max="100" placeholder="Min" value={kpiRange.min} onChange={(event) => setKpiRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" max="100" placeholder="Max" value={kpiRange.max} onChange={(event) => setKpiRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <label>
            Sales Range
            <div className="filter-range">
              <input type="number" min="0" placeholder="Min" value={salesRange.min} onChange={(event) => setSalesRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" placeholder="Max" value={salesRange.max} onChange={(event) => setSalesRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <label>
            Calls Range
            <div className="filter-range">
              <input type="number" min="0" placeholder="Min" value={callsRange.min} onChange={(event) => setCallsRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" placeholder="Max" value={callsRange.max} onChange={(event) => setCallsRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <label>
            Talk Time (sec)
            <div className="filter-range">
              <input type="number" min="0" placeholder="Min" value={talkTimeRange.min} onChange={(event) => setTalkTimeRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" placeholder="Max" value={talkTimeRange.max} onChange={(event) => setTalkTimeRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <label>
            Call % Range
            <div className="filter-range">
              <input type="number" min="0" max="100" placeholder="Min" value={callPercentRange.min} onChange={(event) => setCallPercentRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" max="100" placeholder="Max" value={callPercentRange.max} onChange={(event) => setCallPercentRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <label>
            Talk % Range
            <div className="filter-range">
              <input type="number" min="0" max="100" placeholder="Min" value={talkPercentRange.min} onChange={(event) => setTalkPercentRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" max="100" placeholder="Max" value={talkPercentRange.max} onChange={(event) => setTalkPercentRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <label>
            Quality % Range
            <div className="filter-range">
              <input type="number" min="0" max="100" placeholder="Min" value={qualityRange.min} onChange={(event) => setQualityRange((range) => ({ ...range, min: Number(event.target.value) }))} />
              <span>-</span>
              <input type="number" min="0" max="100" placeholder="Max" value={qualityRange.max} onChange={(event) => setQualityRange((range) => ({ ...range, max: Number(event.target.value) }))} />
            </div>
          </label>
          <button type="button" className="perf-reset" onClick={resetFilters}><X size={14} /> Reset</button>
        </section>
      )}

      {!showHistoryMode && (
        <>
          {/* Team Rankings */}
      <section className="perf-section">
        <div className="perf-section-header">
          <div>
            <span className="perf-section-kicker">TEAM RANKINGS</span>
            <h3>Top Performing Teams</h3>
          </div>
          <div className="perf-rank-controls">
            <label>
              Rank by
              <select value={teamRankBy} onChange={(event) => setTeamRankBy(event.target.value)}>
                <option value="sales">Sales</option>
                <option value="talkingTime">Talking Time</option>
                <option value="calls">Calls</option>
                <option value="kpi">KPI</option>
              </select>
            </label>
            <label>
              Show
              <select value={teamRankCount} onChange={(event) => setTeamRankCount(Number(event.target.value))}>
                <option value={3}>Top 3</option>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
              </select>
            </label>
          </div>
        </div>
        <div className="perf-team-rankings">
          {sortedTeams.slice(0, teamRankCount).map((team, index) => (
            <div key={team.teamName} className={`perf-team-card ${index === 0 ? "top-team" : ""} ${index === 1 ? "rank-2" : ""} ${index === 2 ? "rank-3" : ""}`}>
              <div className="team-rank-badge">
                {index === 0 && <Trophy size={16} />}
                <span>#{index + 1}</span>
              </div>
              <div className="team-rank-info">
                <strong>{team.teamName}</strong>
                <span>{team.employeeCount} employees</span>
              </div>
              <div className="team-rank-metric">
                <strong>
                  {teamRankBy === "sales" && team.sales.toLocaleString()}
                  {teamRankBy === "talkingTime" && formatTime(team.monthlyTalkingTime)}
                  {teamRankBy === "calls" && team.monthlyCalls.toLocaleString()}
                  {teamRankBy === "kpi" && `${formatNumber(team.avgKpi)}%`}
                </strong>
                <small>
                  {teamRankBy === "sales" && "Total Sales"}
                  {teamRankBy === "talkingTime" && "Total Hours"}
                  {teamRankBy === "calls" && "Total Calls"}
                  {teamRankBy === "kpi" && "Avg KPI"}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Employee Rankings */}
      <section className="perf-section">
        <div className="perf-section-header">
          <div>
            <span className="perf-section-kicker">EMPLOYEE RANKINGS</span>
            <h3>Top Performing Employees</h3>
          </div>
          <div className="perf-rank-controls">
            <label>
              Rank by
              <select value={employeeRankBy} onChange={(event) => setEmployeeRankBy(event.target.value)}>
                <option value="sales">Sales</option>
                <option value="talkingTime">Talking Time</option>
                <option value="calls">Calls</option>
                <option value="kpi">KPI</option>
              </select>
            </label>
            <label>
              Show
              <select value={employeeRankCount} onChange={(event) => setEmployeeRankCount(Number(event.target.value))}>
                <option value={3}>Top 3</option>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
              </select>
            </label>
          </div>
        </div>
        <div className="perf-employee-rankings">
          {rankedEmployees.slice(0, employeeRankCount).map((employee, index) => (
            <div key={employee.id} className={`perf-employee-card ${index === 0 ? "top-employee" : ""} ${index === 1 ? "rank-2" : ""} ${index === 2 ? "rank-3" : ""}`}>
              <div className="employee-rank-badge">
                {index === 0 && <Trophy size={16} />}
                <span>#{index + 1}</span>
              </div>
              <div className="employee-rank-info">
                <strong>{employee.fullName}</strong>
                <span>{employee.teamName}</span>
              </div>
              <div className="employee-rank-metric">
                <strong>
                  {employeeRankBy === "sales" && employee.sales.toLocaleString()}
                  {employeeRankBy === "talkingTime" && formatTime(employee.monthlyTalkingTime)}
                  {employeeRankBy === "calls" && employee.monthlyCalls.toLocaleString()}
                  {employeeRankBy === "kpi" && `${formatNumber(employee.totalKpi)}%`}
                </strong>
                <small>
                  {employeeRankBy === "sales" && "Sales"}
                  {employeeRankBy === "talkingTime" && "Hours"}
                  {employeeRankBy === "calls" && "Calls"}
                  {employeeRankBy === "kpi" && "KPI"}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Performance Table */}
      <section className="perf-section">
        <div className="perf-section-header">
          <div>
            <span className="perf-section-kicker">PERFORMANCE DATA</span>
            <h3>All Employees Performance</h3>
          </div>
          <span className="perf-count">{sortedEmployees.length} employees</span>
        </div>
        <div className="perf-table-container">
          <table className="perf-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("fullName")} className="sortable">
                  Employee
                  {sortColumn === "fullName" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("code3cx")} className="sortable">
                  Code
                  {sortColumn === "code3cx" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("hireDate")} className="sortable">
                  Hire Date
                  {sortColumn === "hireDate" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("sales")} className="sortable">
                  Sales
                  {sortColumn === "sales" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("salesZone")} className="sortable">
                  Zone
                  {sortColumn === "salesZone" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("monthlyCalls")} className="sortable">
                  Calls
                  {sortColumn === "monthlyCalls" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("monthlyTalkingTime")} className="sortable">
                  Talking Time
                  {sortColumn === "monthlyTalkingTime" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("callsPercent")} className="sortable">
                  Call %
                  {sortColumn === "callsPercent" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("talkingTimePercent")} className="sortable">
                  Talk %
                  {sortColumn === "talkingTimePercent" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("qualityPercent")} className="sortable">
                  Quality %
                  {sortColumn === "qualityPercent" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th onClick={() => handleSort("totalKpi")} className="sortable">
                  Total KPI
                  {sortColumn === "totalKpi" && (
                    <span className="sort-indicator">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((employee, index) => (
                <tr key={employee.id} className={employee.salesZone === "Green" ? "is-green" : employee.salesZone === "Red" ? "is-red" : employee.salesZone === "Yellow" ? "is-yellow" : ""}>
                  <td className="perf-name-cell">
                    <strong>{employee.fullName}</strong>
                    <small>{employee.employeeType}</small>
                  </td>
                  <td className="perf-code-cell">
                    <span>{employee.code3cx || "—"}</span>
                    <span>{employee.awfarCode || "—"}</span>
                  </td>
                  <td>{formatDate(employee.hireDate)}</td>
                  <td className={`perf-number-cell ${employee.salesZone?.toLowerCase() || ""}`}>{Number(employee.sales).toLocaleString()}</td>
                  <td>
                    <span className={`zone-badge ${employee.salesZone?.toLowerCase()}`}>
                      {employee.salesZone || "—"}
                    </span>
                  </td>
                  <td className={`perf-number-cell ${getCallsClass(employee.monthlyCalls)}`}>{Number(employee.monthlyCalls).toLocaleString()}</td>
                  <td className={`perf-time-cell ${getTalkTimeClass(employee.monthlyTalkingTime)}`}>{formatTime(employee.monthlyTalkingTime)}</td>
                  <td className={`perf-percent-cell ${getValueClass(employee.callsPercent)}`}>{formatNumber(employee.callsPercent)}%</td>
                  <td className={`perf-percent-cell ${getValueClass(employee.talkingTimePercent)}`}>{formatNumber(employee.talkingTimePercent)}%</td>
                  <td className={`perf-percent-cell ${getValueClass(employee.qualityPercent)}`}>{formatNumber(employee.qualityPercent, 2)}%</td>
                  <td className="perf-kpi-cell">
                    <span className={`kpi-badge ${employee.totalKpi >= 80 ? "excellent" : employee.totalKpi >= 60 ? "good" : employee.totalKpi >= 40 ? "fair" : "poor"}`}>
                      {formatNumber(employee.totalKpi)}%
                    </span>
                  </td>
                  <td className="perf-action-cell">
                    <button
                      className="perf-history-btn"
                      onClick={() => loadSalesHistory(employee)}
                      title="View sales history"
                    >
                      <History size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      {/* History Modal */}
      {showHistoryModal && historyEmployee && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Sales History - {historyEmployee.fullName}</h3>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {historyLoading ? (
                <div className="modal-loading">
                  <span className="spinner" /> Loading history...
                </div>
              ) : (
                <div className="history-list">
                  {historyData?.map((item) => (
                    <div key={item.month} className="history-item">
                      <div className="history-month">
                        <strong>{new Date(`${item.month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
                      </div>
                      <div className="history-sales">
                        <span className="history-value">{Number(item.sales).toLocaleString()}</span>
                        <span className="history-zone">{item.salesZone}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
