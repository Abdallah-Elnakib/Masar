const { MongoClient } = require("mongodb");

/**
 * Loads and calculates the Dashboard summary from a connected MongoDB database.
 * By default, includes all employees except those whose status is "Resigned".
 * Pass options.employeeFilter to apply a MongoDB employee filter.
 */
async function getDashboardSummary(database, input = {}, options = {}) {
class DashboardSummaryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "DashboardSummaryValidationError";
  }
}

function validateMonth(value) {
  const month = String(value || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new DashboardSummaryValidationError("Choose a valid evaluation month.");
  }
  return month;
}

function validateDate(value, month) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month) {
    throw new DashboardSummaryValidationError("Choose a valid day within the selected month.");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DashboardSummaryValidationError("Choose a valid day within the selected month.");
  }
  return date;
}

function localStamp(value = new Date()) {
  return {
    month: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`,
    date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
  };
}

function talkingSeconds(entry) {
  const seconds = Number(entry?.seconds);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const hours = Number(entry?.hours);
  if (Number.isFinite(hours) && hours > 0) return hours * 3600;
  return 0;
}

function monthlyCustomKpiActual(employee, kpiName, month) {
  const monthValues = employee.customKpiAchievementsByMonth?.[month] || {};
  const storageKey = encodeURIComponent(kpiName).replaceAll(".", "%2E");
  if (Object.hasOwn(monthValues, storageKey)) return Number(monthValues[storageKey] ?? 0);
  return month === localStamp().month ? Number(employee.customKpiAchievements?.[kpiName] || 0) : 0;
}

function monthlyCustomKpiTarget(employee, kpiName, month) {
  const monthValues = employee.customKpiTargetsByMonth?.[month] || {};
  const storageKey = encodeURIComponent(kpiName).replaceAll(".", "%2E");
  if (!Object.hasOwn(monthValues, storageKey)) return 0;
  return Number(monthValues[storageKey] ?? 0);
}

function employeeSalesSettings(employee, team) {
  const level = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "senior" : "agent";
  const teamSales = team?.performance?.[level] || {};
  const employeeTargets = employee.performanceTargets || {};
  const custom = employeeTargets.salesMode === "custom";
  return {
    enabled: custom || Boolean(team?.performance?.enabled),
    zones: custom ? employeeTargets.sales || {} : teamSales,
  };
}

function employeeTalkingTimeTarget(employee, teamKpis) {
  const employeeTargets = employee.performanceTargets || {};
  if (employeeTargets.talkingTimeMode === "custom") return Number(employeeTargets.talkingTimeHours) || 0;
  const metric = teamKpis.talkingTimeHours;
  return metric?.enabled ? Number(metric.target || 0) : 0;
}

function monthlyManualKpi(employee, month) {
  const monthValues = employee.manualKpiByMonth || {};
  if (Object.hasOwn(monthValues, month)) return Number(monthValues[month] ?? 0);
  return month === localStamp().month ? Number(employee.manualKpi || 0) : 0;
}

  if (!database || typeof database.collection !== "function") {
    throw new TypeError("A connected MongoDB database instance is required.");
  }

  const today = localStamp();
  const month = validateMonth(input.month || today.month);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const selectedDate = input.date
    ? validateDate(input.date, month)
    : (today.month === month ? today.date : lastDay);
  const employeeFilter = options.employeeFilter || { employmentStatus: { $ne: "Resigned" } };

  const employees = await database.collection("employees").aggregate([
    { $match: employeeFilter },
    { $lookup: { from: "teams", localField: "teamId", foreignField: "_id", as: "team" } },
    { $unwind: "$team" },
    { $sort: { "team.teamName": 1, fullNameLower: 1 } },
  ]).toArray();

  const monthStart = `${month}-01`;
  const [callsEntries, talkingTimeEntries, qualityEvaluations] = await Promise.all([
    database.collection("callsTrackingEntries").find({
      $or: [{ month }, { date: { $gte: monthStart, $lte: lastDay } }],
    }).toArray(),
    database.collection("talkingTimeEntries").find({
      $or: [{ month }, { date: { $gte: monthStart, $lte: lastDay } }],
    }).toArray(),
    database.collection("qualityEvaluations").find({ month }).toArray(),
  ]);

  const callsByEmployee = new Map();
  for (const entry of callsEntries) {
    const key = entry.employeeId.toString();
    const entryDate = String(entry.date || "");
    if (!entryDate.startsWith(month)) continue;
    if (!callsByEmployee.has(key)) callsByEmployee.set(key, {});
    callsByEmployee.get(key)[entryDate] = { calls: Number(entry.calls || 0), missedCalls: Number(entry.missedCalls || 0), status: entry.status };
  }

  const talkingTimeByEmployee = new Map();
  for (const entry of talkingTimeEntries) {
    const key = entry.employeeId.toString();
    const entryDate = String(entry.date || "");
    if (!entryDate.startsWith(month)) continue;
    if (!talkingTimeByEmployee.has(key)) talkingTimeByEmployee.set(key, {});
    talkingTimeByEmployee.get(key)[entryDate] = { seconds: talkingSeconds(entry) };
  }

  const qualityByEmployee = new Map();
  for (const evaluation of qualityEvaluations) {
    qualityByEmployee.set(evaluation.employeeId.toString(), evaluation);
  }

  const employeeData = [];
  const customKpiNames = new Set();
  for (const employee of employees) {
    const employeeId = employee._id.toString();
    const employeeType = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "senior" : "agent";
    const teamKpis = employee.team.kpis?.[employeeType] || {};
    const salesSettings = employeeSalesSettings(employee, employee.team);
    const teamPerformance = salesSettings.zones;
    const salesEnabled = salesSettings.enabled;

    const employeeCalls = callsByEmployee.get(employeeId) || {};
    const dailyCalls = employeeCalls[selectedDate]?.calls || 0;
    const dailyMissedCalls = employeeCalls[selectedDate]?.missedCalls || 0;
    const monthlyCalls = Object.values(employeeCalls).reduce((sum, entry) => sum + (entry.calls || 0), 0);
    const monthlyMissedCalls = Object.values(employeeCalls).reduce((sum, entry) => sum + (entry.missedCalls || 0), 0);
    const employeeTalkingTime = talkingTimeByEmployee.get(employeeId) || {};
    const dailyTalkingTime = employeeTalkingTime[selectedDate]?.seconds || 0;
    const monthlyTalkingTime = Object.values(employeeTalkingTime).reduce((sum, entry) => sum + (entry.seconds || 0), 0);
    const quality = qualityByEmployee.get(employeeId) || {};
    const qualityScore = quality.qualityScore || 0;
    const evaluatedCalls = quality.evaluatedCalls || 0;
    const sales = quality.sales || 0;

    const talkingTimeTargetHours = employeeTalkingTimeTarget(employee, teamKpis);
    const talkingTimeWeight = teamKpis.talkingTimeHours?.enabled ? Number(teamKpis.talkingTimeHours.weight || 0) : 0;
    const talkingTimeTargetSeconds = talkingTimeTargetHours * 3600;
    const talkingTimeAchievement = talkingTimeTargetSeconds > 0
      ? Math.min((monthlyTalkingTime / talkingTimeTargetSeconds) * 100, 100)
      : 0;
    const talkingTimeWeightedPercent = talkingTimeTargetSeconds > 0 && talkingTimeWeight > 0
      ? Math.min((monthlyTalkingTime / talkingTimeTargetSeconds) * talkingTimeWeight, talkingTimeWeight)
      : 0;
    const talkingTimePercent = talkingTimeWeightedPercent;

    const callsTarget = teamKpis.dailyCalls?.enabled ? Number(teamKpis.dailyCalls.target || 0) : 0;
    const callsWeight = teamKpis.dailyCalls?.enabled ? Number(teamKpis.dailyCalls.weight || 0) : 0;
    const callDayEntries = Object.values(employeeCalls);
    const callWorkDays = callDayEntries.filter((entry) => Number(entry.calls) > 0).length;
    const callTargetDays = callsTarget > 0
      ? callDayEntries.filter((entry) => Number(entry.calls) > 0 && Number(entry.calls) >= callsTarget).length
      : 0;
    const callsAchievement = callWorkDays > 0 ? (callTargetDays / callWorkDays) * 100 : 0;
    const callsWeightedPercent = callsWeight > 0 && callWorkDays > 0
      ? callsWeight * (callTargetDays / callWorkDays)
      : 0;
    const callsPercent = callsWeightedPercent;

    const evaluatedCallsTarget = teamKpis.evaluatedCalls?.enabled ? Number(teamKpis.evaluatedCalls.target || 0) : 0;
    const evaluatedCallsWeight = teamKpis.evaluatedCalls?.enabled ? Number(teamKpis.evaluatedCalls.weight || 0) : 0;
    const qualityWeightedPercent = evaluatedCallsWeight > 0 ? (qualityScore / 100) * evaluatedCallsWeight : 0;
    const customKpis = Array.isArray(teamKpis.custom) && teamKpis.custom.length
      ? teamKpis.custom
      : (Array.isArray(teamKpis.customKPIs) ? teamKpis.customKPIs : []);
    const customKpiResults = [];
    let customKpiWeightedTotal = 0;

    for (const customKpi of customKpis) {
      if (customKpi.enabled === false) continue;
      const customName = String(customKpi.name || "").trim();
      if (!customName) continue;
      const customTarget = monthlyCustomKpiTarget(employee, customName, month);
      const customWeight = Number(customKpi.weight || 0);
      const customActual = monthlyCustomKpiActual(employee, customName, month);
      const customPercent = customTarget > 0 ? Math.min((customActual / customTarget) * 100, 100) : 0;
      const customWeightedPercent = customWeight > 0 ? (customPercent / 100) * customWeight : 0;
      customKpiResults.push({
        name: customName,
        actual: customActual,
        target: customTarget,
        weight: customWeight,
        percent: customPercent,
        weightedPercent: customWeightedPercent,
      });
      customKpiNames.add(customName);
      customKpiWeightedTotal += customWeightedPercent;
    }

    const totalKpi = talkingTimeWeightedPercent + callsWeightedPercent + qualityWeightedPercent + customKpiWeightedTotal;
    let salesZone = "Red";
    if (salesEnabled && sales) {
      const zones = teamPerformance;
      if (zones.green?.from && sales >= Number(zones.green.from)) {
        salesZone = "Green";
      } else if (zones.yellow?.from && zones.yellow?.to && sales >= Number(zones.yellow.from) && sales <= Number(zones.yellow.to)) {
        salesZone = "Yellow";
      } else if (zones.red?.from && zones.red?.to && sales >= Number(zones.red.from) && sales <= Number(zones.red.to)) {
        salesZone = "Red";
      }
    } else if (!salesEnabled) {
      salesZone = "Yellow";
    }

    let finalKpi = totalKpi;
    if (salesZone === "Green") {
      finalKpi = teamPerformance.greenZoneOverride ? totalKpi : 100;
    } else if (salesZone === "Red") {
      finalKpi = teamPerformance.redZoneOverride ? totalKpi : 0;
    }
    const manualKpi = monthlyManualKpi(employee, month);
    if (manualKpi > 0) finalKpi = manualKpi;

    employeeData.push({
      id: employeeId,
      teamId: employee.teamId?.toString?.() || employee.team?._id?.toString?.() || "",
      employeeType: employee.employeeType || "Agent",
      fullName: employee.fullName,
      code3cx: employee.code3cx || "",
      awfarCode: employee.awfarCode || "",
      email: employee.email || "",
      teamName: employee.team.teamName,
      teamLeaderEmail: employee.team.teamLeader?.email || "",
      teamLeaderName: employee.team.teamLeader?.name || "",
      hireDate: employee.hireDate,
      sales,
      salesZone,
      salesZones: teamPerformance,
      dailyCalls,
      dailyMissedCalls,
      dailyTalkingTime,
      monthlyTalkingTime,
      monthlyCalls,
      monthlyMissedCalls,
      talkingTimePercent,
      talkingTimeWeight,
      talkingTimeAchievement,
      talkingTimeTarget: talkingTimeTargetHours,
      callsPercent,
      callsWeight,
      callsAchievement,
      callsTarget,
      qualityPercent: qualityWeightedPercent,
      qualityWeight: evaluatedCallsWeight,
      qualityScore,
      evaluatedCalls,
      evaluatedCallsTarget,
      customKpis: customKpiResults,
      manualKpi,
      totalKpi: finalKpi,
    });
  }

  const teamsSeen = new Set();
  for (const employee of employees) {
    const teamId = employee.team?._id?.toString?.();
    if (!teamId || teamsSeen.has(teamId)) continue;
    teamsSeen.add(teamId);
    for (const level of ["agent", "senior"]) {
      for (const kpi of employee.team?.kpis?.[level]?.custom || employee.team?.kpis?.[level]?.customKPIs || []) {
        if (kpi.enabled === false) continue;
        const name = String(kpi.name || "").trim();
        if (name) customKpiNames.add(name);
      }
    }
  }

  return {
    ok: true,
    employees: employeeData,
    customKpiColumns: [...customKpiNames].sort((a, b) => a.localeCompare(b)),
    month,
    date: selectedDate,
    daysInMonth: Number(lastDay.slice(-2)),
  };
}

async function fetchDashboardSummary({
  uri = process.env.MONGODB_URI,
  dbName = process.env.MONGODB_DB || "qa_sys",
  month,
  date,
} = {}) {
  if (!uri) {
    throw new Error("Set MONGODB_URI or pass a MongoDB connection URI.");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();

  try {
    const database = client.db(dbName);
    return await getDashboardSummary(database, { month, date });
  } finally {
    await client.close();
  }
}

module.exports = { fetchDashboardSummary, getDashboardSummary };
