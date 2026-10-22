import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Columns3,
  Download,
  Filter,
  Bookmark,
  Mail,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import "./dashboard-page.css";

const BASE_COLUMNS = [
  { key: "fullName", label: "Employee" },
  { key: "code3cx", label: "3CX" },
  { key: "awfarCode", label: "Awfar" },
  { key: "teamName", label: "Team" },
  { key: "hireDate", label: "Hire" },
  { key: "sales", label: "Sales" },
  { key: "expectedSales", label: "Expected Sales" },
  { key: "dailyCalls", label: "Calls" },
  { key: "dailyMissedCalls", label: "Unanswered" },
  { key: "dailyTalkingTime", label: "Talk Time" },
  { key: "monthlyTalkingTime", label: "M. Talk" },
  { key: "monthlyCalls", label: "M. Calls" },
  { key: "monthlyMissedCalls", label: "M. Unanswered" },
  { key: "talkingTimePercent", label: "Talk %" },
  { key: "callsPercent", label: "Calls %" },
  { key: "qualityPercent", label: "Quality %" },
  { key: "manualKpi", label: "Manual KPI" },
  { key: "totalKpi", label: "KPI" },
];

const DEFAULT_VISIBLE = Object.fromEntries(BASE_COLUMNS.map((column) => [column.key, true]));

const DEFAULT_WIDTHS = {
  fullName: 220,
  code3cx: 84,
  awfarCode: 84,
  teamName: 140,
  hireDate: 110,
  sales: 140,
  expectedSales: 180,
  dailyCalls: 88,
  dailyMissedCalls: 88,
  dailyTalkingTime: 110,
  monthlyTalkingTime: 110,
  monthlyCalls: 96,
  monthlyMissedCalls: 96,
  talkingTimePercent: 150,
  callsPercent: 150,
  qualityPercent: 150,
  manualKpi: 120,
  totalKpi: 88,
};

function localStamp(value = new Date()) {
  return {
    month: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`,
    date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
  };
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

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value, digits = 1) {
  const number = Number(value) || 0;
  return number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function customColumnKey(name) {
  return `custom:${name}`;
}

function calculateExpectedSales(employee, month, date) {
  const currentSales = Number(employee.sales) || 0;
  const [year, monthNum] = String(month).split("-").map(Number);
  const dayNum = Number(String(date).slice(-2)) || 1;
  const daysInCurrentMonth = new Date(year, monthNum, 0).getDate();

  // Calculate days elapsed (current day is NOT counted as elapsed)
  let daysElapsed = dayNum - 1;
  if (employee.hireDate) {
    const hireDate = new Date(employee.hireDate);
    const hireYear = hireDate.getFullYear();
    const hireMonth = hireDate.getMonth() + 1;
    const hireDay = hireDate.getDate();

    // If hired in the same month and year
    if (hireYear === year && hireMonth === monthNum) {
      daysElapsed = dayNum - hireDay;
    }
  }

  // Days remaining includes current day
  const daysRemaining = daysInCurrentMonth - dayNum + 1;

  const dailyRate = daysElapsed > 0 ? currentSales / daysElapsed : 0;
  const expectedForRemainingDays = dailyRate * daysRemaining;
  const totalExpected = currentSales + expectedForRemainingDays;

  // Calculate expected zone based on expected value
  const zones = employee.salesZones || {};
  let expectedZone = "Below";

  // Check if we have valid zone thresholds
  if (zones && typeof zones === 'object') {
    const greenFrom = Number(zones.green?.from);
    const yellowFrom = Number(zones.yellow?.from);
    const yellowTo = Number(zones.yellow?.to);
    const redFrom = Number(zones.red?.from);
    const redTo = Number(zones.red?.to);

    if (!isNaN(greenFrom) && totalExpected >= greenFrom) {
      expectedZone = "Green";
    } else if (!isNaN(yellowFrom) && !isNaN(yellowTo) && totalExpected >= yellowFrom && totalExpected <= yellowTo) {
      expectedZone = "Yellow";
    } else if (!isNaN(redFrom) && !isNaN(redTo) && totalExpected >= redFrom && totalExpected <= redTo) {
      expectedZone = "Red";
    }
  }

  // Fallback: if no zones data, use the same logic as current zone determination
  if (expectedZone === "Below" && employee.salesZone && employee.salesZone !== "Below") {
    // If employee is currently in a zone but we can't determine expected,
    // keep the current zone as expected
    expectedZone = employee.salesZone;
  }

  return {
    value: totalExpected,
    dailyRate,
    daysElapsed,
    daysRemaining,
    expectedZone,
  };
}

function getCustomKpi(employee, name) {
  return (employee.customKpis || []).find((kpi) => kpi.name === name) || null;
}

function sortValue(employee, field, customName) {
  if (customName) {
    const kpi = getCustomKpi(employee, customName);
    return kpi ? Number(kpi.weightedPercent) || 0 : -1;
  }
  const value = employee[field];
  if (field === "hireDate") return value ? new Date(value).getTime() : 0;
  return value;
}

function weightFill(earned, weight) {
  if (!weight || weight <= 0) return 0;
  return Math.max(0, Math.min(100, (Number(earned) / Number(weight)) * 100));
}

function kpiTone(value) {
  if (value >= 80) return "excellent";
  if (value >= 60) return "good";
  if (value >= 40) return "fair";
  return "poor";
}

function WidthHandle({ onStart }) {
  return (
    <span
      className="dash-col-handle"
      onMouseDown={onStart}
      onClick={(event) => event.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
    />
  );
}

function WeightCell({ earned, weight, title }) {
  const value = Number(earned) || 0;
  const cap = Number(weight) || 0;
  return (
    <div className="dash-weight" title={title}>
      <div className="dash-weight-track" aria-hidden="true">
        <i style={{ width: `${weightFill(value, cap)}%` }} />
      </div>
      <strong>{formatNumber(value)}%</strong>
      <small>{cap ? `/ ${formatNumber(cap)}%` : ""}</small>
    </div>
  );
}

function CustomKpiCell({ kpi }) {
  if (!kpi || (!kpi.target && !kpi.weight)) {
    return <span className="dash-empty">—</span>;
  }
  return (
    <div
      className="dash-custom"
      title={`${kpi.name}: actual ${kpi.actual} / target ${kpi.target} · earned ${formatNumber(kpi.weightedPercent)}% of ${formatNumber(kpi.weight)}% weight`}
    >
      <strong>{formatNumber(kpi.weightedPercent)}%</strong>
      <span>{Number(kpi.actual || 0).toLocaleString()} / {Number(kpi.target || 0).toLocaleString()}</span>
    </div>
  );
}

export default function DashboardPage({ user, can }) {
  const today = useMemo(() => localStamp(), []);
  const [month, setMonth] = useState(today.month);
  const months = useMemo(() => {
    const choices = monthChoices();
    if (!choices.some((item) => item.value === month)) {
      const [year, monthNumber] = month.split("-").map(Number);
      choices.push({
        value: month,
        label: new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      });
      choices.sort((a, b) => b.value.localeCompare(a.value));
    }
    return choices;
  }, [month]);
  const [date, setDate] = useState(today.date);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("totalKpi");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedSalesZone, setSelectedSalesZone] = useState("all");
  const [kpiRange, setKpiRange] = useState({ min: 0, max: 100 });
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_WIDTHS);
  const [rowHeight, setRowHeight] = useState(46);
  const [filterPresets, setFilterPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [defaultPresetId, setDefaultPresetId] = useState("");
  const [autoApplyPreset, setAutoApplyPreset] = useState(false);
  const [presetsReady, setPresetsReady] = useState(false);
  const [presetsBusy, setPresetsBusy] = useState(false);
  const [presetsError, setPresetsError] = useState("");
  const dragRef = useRef(null);
  const dataRef = useRef(null);
  dataRef.current = dashboardData;

  function applyFilterPreset(preset) {
    const config = preset?.config;
    if (!config) return;
    setMonth(config.month);
    setDate(config.date);
    setSearchQuery(config.searchQuery || "");
    setSelectedTeam(config.selectedTeam || "all");
    setSelectedSalesZone(config.selectedSalesZone || "all");
    setKpiRange(config.kpiRange || { min: 0, max: 100 });
    setSortField(config.sortField || "totalKpi");
    setSortDirection(config.sortDirection === "asc" ? "asc" : "desc");
    setVisibleColumns({ ...DEFAULT_VISIBLE, ...(config.visibleColumns || {}) });
    setColumnWidths({ ...DEFAULT_WIDTHS, ...(config.columnWidths || {}) });
    setRowHeight(config.rowHeight || 46);
    setShowFilters(config.showFilters === true);
    setShowColumnSelector(config.showColumnSelector === true);
  }

  const loadDashboardData = useCallback(async (nextMonth, nextDate) => {
    const hasData = Boolean(dataRef.current);
    if (hasData) setRefreshing(true);
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
        setError(dashboardResult.message || "Dashboard data could not be loaded.");
        return;
      }
      setDashboardData(dashboardResult);
    } catch {
      setError("Dashboard data could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadFilterPresets() {
      try {
        if (!window.qaDesk?.dashboard?.filtersGet) {
          throw new Error("Saved dashboard filters are unavailable. Restart the desktop app.");
        }
        const result = await window.qaDesk.dashboard.filtersGet();
        if (!result.ok) throw new Error(result.message || "Saved dashboard filters could not be loaded.");
        if (!active) return;
        const presets = Array.isArray(result.presets) ? result.presets : [];
        const defaultId = presets.some((preset) => preset.id === result.defaultPresetId) ? result.defaultPresetId : "";
        setFilterPresets(presets);
        setDefaultPresetId(defaultId);
        setSelectedPresetId(defaultId);
        setAutoApplyPreset(Boolean(defaultId));
        const defaultPreset = presets.find((preset) => preset.id === defaultId);
        if (defaultPreset) {
          setPresetName(defaultPreset.name || "");
          applyFilterPreset(defaultPreset);
        }
      } catch (loadError) {
        if (active) setPresetsError(loadError.message || "Saved dashboard filters could not be loaded.");
      } finally {
        if (active) setPresetsReady(true);
      }
    }
    setPresetsReady(false);
    void loadFilterPresets();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!presetsReady) return;
    void loadDashboardData(month, date);
  }, [month, date, loadDashboardData, presetsReady]);

  useEffect(() => {
    function onMove(event) {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.type === "column") {
        const width = Math.max(64, drag.startWidth + event.clientX - drag.startX);
        setColumnWidths((current) => ({ ...current, [drag.key]: width }));
      } else if (drag.type === "row") {
        setRowHeight(Math.max(36, Math.min(88, drag.startHeight + event.clientY - drag.startY)));
      }
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const customKpiColumns = useMemo(() => {
    const names = new Set(dashboardData?.customKpiColumns || []);
    for (const employee of dashboardData?.employees || []) {
      for (const kpi of employee.customKpis || []) {
        if (kpi?.name) names.add(kpi.name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({
      key: customColumnKey(name),
      label: name,
      customName: name,
    }));
  }, [dashboardData]);

  useEffect(() => {
    if (!customKpiColumns.length) return;
    setVisibleColumns((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const column of customKpiColumns) {
        if (next[column.key] === undefined) {
          next[column.key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setColumnWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const column of customKpiColumns) {
        if (next[column.key] === undefined) {
          next[column.key] = 140;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [customKpiColumns]);

  const columnDefinitions = useMemo(() => [...BASE_COLUMNS, ...customKpiColumns], [customKpiColumns]);
  const visibleDefs = columnDefinitions.filter((column) => visibleColumns[column.key]);
  const tableWidth = visibleDefs.reduce((sum, column) => sum + (columnWidths[column.key] || 120), 0);

  const uniqueTeams = useMemo(() => {
    if (!dashboardData?.employees) return [];
    return [...new Set(dashboardData.employees.map((employee) => employee.teamName).filter(Boolean))].sort();
  }, [dashboardData]);

  const dayOptions = useMemo(() => {
    const count = dashboardData?.daysInMonth || daysInMonth(month);
    return Array.from({ length: count }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { value: `${month}-${day}`, label: day };
    });
  }, [dashboardData, month]);

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (dashboardData?.employees || []).filter((employee) => {
      const matchesSearch = !query || [employee.fullName, employee.code3cx, employee.awfarCode, employee.teamName]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesTeam = selectedTeam === "all" || employee.teamName === selectedTeam;
      const matchesSalesZone = selectedSalesZone === "all" || employee.salesZone === selectedSalesZone;
      const matchesKpi = employee.totalKpi >= kpiRange.min && employee.totalKpi <= kpiRange.max;
      return matchesSearch && matchesTeam && matchesSalesZone && matchesKpi;
    });
  }, [dashboardData, searchQuery, selectedTeam, selectedSalesZone, kpiRange]);

  const sortedEmployees = useMemo(() => {
    const customColumn = customKpiColumns.find((column) => column.key === sortField);
    const next = [...filteredEmployees];
    next.sort((a, b) => {
      const aVal = sortValue(a, sortField, customColumn?.customName);
      const bVal = sortValue(b, sortField, customColumn?.customName);
      const comparison = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal ?? "").localeCompare(String(bVal ?? ""));
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return next;
  }, [filteredEmployees, sortField, sortDirection, customKpiColumns]);

  const stats = useMemo(() => {
    const count = sortedEmployees.length;
    const avgKpi = count ? sortedEmployees.reduce((sum, employee) => sum + employee.totalKpi, 0) / count : 0;
    const avgQuality = count ? sortedEmployees.reduce((sum, employee) => sum + employee.qualityPercent, 0) / count : 0;
    const top = count ? sortedEmployees.reduce((best, employee) => employee.totalKpi > best.totalKpi ? employee : best) : null;
    return {
      total: dashboardData?.employees?.length || 0,
      filtered: count,
      avgKpi,
      avgQuality,
      green: sortedEmployees.filter((employee) => employee.salesZone === "Green").length,
      yellow: sortedEmployees.filter((employee) => employee.salesZone === "Yellow").length,
      red: sortedEmployees.filter((employee) => employee.salesZone === "Red").length,
      sales: sortedEmployees.reduce((sum, employee) => sum + (Number(employee.sales) || 0), 0),
      calls: sortedEmployees.reduce((sum, employee) => sum + (Number(employee.dailyCalls) || 0), 0),
      missedCalls: sortedEmployees.reduce((sum, employee) => sum + (Number(employee.dailyMissedCalls) || 0), 0),
      talk: sortedEmployees.reduce((sum, employee) => sum + (Number(employee.dailyTalkingTime) || 0), 0),
      topName: top?.fullName || "—",
    };
  }, [sortedEmployees, dashboardData]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(field);
    setSortDirection("desc");
  }

  function startColumnResize(key, event) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      type: "column",
      key,
      startX: event.clientX,
      startWidth: columnWidths[key] || 120,
    };
  }

  function startRowResize(event) {
    event.preventDefault();
    dragRef.current = {
      type: "row",
      startY: event.clientY,
      startHeight: rowHeight,
    };
  }

  function changeMonth(nextMonth) {
    setMonth(nextMonth);
    setDate(clampDateToMonth(nextMonth, date));
  }

  function currentFilterConfig() {
    return {
      month,
      date,
      searchQuery,
      selectedTeam,
      selectedSalesZone,
      kpiRange,
      sortField,
      sortDirection,
      visibleColumns,
      columnWidths,
      rowHeight,
      showFilters,
      showColumnSelector,
    };
  }

  async function saveFilterPreset() {
    const name = presetName.trim();
    if (!name) {
      setPresetsError("Enter a name for this saved dashboard filter.");
      return;
    }
    setPresetsBusy(true);
    setPresetsError("");
    try {
      const result = await window.qaDesk.dashboard.filtersSave({
        id: selectedPresetId || undefined,
        name,
        config: currentFilterConfig(),
      });
      if (!result.ok) throw new Error(result.message || "Dashboard filter could not be saved.");
      const nextPresets = filterPresets.some((preset) => preset.id === result.preset.id)
        ? filterPresets.map((preset) => preset.id === result.preset.id ? result.preset : preset)
        : [...filterPresets, result.preset];
      setFilterPresets(nextPresets);
      setSelectedPresetId(result.preset.id);
      setPresetName(result.preset.name);
      if (autoApplyPreset) {
        const defaultResult = await window.qaDesk.dashboard.filtersSetDefault(result.preset.id);
        if (!defaultResult.ok) throw new Error(defaultResult.message || "Filter saved, but the default could not be updated.");
        setDefaultPresetId(result.preset.id);
      }
    } catch (saveError) {
      setPresetsError(saveError.message || "Dashboard filter could not be saved.");
    } finally {
      setPresetsBusy(false);
    }
  }

  async function setPresetAsDefault(enabled) {
    if (!selectedPresetId) return;
    setPresetsBusy(true);
    setPresetsError("");
    try {
      const id = enabled ? selectedPresetId : "";
      const result = await window.qaDesk.dashboard.filtersSetDefault(id);
      if (!result.ok) throw new Error(result.message || "Default dashboard filter could not be updated.");
      setDefaultPresetId(id);
      setAutoApplyPreset(Boolean(id));
    } catch (defaultError) {
      setPresetsError(defaultError.message || "Default dashboard filter could not be updated.");
    } finally {
      setPresetsBusy(false);
    }
  }

  async function deleteFilterPreset() {
    if (!selectedPresetId) return;
    setPresetsBusy(true);
    setPresetsError("");
    try {
      const result = await window.qaDesk.dashboard.filtersDelete(selectedPresetId);
      if (!result.ok) throw new Error(result.message || "Saved dashboard filter could not be deleted.");
      setFilterPresets((presets) => presets.filter((preset) => preset.id !== selectedPresetId));
      if (defaultPresetId === selectedPresetId) setDefaultPresetId("");
      setSelectedPresetId("");
      setPresetName("");
      setAutoApplyPreset(false);
    } catch (deleteError) {
      setPresetsError(deleteError.message || "Saved dashboard filter could not be deleted.");
    } finally {
      setPresetsBusy(false);
    }
  }

  function resetFilters() {
    setSearchQuery("");
    setSelectedTeam("all");
    setSelectedSalesZone("all");
    setKpiRange({ min: 0, max: 100 });
  }

  function toggleColumn(column) {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  }

  function resetColumns() {
    const next = { ...DEFAULT_VISIBLE };
    customKpiColumns.forEach((column) => {
      next[column.key] = true;
    });
    setVisibleColumns(next);
  }

  function exportToExcel() {
    import("xlsx").then((XLSX) => {
      const headers = visibleDefs.map((column) => column.label);
      const rows = sortedEmployees.map((employee) => {
        const row = {};
        if (visibleColumns.fullName) row.Employee = employee.fullName;
        if (visibleColumns.code3cx) row["3CX"] = employee.code3cx || "—";
        if (visibleColumns.awfarCode) row.Awfar = employee.awfarCode || "—";
        if (visibleColumns.teamName) row.Team = employee.teamName;
        if (visibleColumns.hireDate) row.Hire = formatDate(employee.hireDate);
        if (visibleColumns.sales) row.Sales = `${employee.sales.toLocaleString()} (${employee.salesZone})`;
        if (visibleColumns.expectedSales) {
          const expected = calculateExpectedSales(employee, month, date);
          const expectedZone = expected.expectedZone || "Below";
          const arrow = expectedZone === "Green" ? "↑" : expectedZone === "Red" ? "↓" : "→";
          row["Expected Sales"] = `${expected.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${arrow} (${expectedZone})`;
        }
        if (visibleColumns.dailyCalls) row.Calls = employee.dailyCalls.toLocaleString();
        if (visibleColumns.dailyMissedCalls) row.Unanswered = employee.dailyMissedCalls.toLocaleString();
        if (visibleColumns.dailyTalkingTime) row["Talk Time"] = formatTime(employee.dailyTalkingTime);
        if (visibleColumns.monthlyTalkingTime) row["M. Talk"] = formatTime(employee.monthlyTalkingTime);
        if (visibleColumns.monthlyCalls) row["M. Calls"] = employee.monthlyCalls.toLocaleString();
        if (visibleColumns.monthlyMissedCalls) row["M. Unanswered"] = employee.monthlyMissedCalls.toLocaleString();
        if (visibleColumns.talkingTimePercent) row["Talk %"] = `${formatNumber(employee.talkingTimePercent)}%`;
        if (visibleColumns.callsPercent) row["Calls %"] = `${formatNumber(employee.callsPercent)}%`;
        if (visibleColumns.qualityPercent) row["Quality %"] = `${formatNumber(employee.qualityPercent, 2)}%`;
        if (visibleColumns.manualKpi) row["Manual KPI"] = employee.manualKpi > 0 ? `${formatNumber(employee.manualKpi)}%` : "—";
        if (visibleColumns.totalKpi) row.KPI = `${formatNumber(employee.totalKpi)}%`;
        customKpiColumns.forEach((column) => {
          if (!visibleColumns[column.key]) return;
          const kpi = getCustomKpi(employee, column.customName);
          row[column.label] = kpi
            ? `${formatNumber(kpi.weightedPercent)}% | ${Number(kpi.actual || 0).toLocaleString()} / ${Number(kpi.target || 0).toLocaleString()}`
            : "—";
        });
        return row;
      });
      const wsData = [headers, ...rows.map((row) => headers.map((header) => row[header]))];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      worksheet["!cols"] = headers.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard");
      XLSX.writeFile(workbook, `QA_Dashboard_${date}.xlsx`);
    }).catch(() => {
      setError("Excel export is not available.");
    });
  }

  async function sendEmailReport() {
    if (!window.qaDesk?.dashboard?.sendEmail) {
      setError("Email API is not available. Restart the desktop app.");
      return;
    }
    
    if (sortedEmployees.length === 0) {
      setError("No employees to send in the email. Adjust your filters.");
      return;
    }

    setSendingEmail(true);
    setError("");
    
    try {
      const result = await window.qaDesk.dashboard.sendEmail({
        employees: sortedEmployees,
        visibleColumns,
        columnDefinitions,
        date,
        sortField,
        sortDirection,
      });

      if (!result.ok) {
        setError(result.message || "Email could not be sent.");
      } else {
        setError(result.message || "Email sent successfully!");
      }
    } catch (err) {
      setError("Email could not be sent. Check your connection and SMTP settings.");
    } finally {
      setSendingEmail(false);
    }
  }

  const sortMark = (field) => sortField === field ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
  const headerCell = (key, label, extraClass = "") => visibleColumns[key] && (
    <th
      key={key}
      className={extraClass}
      style={{ width: columnWidths[key] || 120, minWidth: columnWidths[key] || 120 }}
      onClick={() => handleSort(key)}
    >
      <span>{label}{sortMark(key)}</span>
      <WidthHandle onStart={(event) => startColumnResize(key, event)} />
    </th>
  );

  if (loading && !dashboardData) {
    return <div className="dashboard-page"><div className="dash-loading">Loading performance data…</div></div>;
  }

  return (
    <div className="dashboard-page" style={{ "--dash-row-h": `${rowHeight}px` }}>
      <header className="dash-chrome">
        <div className="dash-chrome-row">
          <div className="dash-title-block">
            <h2>Dashboard</h2>
            <span>{formatDate(date)}</span>
          </div>
          <div className="dash-control-bar">
            <label className="dash-search">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search employee, 3CX, Awfar, team"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <div className="dash-period-group" aria-label="Period">
              <select value={month} onChange={(event) => changeMonth(event.target.value)} aria-label="Month">
                {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={date} onChange={(event) => setDate(event.target.value)} aria-label="Day">
                {dayOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="dash-actions">
              <button type="button" className={showFilters ? "is-on" : ""} onClick={() => setShowFilters((value) => !value)}>
                <Filter size={15} /> Filters
              </button>
              <button type="button" className={showColumnSelector ? "is-on" : ""} onClick={() => setShowColumnSelector((value) => !value)}>
                <Columns3 size={15} /> Columns
              </button>
              <button type="button" className="dash-refresh" disabled={refreshing} onClick={() => void loadDashboardData(month, date)}>
                <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
              <button type="button" className="dash-export" onClick={exportToExcel}>
                <Download size={15} /> Excel
              </button>
              {can("canSendEmails") && <button type="button" className="dash-export" onClick={sendEmailReport} disabled={sendingEmail}>
                <Mail size={15} /> {sendingEmail ? "Sending..." : "Email"}
              </button>}
            </div>
          </div>
        </div>

        <section className="dash-metrics" aria-label="Summary">
          <div><span>Employees</span><strong>{stats.total}</strong></div>
          <div><span>Visible</span><strong>{stats.filtered}</strong></div>
          <div><span>Avg KPI</span><strong>{stats.filtered ? `${formatNumber(stats.avgKpi)}%` : "—"}</strong></div>
          <div className="dash-zones">
            <span>Sales zones</span>
            <strong>
              <b className="is-green">{stats.green} G</b>
              <b className="is-yellow">{stats.yellow} Y</b>
              <b className="is-red">{stats.red} R</b>
            </strong>
          </div>
          <div><span>Day calls</span><strong>{stats.calls.toLocaleString()}</strong></div>
          <div><span>Day unanswered</span><strong style={{ color: "#d97706" }}>{stats.missedCalls.toLocaleString()}</strong></div>
          <div><span>Day talk</span><strong>{formatTime(stats.talk)}</strong></div>
          <div><span>Quality wt</span><strong>{stats.filtered ? `${formatNumber(stats.avgQuality)}%` : "—"}</strong></div>
          <div className="dash-top-metric"><span>Top KPI</span><strong title={stats.topName}>{stats.topName}</strong></div>
        </section>
      </header>

      {error && <div className="dash-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}
      {presetsError && <div className="dash-error" role="alert">{presetsError}<button type="button" onClick={() => setPresetsError("")} aria-label="Dismiss"><X size={14} /></button></div>}

      <section className="dash-presets" aria-label="Saved dashboard filters">
        <div className="dash-preset-title"><Bookmark size={15} /><strong>Saved filters</strong></div>
        <select
          value={selectedPresetId}
          onChange={(event) => {
            const id = event.target.value;
            const preset = filterPresets.find((item) => item.id === id);
            setSelectedPresetId(id);
            setPresetName(preset?.name || "");
            setAutoApplyPreset(Boolean(id && id === defaultPresetId));
          }}
          disabled={!presetsReady || presetsBusy}
          aria-label="Choose a saved dashboard filter"
        >
          <option value="">New filter</option>
          {filterPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        <input
          type="text"
          maxLength={80}
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          placeholder="Filter name"
          aria-label="Saved filter name"
          disabled={!presetsReady || presetsBusy}
        />
        <button type="button" onClick={saveFilterPreset} disabled={!presetsReady || presetsBusy}>
          <Save size={14} /> {presetsBusy ? "Saving…" : "Save current"}
        </button>
        <button
          type="button"
          onClick={() => applyFilterPreset(filterPresets.find((preset) => preset.id === selectedPresetId))}
          disabled={!selectedPresetId || presetsBusy}
        >
          Apply
        </button>
        <button type="button" className="dash-preset-delete" onClick={deleteFilterPreset} disabled={!selectedPresetId || presetsBusy} aria-label="Delete saved filter">
          <Trash2 size={14} />
        </button>
        <label className="dash-preset-default">
          <input
            type="checkbox"
            checked={autoApplyPreset}
            disabled={!selectedPresetId || presetsBusy}
            onChange={(event) => void setPresetAsDefault(event.target.checked)}
          />
          Apply automatically when Dashboard opens
        </label>
      </section>

      {showFilters && (
        <section className="dash-panel">
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
            KPI from
            <input type="number" min="0" max="100" value={kpiRange.min} onChange={(event) => setKpiRange((range) => ({ ...range, min: Number(event.target.value) }))} />
          </label>
          <label>
            KPI to
            <input type="number" min="0" max="100" value={kpiRange.max} onChange={(event) => setKpiRange((range) => ({ ...range, max: Number(event.target.value) }))} />
          </label>
          <button type="button" className="dash-reset" onClick={resetFilters}><X size={14} /> Reset</button>
        </section>
      )}

      {showColumnSelector && (
        <section className="dash-columns">
          <div className="dash-columns-head">
            <strong><SlidersHorizontal size={14} /> Columns</strong>
            <button type="button" onClick={resetColumns}>Show all</button>
          </div>
          <div className="dash-columns-grid">
            {columnDefinitions.map((column) => (
              <label key={column.key}>
                <input type="checkbox" checked={Boolean(visibleColumns[column.key])} onChange={() => toggleColumn(column.key)} />
                <span>{visibleColumns[column.key] ? <Check size={10} /> : null}</span>
                {column.label}
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="dash-table-wrap">
        <table className="dash-table" style={{ width: Math.max(tableWidth, 960) }}>
          <colgroup>
            {visibleDefs.map((column) => (
              <col key={column.key} style={{ width: columnWidths[column.key] || 120 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {headerCell("fullName", "Employee", "is-sticky")}
              {headerCell("code3cx", "3CX")}
              {headerCell("awfarCode", "Awfar")}
              {headerCell("teamName", "Team")}
              {headerCell("hireDate", "Hire")}
              {headerCell("sales", "Sales")}
              {headerCell("expectedSales", "Expected Sales")}
              {headerCell("dailyCalls", "Calls")}
              {headerCell("dailyMissedCalls", "Unanswered")}
              {headerCell("dailyTalkingTime", "Talk Time")}
              {headerCell("monthlyTalkingTime", "M. Talk")}
              {headerCell("monthlyCalls", "M. Calls")}
              {headerCell("monthlyMissedCalls", "M. Unanswered")}
              {headerCell("talkingTimePercent", "Talk %")}
              {headerCell("callsPercent", "Calls %")}
              {headerCell("qualityPercent", "Quality %")}
              {headerCell("manualKpi", "Manual KPI")}
              {headerCell("totalKpi", "KPI")}
              {customKpiColumns.map((column) => headerCell(column.key, column.label))}
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.map((employee) => (
              <tr key={`${employee.id}-${date}`} className={employee.salesZone === "Green" ? "is-green" : employee.salesZone === "Red" ? "is-red" : ""}>
                {visibleColumns.fullName && (
                  <td className="is-sticky dash-name" style={{ width: columnWidths.fullName }}>
                    <strong>{employee.fullName}</strong>
                    <small>{employee.employeeType || ""}</small>
                  </td>
                )}
                {visibleColumns.code3cx && <td>{employee.code3cx || "—"}</td>}
                {visibleColumns.awfarCode && <td>{employee.awfarCode || "—"}</td>}
                {visibleColumns.teamName && <td>{employee.teamName}</td>}
                {visibleColumns.hireDate && <td>{formatDate(employee.hireDate)}</td>}
                {visibleColumns.sales && (
                  <td>
                    <span className={`dash-zone is-${String(employee.salesZone || "below").toLowerCase()}`}>
                      {Number(employee.sales || 0).toLocaleString()} · {employee.salesZone}
                    </span>
                  </td>
                )}
                {visibleColumns.expectedSales && (() => {
                  const expected = calculateExpectedSales(employee, month, date);
                  const currentZone = employee.salesZone || "Below";
                  const expectedZone = expected.expectedZone || "Below";
                  const isGreen = expectedZone === "Green";
                  const isYellow = expectedZone === "Yellow";
                  const isRed = expectedZone === "Red";
                  const arrow = isGreen ? "↑" : isRed ? "↓" : "→";
                  const zoneClass = isGreen ? "is-green" : isRed ? "is-red" : isYellow ? "is-yellow" : "is-below";

                  // Check if zone will change
                  const zoneWillChange = currentZone !== expectedZone;
                  const zoneChangeText = zoneWillChange ? ` (${currentZone} → ${expectedZone})` : ` (${expectedZone})`;

                  return (
                    <td>
                      <span className={`dash-zone ${zoneClass}`} title={`Current: ${employee.sales} (${currentZone}) | Expected: ${expected.value.toFixed(2)} (${expectedZone}) | Daily rate: ${expected.dailyRate.toFixed(2)} | Days elapsed: ${expected.daysElapsed} | Days remaining: ${expected.daysRemaining}`}>
                        {expected.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {arrow}{zoneChangeText}
                      </span>
                    </td>
                  );
                })()}
                {visibleColumns.dailyCalls && <td className="is-num">{Number(employee.dailyCalls || 0).toLocaleString()}</td>}
                {visibleColumns.dailyMissedCalls && <td className="is-num" style={{ color: "#d97706" }}>{Number(employee.dailyMissedCalls || 0).toLocaleString()}</td>}
                {visibleColumns.dailyTalkingTime && <td className="is-num">{formatTime(employee.dailyTalkingTime)}</td>}
                {visibleColumns.monthlyTalkingTime && <td className="is-num">{formatTime(employee.monthlyTalkingTime)}</td>}
                {visibleColumns.monthlyCalls && <td className="is-num">{Number(employee.monthlyCalls || 0).toLocaleString()}</td>}
                {visibleColumns.monthlyMissedCalls && <td className="is-num" style={{ color: "#d97706" }}>{Number(employee.monthlyMissedCalls || 0).toLocaleString()}</td>}
                {visibleColumns.talkingTimePercent && (
                  <td>
                    <WeightCell
                      earned={employee.talkingTimePercent}
                      weight={employee.talkingTimeWeight}
                      title={`Earned ${formatNumber(employee.talkingTimePercent)}% of ${formatNumber(employee.talkingTimeWeight || 0)}% talk weight`}
                    />
                  </td>
                )}
                {visibleColumns.callsPercent && (
                  <td>
                    <WeightCell
                      earned={employee.callsPercent}
                      weight={employee.callsWeight}
                      title={`Earned ${formatNumber(employee.callsPercent)}% of ${formatNumber(employee.callsWeight || 0)}% calls weight`}
                    />
                  </td>
                )}
                {visibleColumns.qualityPercent && (
                  <td>
                    <WeightCell
                      earned={employee.qualityPercent}
                      weight={employee.qualityWeight}
                      title={`Earned ${formatNumber(employee.qualityPercent, 2)}% of ${formatNumber(employee.qualityWeight || 0)}% quality weight`}
                    />
                  </td>
                )}
                {visibleColumns.manualKpi && (
                  <td>
                    <span className={employee.manualKpi > 0 ? "dash-manual-kpi" : "dash-empty"}>
                      {employee.manualKpi > 0 ? `${formatNumber(employee.manualKpi)}%` : "—"}
                    </span>
                  </td>
                )}
                {visibleColumns.totalKpi && (
                  <td>
                    <span className={`dash-kpi is-${kpiTone(employee.totalKpi)}`}>{formatNumber(employee.totalKpi)}%</span>
                  </td>
                )}
                {customKpiColumns.map((column) => visibleColumns[column.key] && (
                  <td key={column.key}>
                    <CustomKpiCell kpi={getCustomKpi(employee, column.customName)} />
                  </td>
                ))}
              </tr>
            ))}
            {!sortedEmployees.length && (
              <tr>
                <td colSpan={Math.max(1, visibleDefs.length)} className="dash-empty-row">
                  No employees match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="dash-row-handle" onMouseDown={startRowResize} title="Drag to change row height" />
      </div>

      <footer className="dash-foot">
        <span>{sortedEmployees.length} of {dashboardData?.employees?.length || 0} employees</span>
        <span>{date} · drag column edges to resize · drag the bar under the table to resize rows</span>
      </footer>
    </div>
  );
}
