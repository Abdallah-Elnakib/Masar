const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
const { autoUpdater } = require("electron-updater");
const { getDashboardSummary } = require("./dashboard-summary.cjs");
const {
  CAMPAIGNS: awfarKanbanCampaigns,
  STATUSES: awfarKanbanStatuses,
  decryptCredentials: decryptAwfarKanbanCredentials,
  encryptCredentials: encryptAwfarKanbanCredentials,
  fetchKanbanCounts,
} = require("./awfar-kanban.cjs");

let envLoaded = false;

function clearExampleSmtpSettings() {
  if (String(process.env.SMTP_HOST || "").trim().toLowerCase() !== "smtp.example.com") return;
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    delete process.env[key];
  }
}

async function loadEnvFile() {
  const userDataEnvPath = path.join(app.getPath("userData"), ".env");
  const projectEnvPath = path.join(process.cwd(), ".env");
  const exampleEnvPath = path.join(app.isPackaged ? app.getAppPath() : process.cwd(), ".env.example");

  // Try to load from userData first (for installed app)
  try {
    await fs.access(userDataEnvPath);
    dotenv.config({ path: userDataEnvPath });
    clearExampleSmtpSettings();
    envLoaded = true;
    return;
  } catch {
    // userData .env doesn't exist
  }

  // Try to load from project directory (for development)
  try {
    await fs.access(projectEnvPath);
    dotenv.config({ path: projectEnvPath });
    clearExampleSmtpSettings();
    envLoaded = true;
    return;
  } catch {
    // project .env doesn't exist
  }

  // If neither exists, create a default .env in userData
  try {
    await fs.access(exampleEnvPath);
    const exampleContent = await fs.readFile(exampleEnvPath, "utf-8");
    await fs.writeFile(userDataEnvPath, exampleContent);
    dotenv.config({ path: userDataEnvPath });
    clearExampleSmtpSettings();
  } catch {
    // .env.example doesn't exist, create minimal .env
    const defaultContent = "MONGODB_URI=\nMONGODB_DB=qa_sys\n";
    await fs.writeFile(userDataEnvPath, defaultContent);
    dotenv.config({ path: userDataEnvPath });
    clearExampleSmtpSettings();
  }
  envLoaded = true;
}

// Load env file when app is ready
app.whenReady().then(() => {
  loadEnvFile();
});

let mongoClient;
let mainWindow;
const activeSettingsSessions = new Map();
const accountPages = ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"];
const roleAccountDefaults = {
  Admin: { pages: accountPages, canEditSales: true, canEvaluate: true, canEditTalkingTime: true, canEditCalls: true, canManageEmployees: true, canManageTeams: true, canManageQualityForms: true, canImportTalkingTime: true, canImportSales: true, canSendEmails: true },
  Quality: { pages: ["Dashboard", "Alerts", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"], canEditSales: true, canEvaluate: true, canEditTalkingTime: false, canEditCalls: false, canManageEmployees: false, canManageTeams: false, canManageQualityForms: false, canImportTalkingTime: false, canImportSales: false, canSendEmails: true },
  "Team Leader": { pages: ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"], canEditSales: false, canEvaluate: false, canEditTalkingTime: true, canEditCalls: true, canManageEmployees: true, canManageTeams: true, canManageQualityForms: false, canImportTalkingTime: false, canImportSales: false, canSendEmails: false },
  Manager: { pages: ["Dashboard", "Teams", "Employees", "Alerts", "Talking Time", "Calls Tracking", "Quality Evaluation", "Awfar Kanban", "Coaching", "Performance", "Custom KPI", "Settings"], canEditSales: false, canEvaluate: false, canEditTalkingTime: false, canEditCalls: false, canManageEmployees: false, canManageTeams: false, canManageQualityForms: false, canImportTalkingTime: false, canImportSales: false, canSendEmails: false },
};

function normalizeAccountPermissions(value, role) {
  const defaults = roleAccountDefaults[role] || roleAccountDefaults.Quality;
  const pages = Array.isArray(value?.pages)
    ? [...new Set(value.pages.filter((page) => accountPages.includes(page)))]
    : [...defaults.pages];
  return {
    pages,
    canEditSales: typeof value?.canEditSales === "boolean" ? value.canEditSales : defaults.canEditSales,
    canEvaluate: typeof value?.canEvaluate === "boolean" ? value.canEvaluate : defaults.canEvaluate,
    canEditTalkingTime: typeof value?.canEditTalkingTime === "boolean" ? value.canEditTalkingTime : defaults.canEditTalkingTime,
    canEditCalls: typeof value?.canEditCalls === "boolean" ? value.canEditCalls : defaults.canEditCalls,
    canManageEmployees: typeof value?.canManageEmployees === "boolean" ? value.canManageEmployees : defaults.canManageEmployees,
    canManageTeams: typeof value?.canManageTeams === "boolean" ? value.canManageTeams : defaults.canManageTeams,
    canManageQualityForms: typeof value?.canManageQualityForms === "boolean" ? value.canManageQualityForms : defaults.canManageQualityForms,
    canImportTalkingTime: typeof value?.canImportTalkingTime === "boolean" ? value.canImportTalkingTime : defaults.canImportTalkingTime,
    canImportSales: typeof value?.canImportSales === "boolean" ? value.canImportSales : defaults.canImportSales,
    canSendEmails: typeof value?.canSendEmails === "boolean" ? value.canSendEmails : defaults.canSendEmails,
  };
}

app.setAppUserModelId("com.orientgroup.qasys");
app.setName("Northstar Quality Operations");

async function getDatabase() {
  const defaultUri = "mongodb://orientgrouptours_db_user:5PSIHIIUK3bUO6p5@ac-tu365zq-shard-00-00.is6kwct.mongodb.net:27017,ac-tu365zq-shard-00-01.is6kwct.mongodb.net:27017,ac-tu365zq-shard-00-02.is6kwct.mongodb.net:27017/?tls=true\u0026authSource=admin\u0026replicaSet=atlas-gd7en3-shard-0\u0026appName=Cluster0";
  // Ensure env is loaded before accessing database
  if (!envLoaded) {
    await loadEnvFile();
  }

  const uri = String(process.env.MONGODB_URI || defaultUri).trim();
  const dbName = String(process.env.MONGODB_DB || "qa_sys").trim();

  if (!mongoClient) {
    mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await mongoClient.connect();
  }

  return mongoClient.db(dbName);
}

function getRememberedCredentialsPath() {
  return path.join(app.getPath("userData"), "remembered-login.enc");
}

function get3cxApiConfigPath() {
  return path.join(app.getPath("userData"), "3cx-api-config.enc");
}

function getAfwarApiConfigPath() {
  return path.join(app.getPath("userData"), "afwar-api-config.enc");
}

function hasSecureStorage() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (typeof safeStorage.getSelectedStorageBackend !== "function") return process.platform !== "linux";
  return safeStorage.getSelectedStorageBackend() !== "basic_text";
}

class TeamValidationError extends Error {}
class EmployeeValidationError extends Error {}

function parseDateOnly(value, label) {
  const dateText = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new EmployeeValidationError(`Enter a valid ${label}.`);
  }
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
    throw new EmployeeValidationError(`Enter a valid ${label}.`);
  }
  return date;
}

function normalizeEmployeeTargets(input = {}) {
  const salesMode = input.salesMode === "custom" ? "custom" : "team";
  const talkingTimeMode = input.talkingTimeMode === "custom" ? "custom" : "team";
  const readValue = (value, label, required = false) => {
    if (value === "" || value == null) {
      if (required) throw new EmployeeValidationError(`Enter ${label}.`);
      return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new EmployeeValidationError(`${label} must be a valid non-negative number.`);
    }
    return number;
  };
  const sales = {
    red: {
      from: readValue(input.sales?.red?.from, "the custom red-zone minimum", salesMode === "custom"),
      to: readValue(input.sales?.red?.to, "the custom red-zone maximum", salesMode === "custom"),
    },
    yellow: {
      from: readValue(input.sales?.yellow?.from, "the custom yellow-zone minimum", salesMode === "custom"),
      to: readValue(input.sales?.yellow?.to, "the custom yellow-zone maximum", salesMode === "custom"),
    },
    green: {
      from: readValue(input.sales?.green?.from, "the custom green-zone minimum", salesMode === "custom"),
    },
    redZoneOverride: Boolean(input.sales?.redZoneOverride),
    greenZoneOverride: Boolean(input.sales?.greenZoneOverride),
  };
  if (salesMode === "custom") {
    if (sales.red.from > sales.red.to || sales.yellow.from > sales.yellow.to
      || sales.red.to >= sales.yellow.from || sales.yellow.to >= sales.green.from) {
      throw new EmployeeValidationError("Custom sales zones must be ordered Red, Yellow, then Green without overlap.");
    }
  }
  const talkingTimeHours = readValue(input.talkingTimeHours, "the custom talking-time target", talkingTimeMode === "custom");
  if (talkingTimeMode === "custom" && talkingTimeHours === 0) {
    throw new EmployeeValidationError("The custom talking-time target must be greater than zero.");
  }
  return { salesMode, sales, talkingTimeMode, talkingTimeHours };
}

function normalizeEmployeeInput(input = {}) {
  const fullName = String(input.fullName || "").trim().replace(/\s+/g, " ");
  if (fullName.split(" ").filter(Boolean).length < 2) {
    throw new EmployeeValidationError("Enter at least the employee's first and family names.");
  }

  const employeeType = String(input.employeeType || "");
  if (!["Agent", "Senior"].includes(employeeType)) {
    throw new EmployeeValidationError("Choose Agent or Senior as the employee type.");
  }

  const hireDate = parseDateOnly(input.hireDate, "hire date");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (hireDate > today) throw new EmployeeValidationError("Hire date cannot be in the future.");

  const teamIdText = String(input.teamId || "");
  if (!ObjectId.isValid(teamIdText)) throw new EmployeeValidationError("Choose an assigned team.");

  const optionalFields = {
    code3cx: Boolean(input.optionalFields?.code3cx),
    awfarCode: Boolean(input.optionalFields?.awfarCode),
    awfarUser: Boolean(input.optionalFields?.awfarUser),
    email: Boolean(input.optionalFields?.email),
  };
  const code3cx = String(input.code3cx || "").trim();
  const awfarCode = String(input.awfarCode || "").trim();
  const awfarUser = String(input.awfarUser || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (awfarUser.length > 120) throw new EmployeeValidationError("Awfar User cannot exceed 120 characters.");

  for (const [key, value, label] of [
    ["code3cx", code3cx, "3CX code"],
    ["awfarCode", awfarCode, "Awfar code"],
    ["awfarUser", awfarUser, "Awfar User"],
    ["email", email, "email"],
  ]) {
    if (!value && !optionalFields[key]) throw new EmployeeValidationError(`${label} is required or mark it as not required.`);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EmployeeValidationError("Enter a valid employee email.");
  }

  return {
    fullName,
    fullNameLower: fullName.toLocaleLowerCase(),
    code3cx: code3cx || null,
    awfarCode: awfarCode || null,
    awfarUser: awfarUser || null,
    email: email || null,
    optionalFields,
    employeeType,
    performanceTargets: normalizeEmployeeTargets(input.performanceTargets || {}),
    hireDate,
    teamId: new ObjectId(teamIdText),
    ...(code3cx ? { code3cxLower: code3cx.toLocaleLowerCase() } : {}),
    ...(awfarCode ? { awfarCodeLower: awfarCode.toLocaleLowerCase() } : {}),
    ...(email ? { emailLower: email } : {}),
  };
}

async function ensureEmployeeIndexes(employees) {
  const indexes = await employees.listIndexes().toArray();
  const legacyIndexNames = ["employee_code3cx_unique", "employee_awfar_code_unique", "employee_email_unique"];
  await Promise.all(indexes.filter((index) => legacyIndexNames.includes(index.name)).map(async (index) => {
    try {
      await employees.dropIndex(index.name);
    } catch (error) {
      if (error.code !== 27) throw error;
    }
  }));

  await Promise.all([
    employees.createIndex({ fullNameLower: 1 }, { unique: true, name: "employee_full_name_active_unique", partialFilterExpression: { employmentStatus: "Active", fullNameLower: { $exists: true } } }),
    employees.createIndex({ code3cxLower: 1 }, { unique: true, name: "employee_code3cx_active_unique", partialFilterExpression: { employmentStatus: "Active", code3cxLower: { $exists: true } } }),
    employees.createIndex({ awfarCodeLower: 1 }, { unique: true, name: "employee_awfar_code_active_unique", partialFilterExpression: { employmentStatus: "Active", awfarCodeLower: { $exists: true } } }),
    employees.createIndex({ emailLower: 1 }, { unique: true, name: "employee_email_active_unique", partialFilterExpression: { employmentStatus: "Active", emailLower: { $exists: true } } }),
    employees.createIndex({ teamId: 1, employmentStatus: 1 }, { name: "employee_team_status" }),
  ]);
}

function toEmployeeResponse(employee) {
  return {
    id: employee._id.toString(),
    fullName: employee.fullName,
    code3cx: employee.code3cx || "",
    awfarCode: employee.awfarCode || "",
    awfarUser: employee.awfarUser || "",
    email: employee.email || "",
    optionalFields: employee.optionalFields || { code3cx: false, awfarCode: false, awfarUser: !employee.awfarUser, email: false },
    employeeType: employee.employeeType,
    performanceTargets: employee.performanceTargets || {
      salesMode: "team",
      sales: {},
      talkingTimeMode: "team",
      talkingTimeHours: null,
    },
    teamId: employee.teamId?.toString() || "",
    teamName: employee.team?.teamName || "Unassigned",
    hireDate: employee.hireDate,
    employmentStatus: employee.employmentStatus || "Active",
    resignDate: employee.resignDate || null,
    returnDate: employee.returnDate || null,
    employmentHistory: employee.employmentHistory || [],
    customKpiAchievements: employee.customKpiAchievements || {},
    customKpiAchievementsByMonth: employee.customKpiAchievementsByMonth || {},
    customKpiTargetsByMonth: employee.customKpiTargetsByMonth || {},
    manualKpi: employee.manualKpi || 0,
    manualKpiByMonth: employee.manualKpiByMonth || {},
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

function normalizeMetric(metric = {}, label, requireName = false) {
  const enabled = metric.enabled !== false;
  const name = requireName ? String(metric.name || "").trim() : undefined;
  const targetValue = metric.target === "" || metric.target == null ? null : Number(metric.target);
  const weightValue = metric.weight === "" || metric.weight == null ? null : Number(metric.weight);

  if (requireName && !name) throw new TeamValidationError(`Enter a name for ${label}.`);
  if (targetValue !== null && (!Number.isFinite(targetValue) || targetValue < 0)) {
    throw new TeamValidationError(`${label} target must be a valid non-negative number.`);
  }
  if (weightValue !== null && (!Number.isFinite(weightValue) || weightValue < 0 || weightValue > 100)) {
    throw new TeamValidationError(`${label} weight must be between 0 and 100%.`);
  }
  if (enabled && (!weightValue || (!requireName && !targetValue))) {
    throw new TeamValidationError(requireName
      ? `Enter a weight for ${label}, or turn it off.`
      : `Enter a target and weight for ${label}, or turn it off.`);
  }

  return { ...(requireName ? { id: String(metric.id || randomUUID()), name } : {}), enabled, ...(requireName ? {} : { target: targetValue }), weight: weightValue };
}

function normalizeKpiGroup(group = {}, label) {
  const evaluatedCalls = normalizeMetric(group.evaluatedCalls, `${label} evaluated calls`);
  const talkingTimeHours = normalizeMetric(group.talkingTimeHours, `${label} talking time`);
  const dailyCalls = normalizeMetric(group.dailyCalls, `${label} daily calls`);
  const custom = (Array.isArray(group.custom) ? group.custom : []).map((metric, index) =>
    normalizeMetric(metric, `${label} additional KPI ${index + 1}`, true));
  const totalWeight = [evaluatedCalls, talkingTimeHours, dailyCalls, ...custom]
    .reduce((total, metric) => total + (metric.enabled ? metric.weight || 0 : 0), 0);

  if (totalWeight > 100) {
    throw new TeamValidationError(`${label} KPI weights total ${totalWeight}%. The total cannot exceed 100%.`);
  }

  return { evaluatedCalls, talkingTimeHours, dailyCalls, custom };
}

function normalizeSalesProfile(profile = {}, label, enabled) {
  const read = (value) => value === "" || value == null ? null : Number(value);
  const ranges = {
    red: { from: read(profile.red?.from), to: read(profile.red?.to) },
    yellow: { from: read(profile.yellow?.from), to: read(profile.yellow?.to) },
    green: { from: read(profile.green?.from) },
  };

  for (const [zone, values] of Object.entries(ranges)) {
    for (const [bound, value] of Object.entries(values)) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new TeamValidationError(`${label} ${zone} zone ${bound} must be a valid non-negative number.`);
      }
    }
  }

  if (enabled) {
    const { red, yellow, green } = ranges;
    if (red.from === null || red.to === null || yellow.from === null || yellow.to === null || green.from === null) {
      throw new TeamValidationError(`Complete all Red, Yellow, and Green sales ranges for ${label}.`);
    }
    if (red.from > red.to || yellow.from > yellow.to || red.to >= yellow.from || yellow.to >= green.from) {
      throw new TeamValidationError(`${label} sales zones must be ordered Red, Yellow, then Green without overlap.`);
    }
  }

  return {
    ...ranges,
    greenZoneOverride: Boolean(profile.greenZoneOverride),
    redZoneOverride: Boolean(profile.redZoneOverride),
  };
}

function normalizeTeamInput(input = {}) {
  const teamName = String(input.teamName || "").trim();
  const leaderName = String(input.teamLeader?.name || "").trim();
  const leaderEmail = String(input.teamLeader?.email || "").trim().toLowerCase();

  if (!teamName) throw new TeamValidationError("Enter a team name.");
  if (!leaderName) throw new TeamValidationError("Enter the team leader's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leaderEmail)) {
    throw new TeamValidationError("Enter a valid team leader email.");
  }

  const performanceEnabled = Boolean(input.performance?.enabled);
  return {
    teamName,
    teamNameLower: teamName.toLocaleLowerCase(),
    teamLeader: { name: leaderName, email: leaderEmail },
    qualityOwnerId: input.qualityOwnerId ? String(input.qualityOwnerId) : null,
    kpis: {
      agent: normalizeKpiGroup(input.kpis?.agent, "Agent"),
      senior: normalizeKpiGroup(input.kpis?.senior, "Senior"),
    },
    performance: {
      enabled: performanceEnabled,
      agent: normalizeSalesProfile(input.performance?.agent, "Agent", performanceEnabled),
      senior: normalizeSalesProfile(input.performance?.senior, "Senior", performanceEnabled),
    },
  };
}

async function getTeamEmployeesCount(employees, id) {
  return employees.countDocuments({
    $or: [
      { teamId: id },
      { teamId: id.toString() },
    ],
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: "#f5f6f2",
    icon: path.join(__dirname, "..", "quality-assurance.ico"),
    title: "Northstar | Quality Operations",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    console.log("Desktop window closed.");
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Desktop renderer loaded.");
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, failedUrl, isMainFrame) => {
    if (isMainFrame) {
      console.error(`Desktop renderer failed to load (${errorCode}): ${errorDescription} ${failedUrl}`);
    }
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Desktop renderer exited: ${details.reason} (${details.exitCode}).`);
  });
}

ipcMain.handle("auth:login", async (event, credentials) => {
  const identifier = String(credentials?.identifier || "").trim().toLowerCase();
  const password = String(credentials?.password || "");

  if (!identifier || !password) {
    return { ok: false, message: "Enter your username and password." };
  }

  try {
    const database = await getDatabase();
    const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const user = await database.collection("users").findOne({
      $or: [
        { usernameLower: identifier },
        { username: { $regex: `^${escapedIdentifier}$`, $options: "i" } },
        { email: identifier },
      ],
      isActive: { $ne: false },
    });

    if (!user || typeof user.passwordHash !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
      return { ok: false, message: "The username or password is incorrect." };
    }

    const allowedRoles = ["Admin", "Quality", "Team Leader", "Manager"];
    if (!allowedRoles.includes(user.role)) {
      return { ok: false, message: "This account does not have an authorized role." };
    }

    const workspaceState = await database.collection("workspaceSettings").findOne({ _id: "workspace" }, { projection: { maintenanceEnabled: 1 } });
    if (user.role !== "Admin" && workspaceState?.maintenanceEnabled) {
      return { ok: false, message: "Workspace access is temporarily paused by an Admin." };
    }

    const now = new Date();
    await database.collection("users").updateOne({ _id: user._id }, {
      $set: { lastSeenAt: now, onlineUntil: new Date(now.getTime() + 60_000) },
    });
    activeSettingsSessions.set(event.sender.id, String(user._id));

    return {
      ok: true,
      user: {
        id: String(user._id),
        name: String(user.name || user.username || user.email),
        username: String(user.username || ""),
        email: String(user.email || ""),
        role: user.role,
        permissions: normalizeAccountPermissions(user.permissions, user.role),
        teamIds: Array.isArray(user.teamIds) ? user.teamIds.map((id) => String(id)) : [],
      },
    };
  } catch (error) {
    console.error("Login failed:", error.message);
    const envPath = path.join(app.getPath("userData"), ".env");
    return {
      ok: false,
      message: process.env.MONGODB_URI
        ? "Could not connect to the workspace database. Check your connection settings."
        : `MongoDB is not configured. Please add MONGODB_URI to: ${envPath}`,
    };
  }
});

async function findSettingsActor(database, event, userId) {
  if (!ObjectId.isValid(String(userId || ""))) return null;
  if (activeSettingsSessions.get(event.sender.id) !== String(userId)) return null;
  return database.collection("users").findOne({
    _id: new ObjectId(String(userId)),
    isActive: { $ne: false },
  });
}

async function read3cxApiConfig() {
  if (!hasSecureStorage()) throw new Error("Secure storage is unavailable on this device.");
  try {
    const encrypted = await fs.readFile(get3cxApiConfigPath());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readAfwarApiConfig() {
  if (!hasSecureStorage()) throw new Error("Secure storage is unavailable on this device.");
  try {
    const encrypted = await fs.readFile(getAfwarApiConfigPath());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function parse3cxDuration(value) {
  if (!value) return 0;
  const match = String(value).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) throw new EmployeeValidationError("3CX returned an invalid talking-time duration.");
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function localDateText(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthDatesForImport(month, todayText) {
  const todayMonth = todayText.slice(0, 7);
  if (month > todayMonth) throw new EmployeeValidationError("Choose the current or a previous month.");
  const firstDate = new Date(`${month}-01T00:00:00.000Z`);
  const lastDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  const endText = month === todayMonth
    ? new Date(new Date(`${todayText}T00:00:00.000Z`).getTime() - 86400000).toISOString().slice(0, 10)
    : lastDate.toISOString().slice(0, 10);
  if (endText < `${month}-01`) return [];
  const dates = [];
  for (let date = firstDate; date.toISOString().slice(0, 10) <= endText; date = new Date(date.getTime() + 86400000)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

async function request3cxAccessToken(config) {
  const response = await fetch("https://orient2.3cx.sc/webclient/api/Login/GetAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ReCaptchaResponse: null, SecurityCode: "", Password: config.password, Username: config.username }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  const token = result?.Token?.access_token;
  if (!response.ok || result?.Status !== "AuthSuccess" || !token) {
    throw new Error("3CX authentication failed. Check the saved 3CX username and password.");
  }
  return token;
}

async function request3cxDay(token, groupNumber, date, skip = 0) {
  const periodFrom = encodeURIComponent(`${date}T04:00:00.000Z`);
  const periodTo = encodeURIComponent(`${date}T20:00:00.000Z`);
  const url = `https://orient2.3cx.sc/xapi/v1/ReportExtensionStatisticsByGroup/Pbx.GetExtensionStatisticsByGroupData(groupNumber='${groupNumber}',periodFrom=${periodFrom},periodTo=${periodTo},callArea=0)?%24top=400&%24skip=${skip}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`3CX report request failed for ${date} (HTTP ${response.status}).`);
  const result = await response.json().catch(() => null);
  if (!Array.isArray(result?.value)) throw new Error(`3CX returned an invalid report for ${date}.`);
  return result.value;
}

async function requireAccountPermission(database, event, permission) {
  const actorId = activeSettingsSessions.get(event.sender.id);
  const actor = await findSettingsActor(database, event, actorId);
  if (!actor) return { ok: false, message: "Sign in again before changing workspace data." };
  if (actor.role === "Admin") return { ok: true, actor };
  if (!normalizeAccountPermissions(actor.permissions, actor.role)[permission]) {
    return { ok: false, message: "Your account does not have permission to make this change." };
  }
  return { ok: true, actor };
}

ipcMain.handle("settings:3cx-config-get", async (event, actorId) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, actorId);
    const access = await requireAccountPermission(database, event, "canImportTalkingTime");
    if (!access.ok) return access;
    const config = await read3cxApiConfig();
    return { ok: true, configured: Boolean(config?.username && config?.password), username: config?.username || "", groupNumber: config?.groupNumber || "GRP0000" };
  } catch (error) {
    console.error("Could not load 3CX configuration:", error.name);
    return { ok: false, message: "3CX configuration could not be loaded. Check secure storage availability." };
  }
});

ipcMain.handle("settings:3cx-config-save", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    const access = await requireAccountPermission(database, event, "canImportTalkingTime");
    if (!access.ok) return access;
    if (!hasSecureStorage()) return { ok: false, message: "Secure storage is unavailable on this device; 3CX credentials were not saved." };
    const previous = await read3cxApiConfig();
    const username = String(input.username || "").trim();
    const password = String(input.password || previous?.password || "");
    const groupNumber = String(input.groupNumber || "GRP0000").trim();
    if (!username || !password) return { ok: false, message: "Enter the 3CX login username and password." };
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(groupNumber)) return { ok: false, message: "Enter a valid 3CX group number." };
    const encrypted = safeStorage.encryptString(JSON.stringify({ username, password, groupNumber }));
    await fs.writeFile(get3cxApiConfigPath(), encrypted);
    return { ok: true, configured: true, username, groupNumber };
  } catch (error) {
    console.error("Could not save 3CX configuration:", error.name);
    return { ok: false, message: "3CX credentials could not be saved securely." };
  }
});

ipcMain.handle("settings:afwar-config-get", async (event, actorId) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, actorId);
    const access = await requireAccountPermission(database, event, "canImportTalkingTime");
    if (!access.ok) return access;
    const config = await readAfwarApiConfig();
    return { ok: true, configured: Boolean(config?.extension && config?.password), extension: config?.extension || "" };
  } catch (error) {
    console.error("Could not load Afwar configuration:", error.name);
    return { ok: false, message: "Afwar configuration could not be loaded. Check secure storage availability." };
  }
});

ipcMain.handle("settings:afwar-config-save", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    const access = await requireAccountPermission(database, event, "canImportTalkingTime");
    if (!access.ok) return access;
    if (!hasSecureStorage()) return { ok: false, message: "Secure storage is unavailable on this device; Afwar credentials were not saved." };
    const previous = await readAfwarApiConfig();
    const extension = String(input.extension || "").trim();
    const password = String(input.password || previous?.password || "");
    if (!extension || !password) return { ok: false, message: "Enter the Afwar login extension and password." };
    const encrypted = safeStorage.encryptString(JSON.stringify({ extension, password }));
    await fs.writeFile(getAfwarApiConfigPath(), encrypted);
    return { ok: true, configured: true, extension };
  } catch (error) {
    console.error("Could not save Afwar configuration:", error.name);
    return { ok: false, message: "Afwar credentials could not be saved securely." };
  }
});

ipcMain.handle("settings:3cx-import-talking-time", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canImportTalkingTime");
    if (!access.ok) return access;
    const config = await read3cxApiConfig();
    if (!config?.username || !config?.password) return { ok: false, message: "An Admin must configure 3CX access in Settings first." };

    const todayText = localDateText(new Date());
    let dates;
    if (input.mode === "month") {
      const month = validateEvaluationMonth(input.month);
      dates = monthDatesForImport(month, todayText);
    } else {
      const date = String(input.date || "");
      parseDateOnly(date, "3CX report date");
      if (date > todayText) throw new EmployeeValidationError("Choose today or a previous date.");
      dates = [date];
    }
    if (!dates.length) return { ok: true, processedDays: 0, importedEmployees: 0, unmatchedExtensions: 0, message: "There are no completed dates to import for this month yet." };

    const token = await request3cxAccessToken(config);
    const reports = [];
    for (const date of dates) {
      const rows = [];
      for (let skip = 0; ; skip += 400) {
        const page = await request3cxDay(token, config.groupNumber, date, skip);
        rows.push(...page);
        if (page.length < 400) break;
      }
      reports.push({ date, rows });
    }

    const employeeDocuments = await database.collection("employees").find(
      { employmentStatus: { $ne: "Resigned" }, code3cx: { $exists: true, $nin: [null, ""] } },
      { projection: { _id: 1, teamId: 1, code3cx: 1 } },
    ).toArray();
    const employeeByExtension = new Map(employeeDocuments.map((employee) => [String(employee.code3cx).trim().toLocaleLowerCase(), employee]));
    let unmatchedExtensions = 0;
    let importedEntries = 0;
    const callEntries = database.collection("callsTrackingEntries");
    const talkingEntries = database.collection("talkingTimeEntries");
    await Promise.all([
      callEntries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "calls_tracking_employee_date_unique" }),
      talkingEntries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "talking_time_employee_date_unique" }),
    ]);

    for (const { date, rows } of reports) {
      const totalsByEmployee = new Map();
      for (const row of rows) {
        const extension = String(row.Dn || "").trim().toLocaleLowerCase();
        const employee = employeeByExtension.get(extension);
        if (!employee) {
          if (extension) unmatchedExtensions += 1;
          continue;
        }
        const calls = Math.max(0, Number(row.InboundAnsweredCount) || 0) + Math.max(0, Number(row.OutboundAnsweredCount) || 0);
        const seconds = Math.round(parse3cxDuration(row.InboundAnsweredTalkingDur) + parse3cxDuration(row.OutboundAnsweredTalkingDur));
        if (!totalsByEmployee.has(employee._id.toString())) totalsByEmployee.set(employee._id.toString(), { employee, calls: 0, seconds: 0 });
        const totals = totalsByEmployee.get(employee._id.toString());
        totals.calls += calls;
        totals.seconds += seconds;
      }

      const month = date.slice(0, 7);
      await Promise.all([...totalsByEmployee.values()].map(async ({ employee, calls, seconds }) => {
        const now = new Date();
        const operations = [];
        if (calls > 0) operations.push(callEntries.updateOne(
          { employeeId: employee._id, date },
          { $inc: { calls }, $set: { employeeId: employee._id, teamId: employee.teamId, date, month, status: null, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true },
        ));
        if (seconds > 0) operations.push(talkingEntries.updateOne(
          { employeeId: employee._id, date },
          [{ $set: {
            seconds: { $add: [{ $ifNull: ["$seconds", { $multiply: [{ $ifNull: ["$hours", 0] }, 3600] }] }, seconds] },
            employeeId: employee._id,
            teamId: employee.teamId,
            date,
            month,
            updatedAt: now,
            createdAt: { $ifNull: ["$createdAt", now] },
          } }, { $unset: "hours" }],
          { upsert: true },
        ));
        if (operations.length) {
          await Promise.all(operations);
          importedEntries += 1;
        }
      }));
    }

    return { ok: true, processedDays: dates.length, importedEmployees: importedEntries, unmatchedExtensions };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not import 3CX talking time:", error.name, error.code || "");
    return { ok: false, message: error.message || "3CX data could not be imported. Check the API credentials and connection." };
  }
});

async function requestAfwarAccessToken(config) {
  const response = await fetch("https://awfarcc-orient.com/api-files/auth.php?action=login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extension: config.extension, password: config.password }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  const token = result?.token;
  if (!response.ok || result?.success !== true || !token) {
    throw new Error("Afwar authentication failed. Check the saved extension and password.");
  }
  return token;
}

function parseAfwarAgentCode(agentCode) {
  const code = String(agentCode || "").trim();
  if (code.startsWith("Orient")) {
    const numberPart = code.slice(6);
    if (!numberPart) return null;
    const num = parseInt(numberPart, 10);
    // Convert to 3-digit format: Orient16 → 116, Orient5 → 105
    return num < 100 ? num + 100 : num;
  }
  // If it's already a numeric string, return it as a number
  const numericCode = parseInt(code, 10);
  return !isNaN(numericCode) ? numericCode : null;
}

function secondsToTimeFormat(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

ipcMain.handle("settings:afwar-import-talking-time", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canImportTalkingTime");
    if (!access.ok) return access;
    const config = await readAfwarApiConfig();
    if (!config?.extension || !config?.password) return { ok: false, message: "An Admin must configure Afwar access in Settings first." };

    const todayText = localDateText(new Date());
    let dates;
    if (input.mode === "month") {
      const month = validateEvaluationMonth(input.month);
      dates = monthDatesForImport(month, todayText);
    } else {
      const date = String(input.date || "");
      parseDateOnly(date, "Afwar report date");
      if (date > todayText) throw new EmployeeValidationError("Choose today or a previous date.");
      dates = [date];
    }
    if (!dates.length) return { ok: true, processedDays: 0, importedEmployees: 0, unmatchedAgents: 0, message: "There are no completed dates to import for this month yet." };

    const token = await requestAfwarAccessToken(config);
    const employeeDocuments = await database.collection("employees").find(
      { employmentStatus: { $ne: "Resigned" }, awfarCode: { $exists: true, $nin: [null, ""] } },
      { projection: { _id: 1, teamId: 1, awfarCode: 1 } },
    ).toArray();
    
    // Create multiple lookup maps for different code formats
    const employeeByAwfarCode = new Map();
    for (const employee of employeeDocuments) {
      const code = String(employee.awfarCode).trim();
      // Store by original code
      employeeByAwfarCode.set(code.toLocaleLowerCase(), employee);
      // Store by numeric code if it's in OrientXX format
      const numericCode = parseAfwarAgentCode(code);
      if (numericCode) {
        employeeByAwfarCode.set(String(numericCode).toLocaleLowerCase(), employee);
      }
    }
    let unmatchedAgents = 0;
    let importedEntries = 0;
    const callEntries = database.collection("callsTrackingEntries");
    const talkingEntries = database.collection("talkingTimeEntries");
    await Promise.all([
      callEntries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "calls_tracking_employee_date_unique" }),
      talkingEntries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "talking_time_employee_date_unique" }),
    ]);

    for (const date of dates) {
      const startDate = encodeURIComponent(`${date} 00:00:00`);
      const endDate = encodeURIComponent(`${date} 23:59:59`);
      const url = `https://awfarcc-orient.com/api-files/asternic_reports.php?report=distribution_bundle&stage=primary&start=${startDate}&end=${endDate}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`Afwar report request failed for ${date} (HTTP ${response.status}).`);
      const result = await response.json().catch(() => null);
      
      if (!result) throw new Error(`Afwar returned an invalid report for ${date}.`);
      
      // The actual structure is: result.data.primary.inbound.agent_stats or result.data.primary.outbound.agent_stats
      let agentStats = null;
      if (result.data?.primary?.outbound?.agent_stats && Array.isArray(result.data.primary.outbound.agent_stats)) {
        agentStats = result.data.primary.outbound.agent_stats;
      } else if (result.data?.primary?.inbound?.agent_stats && Array.isArray(result.data.primary.inbound.agent_stats)) {
        agentStats = result.data.primary.inbound.agent_stats;
      } else {
        throw new Error(`Afwar returned an invalid report structure for ${date}. Expected data.primary.outbound.agent_stats or data.primary.inbound.agent_stats array.`);
      }

      // The agent_stats is directly an array of agent objects
      if (!agentStats || !Array.isArray(agentStats)) {
        throw new Error(`Afwar agent_stats data is invalid for ${date}.`);
      }

      const totalsByEmployee = new Map();
      for (const entry of agentStats) {
        const agentCode = parseAfwarAgentCode(entry.agent);
        if (!agentCode) {
          unmatchedAgents += 1;
          continue;
        }
        const employee = employeeByAwfarCode.get(String(agentCode).toLocaleLowerCase());
        if (!employee) {
          unmatchedAgents += 1;
          continue;
        }
        const calls = Math.max(0, Number(entry.answered) || 0);
        const seconds = Math.max(0, Number(entry.total_talk_sec) || 0);
        if (!totalsByEmployee.has(employee._id.toString())) totalsByEmployee.set(employee._id.toString(), { employee, calls: 0, seconds: 0 });
        const totals = totalsByEmployee.get(employee._id.toString());
        totals.calls += calls;
        totals.seconds += seconds;
      }

      const month = date.slice(0, 7);
      await Promise.all([...totalsByEmployee.values()].map(async ({ employee, calls, seconds }) => {
        const now = new Date();
        const operations = [];
        if (calls > 0) operations.push(callEntries.updateOne(
          { employeeId: employee._id, date },
          { $inc: { calls }, $set: { employeeId: employee._id, teamId: employee.teamId, date, month, status: null, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true },
        ));
        if (seconds > 0) operations.push(talkingEntries.updateOne(
          { employeeId: employee._id, date },
          [{ $set: {
            seconds: { $add: [{ $ifNull: ["$seconds", { $multiply: [{ $ifNull: ["$hours", 0] }, 3600] }] }, seconds] },
            employeeId: employee._id,
            teamId: employee.teamId,
            date,
            month,
            updatedAt: now,
            createdAt: { $ifNull: ["$createdAt", now] },
          } }, { $unset: "hours" }],
          { upsert: true },
        ));
        if (operations.length) {
          await Promise.all(operations);
          importedEntries += 1;
        }
      }));
    }

    return { ok: true, processedDays: dates.length, importedEmployees: importedEntries, unmatchedAgents };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not import Afwar talking time:", error.name, error.code || "");
    return { ok: false, message: error.message || "Afwar data could not be imported. Check the API credentials and connection." };
  }
});

ipcMain.handle("settings:awfar-kanban-config-get", async (event) => {
  try {
    const database = await getDatabase();
    const authenticatedId = activeSettingsSessions.get(event.sender.id);
    const actor = await findSettingsActor(database, event, authenticatedId);
    if (!actor) return { ok: false, message: "Sign in again before managing Awfar Kanban credentials." };
    const saved = actor.awfarKanbanCredentials;
    return {
      ok: true,
      configured: Boolean(saved?.username && saved?.passwordEncrypted),
      username: saved?.username || "",
    };
  } catch (error) {
    console.error("Could not load Awfar Kanban credentials:", error.name);
    return { ok: false, message: "Awfar Kanban credentials could not be loaded." };
  }
});

ipcMain.handle("settings:awfar-kanban-config-save", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const authenticatedId = activeSettingsSessions.get(event.sender.id);
    const actor = await findSettingsActor(database, event, authenticatedId);
    if (!actor) return { ok: false, message: "Sign in again before saving Awfar Kanban credentials." };
    const username = String(input.username || "").trim();
    const password = String(input.password || "");
    if (!username || username.length > 120) {
      return { ok: false, message: "Enter a valid Awfar username (up to 120 characters)." };
    }

    const previous = actor.awfarKanbanCredentials;
    let passwordEncrypted = previous?.passwordEncrypted || "";
    if (password) {
      passwordEncrypted = encryptAwfarKanbanCredentials({ username, password });
    } else if (previous?.username !== username || !passwordEncrypted) {
      return { ok: false, message: "Enter the Awfar password to configure or change the username." };
    } else {
      const credentials = decryptAwfarKanbanCredentials(passwordEncrypted);
      passwordEncrypted = encryptAwfarKanbanCredentials(credentials);
    }
    await database.collection("users").updateOne(
      { _id: actor._id, isActive: { $ne: false } },
      {
        $set: {
          awfarKanbanCredentials: {
            username,
            passwordEncrypted,
            updatedAt: new Date(),
          },
        },
      },
    );
    return {
      ok: true,
      configured: true,
      username,
    };
  } catch (error) {
    console.error("Could not save Awfar Kanban credentials:", error.name);
    return { ok: false, message: error.message || "Awfar Kanban credentials could not be saved securely." };
  }
});

ipcMain.handle("awfar-kanban:summary", async (event) => {
  try {
    const database = await getDatabase();
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = await findSettingsActor(database, event, actorId);
    if (!actor) return { ok: false, message: "Sign in again before viewing Awfar Kanban data." };
    const permissions = normalizeAccountPermissions(actor.permissions, actor.role);
    if (actor.role !== "Admin" && !permissions.pages.includes("Awfar Kanban")) {
      return { ok: false, message: "Your account does not have access to Awfar Kanban." };
    }

    const saved = actor.awfarKanbanCredentials;
    if (!saved?.username || !saved?.passwordEncrypted) {
      return { ok: false, message: "Configure your separate Awfar username and password in Settings before loading Kanban data." };
    }
    const credentials = decryptAwfarKanbanCredentials(saved.passwordEncrypted);
    const employeeFilter = { employmentStatus: { $ne: "Resigned" }, awfarUser: { $exists: true, $nin: [null, ""] } };
    if (actor.role === "Quality") {
      const ownedTeams = await database.collection("teams").find(
        { qualityOwnerId: String(actor._id) },
        { projection: { _id: 1 } },
      ).toArray();
      employeeFilter.teamId = { $in: ownedTeams.map((team) => team._id) };
    } else if (actor.role === "Team Leader") {
      const teamIds = (Array.isArray(actor.teamIds) ? actor.teamIds : [])
        .filter((id) => ObjectId.isValid(String(id)))
        .map((id) => new ObjectId(String(id)));
      employeeFilter.teamId = { $in: teamIds };
    }
    const [employees, teams] = await Promise.all([
      database.collection("employees").find(employeeFilter, {
        projection: { fullName: 1, awfarUser: 1, employeeType: 1, teamId: 1 },
      }).sort({ fullNameLower: 1, fullName: 1 }).toArray(),
      database.collection("teams").find({}, { projection: { teamName: 1 } }).toArray(),
    ]);
    const teamNames = new Map(teams.map((team) => [String(team._id), team.teamName || "Unassigned"]));
    const { counts, failedJobs } = await fetchKanbanCounts(credentials);
    const rows = employees.map((employee) => {
      const agentKey = String(employee.awfarUser).trim().toLocaleLowerCase();
      return {
        employeeId: String(employee._id),
        fullName: employee.fullName,
        awfarUser: employee.awfarUser,
        employeeType: employee.employeeType || "",
        teamId: employee.teamId ? String(employee.teamId) : "",
        teamName: employee.teamId ? teamNames.get(String(employee.teamId)) || "Unassigned" : "Unassigned",
        campaigns: awfarKanbanCampaigns.map((campaign) => ({
          name: campaign.name,
          counts: Object.fromEntries(awfarKanbanStatuses.map((status) => [
            status.key,
            counts.get(`${campaign.name}\u0000${status.key}`)?.get(agentKey) || 0,
          ])),
        })),
      };
    });
    return {
      ok: true,
      campaigns: awfarKanbanCampaigns,
      statuses: awfarKanbanStatuses,
      employees: rows,
      failedJobs,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Could not load Awfar Kanban report:", error.message);
    return { ok: false, message: error.message || "Awfar Kanban data could not be loaded." };
  }
});

ipcMain.handle("settings:maintenance-get", async (event, actorId) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, actorId);
    if (actor?.role !== "Admin") return { ok: false, message: "Only an active Admin can manage workspace access." };
    const settings = await database.collection("workspaceSettings").findOne({ _id: "workspace" }, { projection: { maintenanceEnabled: 1, updatedAt: 1 } });
    return { ok: true, enabled: Boolean(settings?.maintenanceEnabled), updatedAt: settings?.updatedAt || null };
  } catch (error) {
    console.error("Could not load workspace access state:", error.message);
    return { ok: false, message: "Workspace access settings could not be loaded." };
  }
});

ipcMain.handle("settings:maintenance-set", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    if (actor?.role !== "Admin") return { ok: false, message: "Only an active Admin can manage workspace access." };
    const enabled = input.enabled === true;
    await database.collection("workspaceSettings").updateOne({ _id: "workspace" }, {
      $set: { maintenanceEnabled: enabled, updatedAt: new Date(), updatedBy: String(actor._id) },
      $setOnInsert: { createdAt: new Date() },
    }, { upsert: true });
    if (enabled) await database.collection("users").updateMany({ role: { $ne: "Admin" } }, { $set: { onlineUntil: new Date(0) } });
    return { ok: true, enabled };
  } catch (error) {
    console.error("Could not change workspace access state:", error.message);
    return { ok: false, message: "Workspace access could not be changed. Check the database connection and try again." };
  }
});

function isValidAccountName(value, maxLength = 120) {
  return Boolean(value && value.length <= maxLength);
}

function accountEmailIsValid(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function teamOwnerFilter(team) {
  return { qualityOwnerId: team.qualityOwnerId || null };
}

async function applyQualityTransfer(database, transfer) {
  const teams = database.collection("teams");
  const qualityOwner = await database.collection("users").findOne({
    _id: new ObjectId(transfer.toQualityId), role: "Quality", isActive: { $ne: false },
  });
  if (!qualityOwner) throw new Error("The receiving Quality account is no longer active.");

  if (transfer.kind === "team") {
    const team = await teams.findOne({ _id: new ObjectId(transfer.sourceTeamId) });
    if (!team || String(team.qualityOwnerId || "") !== transfer.fromQualityId) {
      throw new Error("This team assignment has changed. Refresh and create a new request.");
    }
    const result = await teams.updateOne({ _id: team._id, ...teamOwnerFilter(team) }, {
      $set: {
        qualityOwnerId: transfer.toQualityId,
        qualityOwnerName: String(qualityOwner.name || qualityOwner.username || qualityOwner.email || "Quality"),
        qualityOwnerEmail: String(qualityOwner.email || ""),
        updatedAt: new Date(),
      },
    });
    if (!result.modifiedCount) throw new Error("This team assignment has changed. Refresh and try again.");
    return;
  }

  const targetTeam = await teams.findOne({
    _id: new ObjectId(transfer.targetTeamId),
    qualityOwnerId: transfer.toQualityId,
  }, { projection: { _id: 1 } });
  if (!targetTeam) throw new Error("Choose a team assigned to the receiving Quality account.");
  const employeeUpdate = await database.collection("employees").updateOne({
    _id: new ObjectId(transfer.employeeId),
    teamId: new ObjectId(transfer.sourceTeamId),
    employmentStatus: { $ne: "Resigned" },
  }, { $set: { teamId: targetTeam._id, updatedAt: new Date() } });
  if (!employeeUpdate.modifiedCount) throw new Error("This employee's team has changed or the employee is no longer active.");
}

ipcMain.handle("settings:profile-save", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const account = await findSettingsActor(database, event, input.userId);
    if (!account) return { ok: false, message: "This account is no longer active. Sign in again." };

    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    const username = String(input.username || "").trim();
    const usernameLower = username.toLocaleLowerCase();
    const email = String(input.email || "").trim().toLocaleLowerCase();
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");
    if (!isValidAccountName(name)) return { ok: false, message: "Enter a name of 1 to 120 characters." };
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return { ok: false, message: "Username must be 3 to 40 letters, numbers, dots, underscores, or hyphens." };
    if (!accountEmailIsValid(email) || email.length > 254) return { ok: false, message: "Enter a valid email address." };
    if (newPassword && (!currentPassword || newPassword.length < 8)) return { ok: false, message: "Enter your current password and a new password of at least 8 characters." };
    if (newPassword && !(await bcrypt.compare(currentPassword, account.passwordHash || ""))) return { ok: false, message: "The current password is incorrect." };

    const usernamePattern = new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const duplicateClauses = [{ usernameLower }, { username: usernamePattern }];
    if (email) duplicateClauses.push({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    const duplicate = await database.collection("users").findOne({ _id: { $ne: account._id }, $or: duplicateClauses }, { projection: { _id: 1 } });
    if (duplicate) return { ok: false, message: "That username or email is already in use." };

    const update = { name, username, usernameLower, email, emailLower: email, updatedAt: new Date() };
    if (newPassword) update.passwordHash = await bcrypt.hash(newPassword, 12);
    const saved = await database.collection("users").updateOne({ _id: account._id }, { $set: update });
    if (!saved.matchedCount) return { ok: false, message: "This account no longer exists. Sign in again." };
    await database.collection("teams").updateMany({ qualityOwnerId: String(account._id) }, {
      $set: { qualityOwnerName: name, qualityOwnerEmail: email },
    });
    return { ok: true, user: { id: String(account._id), name, username, email, role: account.role } };
  } catch (error) {
    console.error("Could not update account profile:", error.message);
    return { ok: false, message: "Profile could not be saved. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:accounts-list", async (event, actorId) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, actorId);
    if (actor?.role !== "Admin") return { ok: false, message: "Only an active Admin can manage accounts." };
    const now = new Date();
    const accounts = await database.collection("users").find({}, {
      projection: { name: 1, username: 1, email: 1, role: 1, permissions: 1, isActive: 1, createdAt: 1, lastSeenAt: 1, onlineUntil: 1 },
    }).sort({ role: 1, name: 1, username: 1 }).toArray();
    return { ok: true, accounts: accounts.map((account) => ({
      id: String(account._id), name: String(account.name || account.username || account.email || "User"),
      username: String(account.username || ""), email: String(account.email || ""), role: account.role,
      permissions: normalizeAccountPermissions(account.permissions, account.role),
      teamIds: Array.isArray(account.teamIds) ? account.teamIds.map((id) => String(id)) : [],
      isActive: account.isActive !== false, online: account.isActive !== false && account.onlineUntil instanceof Date && account.onlineUntil > now,
      lastSeenAt: account.lastSeenAt || null, createdAt: account.createdAt || null,
    })) };
  } catch (error) {
    console.error("Could not load accounts:", error.message);
    return { ok: false, message: "Accounts could not be loaded. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:account-save", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    if (actor?.role !== "Admin") return { ok: false, message: "Only an active Admin can manage accounts." };
    const users = database.collection("users");
    const accountId = input.id ? String(input.id) : "";
    if (accountId && !ObjectId.isValid(accountId)) return { ok: false, message: "This account is no longer available." };
    const account = accountId ? await users.findOne({ _id: new ObjectId(accountId) }) : null;
    if (accountId && !account) return { ok: false, message: "This account no longer exists. Refresh and try again." };

    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    const username = String(input.username || "").trim();
    const usernameLower = username.toLocaleLowerCase();
    const email = String(input.email || "").trim().toLocaleLowerCase();
    const role = String(input.role || "");
    const permissions = normalizeAccountPermissions(input.permissions, role);
    const password = String(input.password || "");
    if (!isValidAccountName(name)) return { ok: false, message: "Enter a name of 1 to 120 characters." };
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return { ok: false, message: "Username must be 3 to 40 letters, numbers, dots, underscores, or hyphens." };
    if (!accountEmailIsValid(email) || email.length > 254) return { ok: false, message: "Enter a valid email address." };
    if (!["Admin", "Quality", "Team Leader", "Manager"].includes(role)) return { ok: false, message: "Choose a valid account role." };
    if (role !== "Admin" && !permissions.pages.length) return { ok: false, message: "Choose at least one page for this account." };
    if (!account && password.length < 8) return { ok: false, message: "New accounts need a password of at least 8 characters." };
    if (password && password.length < 8) return { ok: false, message: "Passwords must be at least 8 characters." };
    if (account && account._id.equals(actor._id) && role !== account.role) return { ok: false, message: "Use another Admin account to change your own role." };
    if (account && account.role === "Admin" && role !== "Admin" && account.isActive !== false) {
      const activeAdmins = await users.countDocuments({ role: "Admin", isActive: { $ne: false } });
      if (activeAdmins <= 1) return { ok: false, message: "The last active Admin cannot be changed to another role." };
    }
    if (account && account.role === "Quality" && role !== "Quality"
      && await database.collection("teams").countDocuments({ qualityOwnerId: String(account._id) })) {
      return { ok: false, message: "Reassign this Quality account's teams before changing its role." };
    }

    const usernamePattern = new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const duplicateClauses = [{ usernameLower }, { username: usernamePattern }];
    if (email) duplicateClauses.push({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    const duplicate = await users.findOne({ _id: { $ne: account?._id || new ObjectId() }, $or: duplicateClauses }, { projection: { _id: 1 } });
    if (duplicate) return { ok: false, message: "That username or email is already in use." };

    const now = new Date();
    const fields = { name, username, usernameLower, email, emailLower: email, role, permissions, updatedAt: now };
    if (password) fields.passwordHash = await bcrypt.hash(password, 12);
    
    // Handle teamIds for Team Leader role
    if (role === "Team Leader") {
      const teamIds = Array.isArray(input.teamIds) ? input.teamIds.filter((id) => ObjectId.isValid(String(id))) : [];
      fields.teamIds = teamIds.map((id) => new ObjectId(String(id)));
    } else {
      fields.teamIds = [];
    }
    
    if (account) {
      await users.updateOne({ _id: account._id }, { $set: fields });
      if (account.role === "Quality" && role !== "Quality") await database.collection("transfers").updateMany({ status: "pending", $or: [{ fromQualityId: String(account._id) }, { toQualityId: String(account._id) }] }, { $set: { status: "cancelled", updatedAt: now } });
      if (role === "Quality") await database.collection("teams").updateMany({ qualityOwnerId: String(account._id) }, { $set: { qualityOwnerName: name, qualityOwnerEmail: email } });
      return { ok: true, id: String(account._id) };
    }
    const result = await users.insertOne({ ...fields, isActive: true, createdAt: now });
    return { ok: true, id: String(result.insertedId) };
  } catch (error) {
    if (error.code === 11000) return { ok: false, message: "That username or email is already in use." };
    console.error("Could not save account:", error.message);
    return { ok: false, message: "Account could not be saved. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:account-freeze", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    if (actor?.role !== "Admin") return { ok: false, message: "Only an active Admin can manage accounts." };
    const targetId = String(input.id || "");
    if (!ObjectId.isValid(targetId)) return { ok: false, message: "This account is no longer available." };
    if (targetId === String(actor._id) && input.active === false) return { ok: false, message: "You cannot freeze your own account." };
    const users = database.collection("users");
    const target = await users.findOne({ _id: new ObjectId(targetId) });
    if (!target) return { ok: false, message: "This account no longer exists." };
    if (target.role === "Admin" && target.isActive !== false && input.active === false
      && await users.countDocuments({ role: "Admin", isActive: { $ne: false } }) <= 1) {
      return { ok: false, message: "The last active Admin cannot be frozen." };
    }
    await users.updateOne({ _id: target._id }, { $set: { isActive: input.active !== false, ...(input.active === false ? { onlineUntil: new Date(0) } : {}), updatedAt: new Date() } });
    return { ok: true };
  } catch (error) {
    console.error("Could not update account status:", error.message);
    return { ok: false, message: "Account status could not be changed. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:account-delete", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    if (actor?.role !== "Admin") return { ok: false, message: "Only an active Admin can manage accounts." };
    const targetId = String(input.id || "");
    if (!ObjectId.isValid(targetId)) return { ok: false, message: "This account is no longer available." };
    if (targetId === String(actor._id)) return { ok: false, message: "You cannot delete the account you are using." };
    const users = database.collection("users");
    const target = await users.findOne({ _id: new ObjectId(targetId) });
    if (!target) return { ok: false, message: "This account no longer exists." };
    if (target.role === "Admin" && target.isActive !== false && await users.countDocuments({ role: "Admin", isActive: { $ne: false } }) <= 1) {
      return { ok: false, message: "The last active Admin cannot be deleted." };
    }
    if (target.role === "Quality" && await database.collection("teams").countDocuments({ qualityOwnerId: targetId })) {
      return { ok: false, message: "Reassign this Quality account's teams before deleting it." };
    }
    await database.collection("transfers").updateMany({ status: "pending", $or: [{ fromQualityId: targetId }, { toQualityId: targetId }] }, { $set: { status: "cancelled", updatedAt: new Date() } });
    await users.deleteOne({ _id: target._id });
    return { ok: true };
  } catch (error) {
    console.error("Could not delete account:", error.message);
    return { ok: false, message: "Account could not be deleted. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:heartbeat", async (event, userId) => {
  try {
    if (!ObjectId.isValid(String(userId || ""))) return { ok: false, inactive: true };
    if (activeSettingsSessions.get(event.sender.id) !== String(userId)) return { ok: false, inactive: true };
    const database = await getDatabase();
    const account = await database.collection("users").findOne({ _id: new ObjectId(String(userId)), isActive: { $ne: false } }, { projection: { role: 1, permissions: 1 } });
    if (!account) return { ok: false, inactive: true };
    const workspaceState = account.role === "Admin" ? null : await database.collection("workspaceSettings").findOne({ _id: "workspace" }, { projection: { maintenanceEnabled: 1 } });
    if (workspaceState?.maintenanceEnabled) return { ok: false, maintenance: true };
    const now = new Date();
    const result = await database.collection("users").updateOne({ _id: new ObjectId(String(userId)), isActive: { $ne: false } }, {
      $set: { lastSeenAt: now, onlineUntil: new Date(now.getTime() + 60_000) },
    });
    return result.matchedCount ? { ok: true, permissions: normalizeAccountPermissions(account.permissions, account.role) } : { ok: false, inactive: true };
  } catch {
    return { ok: false, inactive: false };
  }
});

ipcMain.handle("settings:logout", async (event, userId) => {
  try {
    if (activeSettingsSessions.get(event.sender.id) !== String(userId)) return { ok: false };
    activeSettingsSessions.delete(event.sender.id);
    if (ObjectId.isValid(String(userId || ""))) await (await getDatabase()).collection("users").updateOne({ _id: new ObjectId(String(userId)) }, { $set: { onlineUntil: new Date(0), lastSeenAt: new Date() } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("settings:transfer-options", async (event, actorId) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, actorId);
    if (!actor || !["Admin", "Quality"].includes(actor.role)) return { ok: false, message: "Only Admin and Quality accounts can transfer teams or employees." };
    const teamsQuery = actor.role === "Quality" ? { qualityOwnerId: String(actor._id) } : {};
    const [teams, qualityAccounts] = await Promise.all([
      database.collection("teams").find(teamsQuery, { projection: { teamName: 1, qualityOwnerId: 1 } }).sort({ teamName: 1 }).toArray(),
      database.collection("users").find({ role: "Quality", isActive: { $ne: false } }, { projection: { name: 1, username: 1, email: 1 } }).sort({ name: 1 }).toArray(),
    ]);
    const qualityIds = qualityAccounts.flatMap((account) => [String(account._id), account._id]);
    const receivingTeams = qualityIds.length ? await database.collection("teams").find({
      qualityOwnerId: { $in: qualityIds },
    }, { projection: { teamName: 1, qualityOwnerId: 1 } }).sort({ teamName: 1 }).toArray() : [];
    const ids = teams.map((team) => team._id);
    const employeeIds = ids.flatMap((id) => [id, id.toString()]);
    const employees = employeeIds.length ? await database.collection("employees").find({
      teamId: { $in: employeeIds }, employmentStatus: { $ne: "Resigned" },
    }, { projection: { fullName: 1, teamId: 1, employeeType: 1 } }).sort({ fullName: 1 }).toArray() : [];
    return { ok: true,
      teams: teams.map((team) => ({ id: String(team._id), name: team.teamName, qualityOwnerId: String(team.qualityOwnerId || "") })),
      receivingTeams: receivingTeams.map((team) => ({ id: String(team._id), name: team.teamName, qualityOwnerId: String(team.qualityOwnerId || "") })),
      employees: employees.map((employee) => ({ id: String(employee._id), name: employee.fullName, teamId: String(employee.teamId || ""), employeeType: employee.employeeType || "Agent" })),
      qualityAccounts: qualityAccounts.map((account) => ({ id: String(account._id), name: String(account.name || account.username || account.email || "Quality"), email: String(account.email || "") })),
    };
  } catch (error) {
    console.error("Could not load transfer options:", error.message);
    return { ok: false, message: "Transfer options could not be loaded. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:transfers-list", async (event, actorId) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, actorId);
    if (!actor || !["Admin", "Quality"].includes(actor.role)) return { ok: false, message: "Only Admin and Quality accounts can view transfer requests." };
    const query = actor.role === "Admin" ? {} : { $or: [{ fromQualityId: String(actor._id) }, { toQualityId: String(actor._id) }] };
    const requests = await database.collection("transfers").find(query).sort({ createdAt: -1 }).limit(100).toArray();
    const [teams, employees, users] = await Promise.all([
      database.collection("teams").find({}, { projection: { teamName: 1 } }).toArray(),
      database.collection("employees").find({}, { projection: { fullName: 1 } }).toArray(),
      database.collection("users").find({}, { projection: { name: 1, username: 1, email: 1 } }).toArray(),
    ]);
    const teamNames = new Map(teams.map((team) => [String(team._id), team.teamName]));
    const employeeNames = new Map(employees.map((employee) => [String(employee._id), employee.fullName]));
    const userNames = new Map(users.map((user) => [String(user._id), String(user.name || user.username || user.email || "Quality")]));
    return { ok: true, requests: requests.map((request) => ({
      id: String(request._id), kind: request.kind, status: request.status,
      sourceTeamId: request.sourceTeamId, sourceTeamName: teamNames.get(request.sourceTeamId) || "Team",
      targetTeamId: request.targetTeamId || "", targetTeamName: teamNames.get(request.targetTeamId) || "",
      employeeId: request.employeeId || "", employeeName: employeeNames.get(request.employeeId) || "Employee",
      fromQualityId: request.fromQualityId, fromQualityName: userNames.get(request.fromQualityId) || "Quality",
      toQualityId: request.toQualityId, toQualityName: userNames.get(request.toQualityId) || "Quality",
      submittedBy: request.submittedBy, statusNote: request.statusNote || "", createdAt: request.createdAt || null,
    })) };
  } catch (error) {
    console.error("Could not load transfer requests:", error.message);
    return { ok: false, message: "Transfer requests could not be loaded. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:transfer-create", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    if (!actor || !["Admin", "Quality"].includes(actor.role)) return { ok: false, message: "Only Admin and Quality accounts can transfer teams or employees." };
    const kind = String(input.kind || "");
    const sourceTeamId = String(input.sourceTeamId || "");
    const toQualityId = String(input.toQualityId || "");
    if (!["team", "employee"].includes(kind) || !ObjectId.isValid(sourceTeamId) || !ObjectId.isValid(toQualityId)) return { ok: false, message: "Choose a valid source and receiving Quality account." };
    const teams = database.collection("teams");
    const sourceTeam = await teams.findOne({ _id: new ObjectId(sourceTeamId) });
    const receiver = await database.collection("users").findOne({ _id: new ObjectId(toQualityId), role: "Quality", isActive: { $ne: false } });
    if (!sourceTeam || !receiver) return { ok: false, message: "The selected team or receiving Quality account is no longer available." };
    const fromQualityId = String(sourceTeam.qualityOwnerId || "");
    if (actor.role === "Quality" && fromQualityId !== String(actor._id)) return { ok: false, message: "You can only transfer a team or employee assigned to your account." };
    if (fromQualityId === toQualityId) return { ok: false, message: "Choose a different receiving Quality account." };

    const now = new Date();
    const transfer = { kind, sourceTeamId, fromQualityId, toQualityId, submittedBy: String(actor._id), status: "pending", createdAt: now, updatedAt: now };
    if (kind === "employee") {
      const employeeId = String(input.employeeId || "");
      const targetTeamId = String(input.targetTeamId || "");
      if (!ObjectId.isValid(employeeId) || !ObjectId.isValid(targetTeamId)) return { ok: false, message: "Choose an active employee and a receiving team." };
      const [employee, targetTeam] = await Promise.all([
        database.collection("employees").findOne({ _id: new ObjectId(employeeId), teamId: sourceTeam._id, employmentStatus: { $ne: "Resigned" } }, { projection: { _id: 1 } }),
        teams.findOne({ _id: new ObjectId(targetTeamId), qualityOwnerId: toQualityId }, { projection: { _id: 1 } }),
      ]);
      if (!employee || !targetTeam) return { ok: false, message: "Choose an employee in the selected source team and a team owned by the receiving Quality account." };
      transfer.employeeId = employeeId;
      transfer.targetTeamId = targetTeamId;
    }

    if (actor.role === "Admin") {
      await applyQualityTransfer(database, transfer);
      await database.collection("transfers").insertOne({ ...transfer, status: "approved", resolvedBy: String(actor._id), statusNote: "Transferred by Admin", updatedAt: new Date() });
      return { ok: true, immediate: true };
    }
    const pending = await database.collection("transfers").findOne({
      kind, sourceTeamId, toQualityId, status: "pending",
      ...(kind === "employee" ? { employeeId: transfer.employeeId, targetTeamId: transfer.targetTeamId } : {}),
    }, { projection: { _id: 1 } });
    if (pending) return { ok: false, message: "A matching transfer request is already waiting for a response." };
    await database.collection("transfers").insertOne(transfer);
    return { ok: true, immediate: false };
  } catch (error) {
    console.error("Could not create transfer:", error.message);
    return { ok: false, message: error.message || "Transfer could not be completed. Check the database connection and try again." };
  }
});

ipcMain.handle("settings:transfer-respond", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await findSettingsActor(database, event, input.actorId);
    if (!actor || !["Admin", "Quality"].includes(actor.role)) return { ok: false, message: "Only Admin and Quality accounts can respond to transfer requests." };
    const requestId = String(input.requestId || "");
    if (!ObjectId.isValid(requestId)) return { ok: false, message: "This transfer request is no longer available." };
    const requests = database.collection("transfers");
    const request = await requests.findOne({ _id: new ObjectId(requestId), status: "pending" });
    if (!request) return { ok: false, message: "This request has already been handled or is no longer available." };
    if (actor.role !== "Admin" && String(request.toQualityId) !== String(actor._id)) return { ok: false, message: "Only the receiving Quality account can respond to this request." };
    const resolvedStatus = input.approve === true ? "approved" : "rejected";
    const claimed = await requests.updateOne({ _id: request._id, status: "pending" }, { $set: { status: "processing", updatedAt: new Date() } });
    if (!claimed.modifiedCount) return { ok: false, message: "This request has already been handled." };
    try {
      if (resolvedStatus === "approved") await applyQualityTransfer(database, request);
      await requests.updateOne({ _id: request._id, status: "processing" }, {
        $set: { status: resolvedStatus, statusNote: resolvedStatus === "approved" ? "Approved" : "Declined", resolvedBy: String(actor._id), updatedAt: new Date() },
      });
      return { ok: true };
    } catch (error) {
      await requests.updateOne({ _id: request._id, status: "processing" }, { $set: { status: "cancelled", statusNote: error.message, updatedAt: new Date() } });
      return { ok: false, message: error.message };
    }
  } catch (error) {
    console.error("Could not respond to transfer request:", error.message);
    return { ok: false, message: "Transfer request could not be handled. Check the database connection and try again." };
  }
});

ipcMain.handle("database:check", async () => {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    return { ok: true };
  } catch (error) {
    console.error("Database check failed:", error.message);
    return { ok: false, message: "Database connection failed. Check your local settings and network access." };
  }
});

ipcMain.handle("teams:list", async (event) => {
  try {
    const database = await getDatabase();
    const teamsCollection = database.collection("teams");
    const usersCollection = database.collection("users");
    const employeesCollection = database.collection("employees");
    await teamsCollection.createIndex({ teamNameLower: 1 }, { unique: true, name: "teamNameLower_unique" });

    // Get current user for filtering
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await usersCollection.findOne({ _id: new ObjectId(actorId) }) : null;

    let teamFilter = {};
    if (actor) {
      if (actor.role === "Quality") {
        // Quality sees only teams assigned to them
        teamFilter = { qualityOwnerId: String(actor._id) };
      } else if (actor.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
        // Team Leader sees only their assigned teams
        teamFilter = { _id: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
      } else if (actor.role === "Manager") {
        // Manager sees all teams but can't edit
        teamFilter = {};
      }
      // Admin sees all teams
    }

    const [teams, qualityAccounts] = await Promise.all([
      teamsCollection.find(teamFilter).sort({ createdAt: -1 }).toArray(),
      usersCollection.find(
        { role: "Quality", isActive: { $ne: false } },
        { projection: { name: 1, username: 1, email: 1 } },
      ).sort({ name: 1 }).toArray(),
    ]);

    const teamIds = teams.map((team) => team._id);
    const counts = teamIds.length ? await employeesCollection.aggregate([
      { $match: { $or: [{ teamId: { $in: teamIds } }, { teamId: { $in: teamIds.map(String) } }], employmentStatus: { $ne: "Resigned" } } },
      { $group: { _id: { $toString: "$teamId" }, count: { $sum: 1 } } },
    ]).toArray() : [];
    const countByTeam = new Map(counts.map((entry) => [entry._id, entry.count]));

    return {
      ok: true,
      teams: teams.map((team) => {
        const employeeCount = countByTeam.get(team._id.toString()) || 0;
        return {
          id: team._id.toString(),
          teamName: team.teamName,
          teamLeader: team.teamLeader,
          qualityOwnerId: team.qualityOwnerId || null,
          qualityOwnerName: team.qualityOwnerName || null,
          kpis: team.kpis,
          performance: team.performance,
          employeeCount,
          isActive: employeeCount > 0,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        };
      }),
      qualityAccounts: qualityAccounts.map((account) => ({
        id: account._id.toString(),
        name: String(account.name || account.username || account.email || "Quality"),
        email: String(account.email || ""),
      })),
    };
  } catch (error) {
    console.error("Could not load teams:", error.message);
    return { ok: false, message: "Teams could not be loaded. Check the database connection." };
  }
});

// New API to get all teams without filtering (for Admin use in Settings)
ipcMain.handle("teams:listAll", async (event) => {
  try {
    const database = await getDatabase();
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await database.collection("users").findOne({ _id: new ObjectId(actorId) }) : null;
    
    if (!actor || actor.role !== "Admin") {
      return { ok: false, message: "Only Admin can list all teams." };
    }

    const teamsCollection = database.collection("teams");
    const usersCollection = database.collection("users");
    const employeesCollection = database.collection("employees");
    
    const [teams, qualityAccounts] = await Promise.all([
      teamsCollection.find().sort({ createdAt: -1 }).toArray(),
      usersCollection.find(
        { role: "Quality", isActive: { $ne: false } },
        { projection: { name: 1, username: 1, email: 1 } },
      ).sort({ name: 1 }).toArray(),
    ]);

    const teamIds = teams.map((team) => team._id);
    const counts = teamIds.length ? await employeesCollection.aggregate([
      { $match: { $or: [{ teamId: { $in: teamIds } }, { teamId: { $in: teamIds.map(String) } }], employmentStatus: { $ne: "Resigned" } } },
      { $group: { _id: { $toString: "$teamId" }, count: { $sum: 1 } } },
    ]).toArray() : [];
    const countByTeam = new Map(counts.map((entry) => [entry._id, entry.count]));

    return {
      ok: true,
      teams: teams.map((team) => {
        const employeeCount = countByTeam.get(team._id.toString()) || 0;
        return {
          id: team._id.toString(),
          teamName: team.teamName,
          teamLeader: team.teamLeader,
          qualityOwnerId: team.qualityOwnerId || null,
          qualityOwnerName: team.qualityOwnerName || null,
          kpis: team.kpis,
          performance: team.performance,
          employeeCount,
          isActive: employeeCount > 0,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        };
      }),
      qualityAccounts: qualityAccounts.map((account) => ({
        id: account._id.toString(),
        name: String(account.name || account.username || account.email || "Quality"),
        email: String(account.email || ""),
      })),
    };
  } catch (error) {
    console.error("Could not load all teams:", error.message);
    return { ok: false, message: "All teams could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("teams:save", async (event, input) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageTeams");
    if (!access.ok) return access;
    const teamsCollection = database.collection("teams");
    const normalized = normalizeTeamInput(input);
    if (input.id && !ObjectId.isValid(String(input.id))) {
      throw new TeamValidationError("This team is no longer available. Refresh the list and try again.");
    }
    const id = input.id ? new ObjectId(String(input.id)) : null;

    const duplicate = await teamsCollection.findOne({
      teamNameLower: normalized.teamNameLower,
      ...(id ? { _id: { $ne: id } } : {}),
    }, { projection: { _id: 1 } });
    if (duplicate) throw new TeamValidationError("A team with this name already exists.");

    if (normalized.qualityOwnerId) {
      if (!ObjectId.isValid(normalized.qualityOwnerId)) {
        throw new TeamValidationError("Choose a valid Quality account or leave the team unassigned.");
      }
      const qualityOwner = await database.collection("users").findOne({
        _id: new ObjectId(normalized.qualityOwnerId),
        role: "Quality",
        isActive: { $ne: false },
      }, { projection: { name: 1, username: 1, email: 1 } });
      if (!qualityOwner) throw new TeamValidationError("Choose an active Quality account or leave the team unassigned.");
      normalized.qualityOwnerName = String(qualityOwner.name || qualityOwner.username || qualityOwner.email || "Quality");
      normalized.qualityOwnerEmail = String(qualityOwner.email || "");
    } else {
      normalized.qualityOwnerName = null;
      normalized.qualityOwnerEmail = null;
    }

    const now = new Date();
    if (id) {
      const result = await teamsCollection.updateOne(
        { _id: id },
        {
          $set: {
            teamName: normalized.teamName,
            teamNameLower: normalized.teamNameLower,
            teamLeader: normalized.teamLeader,
            qualityOwnerId: normalized.qualityOwnerId,
            qualityOwnerName: normalized.qualityOwnerName,
            qualityOwnerEmail: normalized.qualityOwnerEmail,
            kpis: normalized.kpis,
            performance: normalized.performance,
            updatedAt: now,
          },
        },
      );
      if (!result.matchedCount) throw new TeamValidationError("This team no longer exists. Refresh the list and try again.");
      return { ok: true, id: id.toString() };
    }

    // Auto-copy custom KPIs from existing teams when creating a new team
    const existingTeams = await teamsCollection.find(
      { "kpis.agent.custom.0": { $exists: true } },
      { projection: { kpis: 1 } }
    ).toArray();

    if (existingTeams.length > 0) {
      // Get custom KPIs from the first existing team that has them
      const referenceTeam = existingTeams[0];
      if (referenceTeam.kpis?.agent?.custom?.length > 0) {
        normalized.kpis.agent.custom = referenceTeam.kpis.agent.custom.map((metric) => ({
          id: randomUUID(),
          name: metric.name,
          enabled: metric.enabled,
          weight: metric.weight,
        }));
      }
      if (referenceTeam.kpis?.senior?.custom?.length > 0) {
        normalized.kpis.senior.custom = referenceTeam.kpis.senior.custom.map((metric) => ({
          id: randomUUID(),
          name: metric.name,
          enabled: metric.enabled,
          weight: metric.weight,
        }));
      }
    }

    const result = await teamsCollection.insertOne({ ...normalized, createdAt: now, updatedAt: now });
    return { ok: true, id: result.insertedId.toString() };
  } catch (error) {
    if (error instanceof TeamValidationError) return { ok: false, message: error.message };
    if (error.code === 11000) return { ok: false, message: "A team with this name already exists." };
    console.error("Could not save team:", error.message);
    return { ok: false, message: "Team could not be saved. Check the database connection and try again." };
  }
});

ipcMain.handle("teams:delete", async (event, teamId) => {
  try {
    if (!ObjectId.isValid(String(teamId || ""))) {
      return { ok: false, message: "This team is no longer available. Refresh the list and try again." };
    }
    const id = new ObjectId(String(teamId));
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageTeams");
    if (!access.ok) return access;
    const count = await getTeamEmployeesCount(database.collection("employees"), id);
    if (count > 0) {
      return { ok: false, message: `This team has ${count} employee${count === 1 ? "" : "s"}. Reassign them before deleting the team.` };
    }
    const result = await database.collection("teams").deleteOne({ _id: id });
    return result.deletedCount
      ? { ok: true }
      : { ok: false, message: "This team no longer exists. Refresh the list and try again." };
  } catch (error) {
    console.error("Could not delete team:", error.message);
    return { ok: false, message: "Team could not be deleted. Check the database connection and try again." };
  }
});

ipcMain.handle("employees:list", async (event) => {
  try {
    const database = await getDatabase();
    const employeesCollection = database.collection("employees");
    const usersCollection = database.collection("users");
    await ensureEmployeeIndexes(employeesCollection);

    // Get current user for filtering
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await usersCollection.findOne({ _id: new ObjectId(actorId) }) : null;

    let employeeFilter = {};
    if (actor) {
      if (actor.role === "Quality") {
        // Quality sees only employees from teams assigned to them
        // First get their assigned teams
        const qualityTeams = await database.collection("teams").find(
          { qualityOwnerId: String(actor._id) },
          { projection: { _id: 1 } }
        ).toArray();
        const qualityTeamIds = qualityTeams.map((team) => team._id);
        employeeFilter = { teamId: { $in: qualityTeamIds } };
      } else if (actor.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
        // Team Leader sees only employees from their assigned teams
        employeeFilter = { teamId: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
      } else if (actor.role === "Manager") {
        // Manager sees all employees but can't edit
        employeeFilter = {};
      }
      // Admin sees all employees
    }

    const [employees, teams] = await Promise.all([
      employeesCollection.aggregate([
        { $match: employeeFilter },
        { $lookup: { from: "teams", localField: "teamId", foreignField: "_id", as: "team" } },
        { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
        { $sort: { "team.teamName": 1, fullNameLower: 1, fullName: 1 } },
      ]).toArray(),
      database.collection("teams").find({}, { projection: { teamName: 1, kpis: 1, performance: 1 } }).sort({ teamName: 1 }).toArray(),
    ]);

    return {
      ok: true,
      employees: employees.map(toEmployeeResponse),
      teams: teams.map((team) => ({ id: team._id.toString(), name: team.teamName, kpis: team.kpis, performance: team.performance })),
    };
  } catch (error) {
    console.error("Could not load employees:", error.message);
    return { ok: false, message: "Employees could not be loaded. Check the database connection." };
  }
});

async function getCoachingAccess(database, event) {
  const actorId = activeSettingsSessions.get(event.sender.id);
  const actor = await findSettingsActor(database, event, actorId);
  if (!actor) return { ok: false, message: "Sign in again to access coaching." };

  const permissions = normalizeAccountPermissions(actor.permissions, actor.role);
  if (actor.role !== "Admin" && !permissions.pages.includes("Coaching")) {
    return { ok: false, message: "Your account does not have permission to access coaching." };
  }

  if (actor.role === "Admin" || actor.role === "Manager") {
    return { ok: true, actor, employeeFilter: { employmentStatus: { $ne: "Resigned" } } };
  }

  let teamIds = [];
  if (actor.role === "Quality") {
    const teams = await database.collection("teams").find(
      { qualityOwnerId: String(actor._id) },
      { projection: { _id: 1 } },
    ).toArray();
    teamIds = teams.map((team) => team._id);
  } else if (actor.role === "Team Leader") {
    teamIds = (Array.isArray(actor.teamIds) ? actor.teamIds : [])
      .filter((id) => ObjectId.isValid(String(id)))
      .map((id) => new ObjectId(String(id)));
  } else {
    return { ok: false, message: "This account role cannot access coaching." };
  }

  const scopedTeamIds = teamIds.flatMap((id) => [id, String(id)]);
  return {
    ok: true,
    actor,
    employeeFilter: {
      employmentStatus: { $ne: "Resigned" },
      teamId: { $in: scopedTeamIds },
    },
  };
}

ipcMain.handle("coaching:list", async (event) => {
  try {
    const database = await getDatabase();
    const access = await getCoachingAccess(database, event);
    if (!access.ok) return access;

    const employees = await database.collection("employees").aggregate([
      { $match: access.employeeFilter },
      { $lookup: { from: "teams", localField: "teamId", foreignField: "_id", as: "team" } },
      { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
      { $sort: { "team.teamName": 1, fullNameLower: 1, fullName: 1 } },
    ]).toArray();
    const monthDate = new Date();
    const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const employeeIds = employees.map((employee) => employee._id);
    const salesEntries = employeeIds.length
      ? await database.collection("qualityEvaluations").find({
        employeeId: { $in: [...employeeIds, ...employeeIds.map(String)] },
        month,
      }, { projection: { employeeId: 1, sales: 1 } }).toArray()
      : [];
    const salesByEmployee = new Map(salesEntries.map((entry) => [String(entry.employeeId), entry.sales]));

    return {
      ok: true,
      month,
      employees: employees.map((employee) => ({
        id: employee._id.toString(),
        fullName: String(employee.fullName || ""),
        code3cx: String(employee.code3cx || ""),
        awfarCode: String(employee.awfarCode || ""),
        hireDate: employee.hireDate || null,
        teamId: employee.team?._id?.toString() || String(employee.teamId || ""),
        teamName: String(employee.team?.teamName || "Unassigned"),
        teamLeaderName: String(employee.team?.teamLeader?.name || ""),
        teamLeaderEmail: String(employee.team?.teamLeader?.email || ""),
        sales: salesByEmployee.has(employee._id.toString()) ? salesByEmployee.get(employee._id.toString()) : null,
      })),
    };
  } catch (error) {
    console.error("Could not load coaching employees:", error.message);
    return { ok: false, message: "Coaching employees could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("coaching:reports-list", async (event, employeeId) => {
  try {
    if (!ObjectId.isValid(String(employeeId || ""))) {
      return { ok: false, message: "Choose a valid employee to view coaching reports." };
    }
    const database = await getDatabase();
    const access = await getCoachingAccess(database, event);
    if (!access.ok) return access;
    const employee = await database.collection("employees").findOne({
      $and: [{ _id: new ObjectId(String(employeeId)) }, access.employeeFilter],
    }, { projection: { _id: 1 } });
    if (!employee) return { ok: false, message: "This employee is outside your coaching access." };

    const reports = await database.collection("coachingReports").find(
      { employeeId: employee._id },
    ).sort({ createdAt: -1 }).toArray();
    return {
      ok: true,
      reports: reports.map((report) => ({
        id: report._id.toString(),
        coachingDone: report.coachingDone,
        nextSteps: report.nextSteps,
        authorName: report.authorName,
        createdAt: report.createdAt,
        emailStatus: report.emailStatus,
        emailError: report.emailError || "",
      })),
    };
  } catch (error) {
    console.error("Could not load coaching reports:", error.message);
    return { ok: false, message: "Previous coaching reports could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("coaching:report-save", async (event, input = {}) => {
  try {
    const employeeId = String(input.employeeId || "");
    if (!ObjectId.isValid(employeeId)) return { ok: false, message: "Choose a valid employee." };
    const coachingDone = String(input.coachingDone || "").trim();
    const nextSteps = String(input.nextSteps || "").trim();
    if (!coachingDone || !nextSteps) {
      return { ok: false, message: "Complete both the coaching discussion and next steps before saving." };
    }
    if (coachingDone.length > 10000 || nextSteps.length > 10000) {
      return { ok: false, message: "Each report section must be 10,000 characters or fewer." };
    }

    const database = await getDatabase();
    const access = await getCoachingAccess(database, event);
    if (!access.ok) return access;
    const employee = await database.collection("employees").findOne({
      $and: [{ _id: new ObjectId(employeeId) }, access.employeeFilter],
    });
    if (!employee) return { ok: false, message: "This employee is outside your coaching access or is no longer active." };

    const teamId = ObjectId.isValid(String(employee.teamId || "")) ? new ObjectId(String(employee.teamId)) : null;
    const team = teamId ? await database.collection("teams").findOne({ _id: teamId }) : null;
    const now = new Date();
    const report = {
      employeeId: employee._id,
      teamId: employee.teamId,
      employeeName: String(employee.fullName || ""),
      teamName: String(team?.teamName || "Unassigned"),
      coachingDone,
      nextSteps,
      authorId: access.actor._id,
      authorName: String(access.actor.name || access.actor.username || access.actor.email || "Workspace user"),
      createdAt: now,
      emailStatus: "pending",
      emailError: "",
    };
    const reportsCollection = database.collection("coachingReports");
    await reportsCollection.createIndex({ employeeId: 1, createdAt: -1 }, { name: "coaching_employee_history" });
    const { insertedId } = await reportsCollection.insertOne(report);
    const employeeEmail = String(employee.email || "").trim().toLowerCase();
    const leaderEmail = String(team?.teamLeader?.email || "").trim().toLowerCase();
    let emailStatus = "failed";
    let emailError = "";

    if (!emailPattern.test(employeeEmail)) {
      emailError = "The employee does not have a valid email address, so the report was saved but not emailed.";
    } else {
      try {
        const smtpHost = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
        const smtpUser = String(process.env.SMTP_USER || "orientgroup588@gmail.com").trim();
        const smtpPass = String(process.env.SMTP_PASS || "tcdl xccm yvae iqoh");
        const smtpFrom = String(process.env.SMTP_FROM || "Quality Operations \u003corientgroup588@gmail.com\u003e").trim();
        const port = Number(process.env.SMTP_PORT || 587);
        const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
        if (!smtpHost || !smtpFrom) throw new Error("SMTP is not configured.");

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port,
          secure,
          ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
        });
        const cc = emailPattern.test(leaderEmail) && leaderEmail !== employeeEmail ? leaderEmail : "";
        const subject = `Coaching report | ${employee.fullName} | ${now.toLocaleDateString("en-US", { dateStyle: "medium" })}`;
        const sectionStyle = "margin:0 0 18px;padding:16px 18px;border:1px solid #e4eee6;border-radius:10px;background:#f8fbf8;color:#33483b;font-size:14px;line-height:1.8;white-space:pre-wrap;";
        const html = `<!doctype html><html><body style="margin:0;padding:28px;background:#f2f6f2;font-family:Segoe UI,Arial,sans-serif;color:#24392d;">
          <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #dce9df;border-radius:16px;overflow:hidden;">
            <header style="padding:28px 32px;background:linear-gradient(135deg,#1f4938,#3c7656);color:#fff;">
              <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#c2ddc9;">NORTHSTAR QUALITY OPERATIONS</div>
              <h1 style="margin:12px 0 5px;font-size:25px;">Coaching session summary</h1>
              <p style="margin:0;color:#deeee2;font-size:13px;">A coaching report has been prepared for ${escapeEmailHtml(employee.fullName)}.</p>
            </header>
            <main style="padding:26px 32px;">
              <table role="presentation" style="width:100%;margin-bottom:22px;border-collapse:collapse;font-size:13px;">
                <tr><td style="padding:7px 0;color:#75847a;font-weight:700;width:34%;">Employee</td><td style="padding:7px 0;color:#263d31;font-weight:800;">${escapeEmailHtml(employee.fullName)}</td></tr>
                <tr><td style="padding:7px 0;color:#75847a;font-weight:700;">Team</td><td style="padding:7px 0;color:#263d31;">${escapeEmailHtml(team?.teamName || "Unassigned")}</td></tr>
                <tr><td style="padding:7px 0;color:#75847a;font-weight:700;">Coached by</td><td style="padding:7px 0;color:#263d31;">${escapeEmailHtml(report.authorName)}</td></tr>
                <tr><td style="padding:7px 0;color:#75847a;font-weight:700;">Date</td><td style="padding:7px 0;color:#263d31;">${escapeEmailHtml(formatEmailDate(now))}</td></tr>
              </table>
              <h2 style="margin:0 0 9px;color:#294534;font-size:16px;">What we covered</h2>
              <div style="${sectionStyle}">${escapeEmailHtml(coachingDone)}</div>
              <h2 style="margin:20px 0 9px;color:#294534;font-size:16px;">Next steps</h2>
              <div style="${sectionStyle}">${escapeEmailHtml(nextSteps)}</div>
            </main>
            <footer style="padding:16px 32px;background:#f8fbf8;color:#829087;font-size:11px;">This email was generated automatically by Northstar Quality Operations.</footer>
          </div>
        </body></html>`;
        await transporter.sendMail({
          from: smtpFrom,
          to: employeeEmail,
          ...(cc ? { cc } : {}),
          subject,
          text: `Coaching session summary for ${employee.fullName}\n\nWhat we covered:\n${coachingDone}\n\nNext steps:\n${nextSteps}`,
          html,
        });
        emailStatus = "sent";
      } catch (error) {
        emailError = "The report was saved, but its email could not be sent. Check the SMTP settings and try again.";
        console.error("Could not email coaching report:", error.message);
      }
    }

    await reportsCollection.updateOne(
      { _id: insertedId },
      { $set: { emailStatus, emailError, ...(emailStatus === "sent" ? { emailedAt: new Date() } : {}) } },
    );
    return {
      ok: true,
      report: { id: insertedId.toString(), ...report, emailStatus, emailError },
      emailSent: emailStatus === "sent",
      message: emailStatus === "sent"
        ? "Coaching report saved and emailed to the employee."
        : emailError,
    };
  } catch (error) {
    console.error("Could not save coaching report:", error.message);
    return { ok: false, message: "Coaching report could not be saved. Check the database connection and try again." };
  }
});

ipcMain.handle("employees:save", async (event, input) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;
    const employees = database.collection("employees");
    await ensureEmployeeIndexes(employees);

    if (input.id && !ObjectId.isValid(String(input.id))) {
      throw new EmployeeValidationError("This employee is no longer available. Refresh and try again.");
    }
    const id = input.id ? new ObjectId(String(input.id)) : null;
    const normalized = normalizeEmployeeInput(input);
    const teamExists = await database.collection("teams").findOne({ _id: normalized.teamId }, { projection: { _id: 1 } });
    if (!teamExists) throw new EmployeeValidationError("Choose a team that still exists.");

    const duplicateConditions = [{ fullNameLower: normalized.fullNameLower },
      normalized.code3cxLower && { code3cxLower: normalized.code3cxLower },
      normalized.awfarCodeLower && { awfarCodeLower: normalized.awfarCodeLower },
      normalized.emailLower && { emailLower: normalized.emailLower }].filter(Boolean);
    if (duplicateConditions.length) {
      const duplicate = await employees.findOne({
        employmentStatus: "Active",
        $or: duplicateConditions,
        ...(id ? { _id: { $ne: id } } : {}),
      }, { projection: { _id: 1 } });
      if (duplicate) throw new EmployeeValidationError("An active employee already uses this name, 3CX code, Awfar code, or email.");
    }

    const now = new Date();
    if (id) {
      const unsetFields = Object.fromEntries(["code3cxLower", "awfarCodeLower", "emailLower"]
        .filter((field) => !(field in normalized)).map((field) => [field, ""]));
      const { performanceTargets, ...employeeFields } = normalized;
      const update = {
        $set: {
          ...employeeFields,
          "performanceTargets.salesMode": performanceTargets.salesMode,
          "performanceTargets.sales.red.from": performanceTargets.sales.red.from,
          "performanceTargets.sales.red.to": performanceTargets.sales.red.to,
          "performanceTargets.sales.yellow.from": performanceTargets.sales.yellow.from,
          "performanceTargets.sales.yellow.to": performanceTargets.sales.yellow.to,
          "performanceTargets.sales.green.from": performanceTargets.sales.green.from,
          "performanceTargets.sales.redZoneOverride": performanceTargets.sales.redZoneOverride,
          "performanceTargets.sales.greenZoneOverride": performanceTargets.sales.greenZoneOverride,
          "performanceTargets.talkingTimeMode": performanceTargets.talkingTimeMode,
          "performanceTargets.talkingTimeHours": performanceTargets.talkingTimeHours,
          updatedAt: now,
        },
      };
      if (Object.keys(unsetFields).length) update.$unset = unsetFields;
      const result = await employees.updateOne({ _id: id }, update);
      if (!result.matchedCount) throw new EmployeeValidationError("This employee no longer exists. Refresh and try again.");
      const savedEmployee = await employees.findOne(
        { _id: id },
        { projection: { performanceTargets: 1 } },
      );
      const savedTargets = savedEmployee?.performanceTargets;
      const targetSettingsMatch = savedTargets
        && savedTargets.salesMode === performanceTargets.salesMode
        && savedTargets.sales?.red?.from === performanceTargets.sales.red.from
        && savedTargets.sales?.red?.to === performanceTargets.sales.red.to
        && savedTargets.sales?.yellow?.from === performanceTargets.sales.yellow.from
        && savedTargets.sales?.yellow?.to === performanceTargets.sales.yellow.to
        && savedTargets.sales?.green?.from === performanceTargets.sales.green.from
        && savedTargets.sales?.redZoneOverride === performanceTargets.sales.redZoneOverride
        && savedTargets.sales?.greenZoneOverride === performanceTargets.sales.greenZoneOverride
        && savedTargets.talkingTimeMode === performanceTargets.talkingTimeMode
        && savedTargets.talkingTimeHours === performanceTargets.talkingTimeHours;
      if (!targetSettingsMatch) {
        console.error("Employee target settings did not match after saving:", id.toString());
        return { ok: false, message: "Employee target settings could not be verified after saving. Please retry." };
      }
      return { ok: true, id: id.toString(), performanceTargets: savedEmployee.performanceTargets };
    }

    const result = await employees.insertOne({
      ...normalized,
      employmentStatus: "Active",
      resignDate: null,
      returnDate: null,
      employmentHistory: [{ action: "hired", date: normalized.hireDate, recordedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    const savedEmployee = await employees.findOne(
      { _id: result.insertedId },
      { projection: { performanceTargets: 1 } },
    );
    if (!savedEmployee?.performanceTargets) {
      console.error("New employee target settings were not persisted:", result.insertedId.toString());
      return { ok: false, message: "Employee target settings could not be verified after saving. Please retry." };
    }
    return { ok: true, id: result.insertedId.toString(), performanceTargets: savedEmployee.performanceTargets };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    if (error.code === 11000) return { ok: false, message: "An active employee already uses this name, 3CX code, Awfar code, or email." };
    console.error("Could not save employee:", error.message);
    return { ok: false, message: "Employee could not be saved. Check the database connection and try again." };
  }
});

ipcMain.handle("employees:updateCustomKpiActual", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;

    if (!ObjectId.isValid(String(input.employeeId || ""))) {
      return { ok: false, message: "This employee is no longer available. Refresh and try again." };
    }

    const employeeId = new ObjectId(String(input.employeeId));
    const kpiName = String(input.kpiName || "").trim();
    const month = validateEvaluationMonth(input.month);
    const actual = input.actual === "" || input.actual == null ? null : Number(input.actual);

    if (!kpiName) {
      return { ok: false, message: "KPI name is required." };
    }

    if (actual !== null && (!Number.isFinite(actual) || actual < 0)) {
      return { ok: false, message: "Actual value must be a valid non-negative number." };
    }

    const employees = database.collection("employees");
    const employee = await employees.findOne({ _id: employeeId });

    if (!employee) {
      return { ok: false, message: "Employee not found." };
    }

    const storageKey = encodeURIComponent(kpiName).replaceAll(".", "%2E");
    const updatePath = `customKpiAchievementsByMonth.${month}.${storageKey}`;
    const result = await employees.updateOne(
      { _id: employeeId },
      { $set: { [updatePath]: actual, updatedAt: new Date() } },
    );

    if (!result.matchedCount) {
      return { ok: false, message: "Employee could not be updated." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Could not update custom KPI actual:", error.message);
    return { ok: false, message: "Custom KPI actual value could not be updated. Check the database connection and try again." };
  }
});

ipcMain.handle("employees:updateCustomKpiTarget", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;

    const employeeIdText = String(input.employeeId || "");
    if (!ObjectId.isValid(employeeIdText)) {
      return { ok: false, message: "This employee is no longer available. Refresh and try again." };
    }
    const employeeId = new ObjectId(employeeIdText);
    const kpiName = String(input.kpiName || "").trim();
    const month = validateEvaluationMonth(input.month);
    const target = input.target === "" || input.target == null ? null : Number(input.target);
    if (!kpiName) return { ok: false, message: "KPI name is required." };
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      return { ok: false, message: "Target must be a valid positive number." };
    }

    const employee = await database.collection("employees").findOne({
      _id: employeeId,
      employmentStatus: { $ne: "Resigned" },
    }, { projection: { _id: 1, teamId: 1, employeeType: 1 } });
    if (!employee) return { ok: false, message: "Only active employees can receive a custom KPI target." };

    const teamId = ObjectId.isValid(String(employee.teamId || "")) ? new ObjectId(String(employee.teamId)) : null;
    const team = teamId ? await database.collection("teams").findOne({ _id: teamId }, { projection: { kpis: 1, qualityOwnerId: 1 } }) : null;
    if (access.actor.role === "Team Leader"
      && !(Array.isArray(access.actor.teamIds) && access.actor.teamIds.some((id) => String(id) === String(teamId)))) {
      return { ok: false, message: "This employee is outside your assigned teams." };
    }
    if (access.actor.role === "Quality" && team?.qualityOwnerId !== String(access.actor._id)) {
      return { ok: false, message: "This employee is outside the teams assigned to your account." };
    }
    const level = String(employee.employeeType || "").toLowerCase() === "senior" ? "senior" : "agent";
    const teamKpis = team?.kpis?.[level];
    const customKpis = Array.isArray(teamKpis?.custom) && teamKpis.custom.length
      ? teamKpis.custom
      : (Array.isArray(teamKpis?.customKPIs) ? teamKpis.customKPIs : []);
    if (!customKpis.some((kpi) => kpi.enabled !== false && String(kpi.name || "").trim() === kpiName)) {
      return { ok: false, message: "This KPI is not enabled for the employee's team." };
    }

    const storageKey = encodeURIComponent(kpiName).replaceAll(".", "%2E");
    const updatePath = `customKpiTargetsByMonth.${month}.${storageKey}`;
    const result = await database.collection("employees").updateOne(
      { _id: employeeId },
      { $set: { [updatePath]: target, updatedAt: new Date() } },
    );
    if (!result.matchedCount) return { ok: false, message: "Employee could not be updated." };
    return { ok: true };
  } catch (error) {
    console.error("Could not update custom KPI target:", error.message);
    return { ok: false, message: "Custom KPI target could not be saved. Check the database connection and try again." };
  }
});

ipcMain.handle("employees:updateManualKpi", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;

    const month = validateEvaluationMonth(input.month);
    const updates = input.updates || {};
    if (!updates || typeof updates !== "object") {
      return { ok: false, message: "Invalid updates data." };
    }

    const employees = database.collection("employees");
    const bulkOperations = [];

    for (const [employeeId, manualKpiValue] of Object.entries(updates)) {
      if (!ObjectId.isValid(String(employeeId))) continue;

      const value = manualKpiValue === "" || manualKpiValue == null ? null : Number(manualKpiValue);

      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
        return { ok: false, message: `Manual KPI for employee ${employeeId} must be between 0 and 100.` };
      }

      bulkOperations.push({
        updateOne: {
          filter: { _id: new ObjectId(String(employeeId)) },
          update: {
            $set: {
              [`manualKpiByMonth.${month}`]: value,
              updatedAt: new Date(),
            },
          },
        },
      });
    }

    if (bulkOperations.length === 0) {
      return { ok: false, message: "No valid employee updates provided." };
    }

    const result = await employees.bulkWrite(bulkOperations, { ordered: false });

    return { ok: true, updatedCount: result.modifiedCount };
  } catch (error) {
    console.error("Could not update manual KPI:", error.message);
    return { ok: false, message: "Manual KPI could not be updated. Check the database connection and try again." };
  }
});

ipcMain.handle("employees:resign", async (event, employeeId, resignDateText) => {
  try {
    if (!ObjectId.isValid(String(employeeId || ""))) {
      return { ok: false, message: "This employee is no longer available. Refresh and try again." };
    }
    const resignDate = parseDateOnly(resignDateText, "resignation date");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (resignDate > today) throw new EmployeeValidationError("Resignation date cannot be in the future.");

    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;
    const employees = database.collection("employees");
    const id = new ObjectId(String(employeeId));
    const employee = await employees.findOne({ _id: id, employmentStatus: "Active" });
    if (!employee) throw new EmployeeValidationError("Only an active employee can be resigned.");
    const lastStartDate = employee.returnDate || employee.hireDate;
    if (lastStartDate && resignDate < lastStartDate) {
      throw new EmployeeValidationError("Resignation date cannot be before the employee's latest hire or return date.");
    }

    const now = new Date();
    const result = await employees.updateOne({ _id: id, employmentStatus: "Active" }, {
      $set: { employmentStatus: "Resigned", resignDate, updatedAt: now },
      $push: { employmentHistory: { action: "resigned", date: resignDate, recordedAt: now } },
    });
    if (!result.matchedCount) throw new EmployeeValidationError("This employee's status changed. Refresh and try again.");
    return { ok: true };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not resign employee:", error.message);
    return { ok: false, message: "Employee status could not be updated. Check the database connection." };
  }
});

ipcMain.handle("employees:restore", async (event, employeeId, returnDateText) => {
  try {
    if (!ObjectId.isValid(String(employeeId || ""))) {
      return { ok: false, message: "This employee is no longer available. Refresh and try again." };
    }
    const returnDate = parseDateOnly(returnDateText, "return date");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (returnDate > today) throw new EmployeeValidationError("Return date cannot be in the future.");

    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;
    const employees = database.collection("employees");
    const id = new ObjectId(String(employeeId));
    const employee = await employees.findOne({ _id: id, employmentStatus: "Resigned" });
    if (!employee) throw new EmployeeValidationError("Only a resigned employee can be returned.");
    if (returnDate < employee.resignDate) {
      throw new EmployeeValidationError("Return date cannot be before the latest resignation date.");
    }
    const identityConditions = [
      employee.fullNameLower && { fullNameLower: employee.fullNameLower },
      employee.code3cxLower && { code3cxLower: employee.code3cxLower },
      employee.awfarCodeLower && { awfarCodeLower: employee.awfarCodeLower },
      employee.emailLower && { emailLower: employee.emailLower },
    ].filter(Boolean);
    if (identityConditions.length && await employees.findOne({
      employmentStatus: "Active",
      _id: { $ne: id },
      $or: identityConditions,
    }, { projection: { _id: 1 } })) {
      throw new EmployeeValidationError("An active employee is already using this name or one of these identifiers. Update the archived record before returning it.");
    }

    const now = new Date();
    const result = await employees.updateOne({ _id: id, employmentStatus: "Resigned" }, {
      $set: { employmentStatus: "Active", returnDate, updatedAt: now },
      $push: { employmentHistory: { action: "returned", date: returnDate, recordedAt: now } },
    });
    if (!result.matchedCount) throw new EmployeeValidationError("This employee's status changed. Refresh and try again.");
    return { ok: true };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not restore employee:", error.message);
    return { ok: false, message: "Employee could not be returned. Check the database connection." };
  }
});

ipcMain.handle("employees:delete", async (event, employeeId) => {
  try {
    if (!ObjectId.isValid(String(employeeId || ""))) {
      return { ok: false, message: "This employee is no longer available. Refresh and try again." };
    }
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageEmployees");
    if (!access.ok) return access;
    const result = await database.collection("employees").deleteOne({ _id: new ObjectId(String(employeeId)) });
    return result.deletedCount
      ? { ok: true }
      : { ok: false, message: "This employee no longer exists. Refresh and try again." };
  } catch (error) {
    console.error("Could not delete employee:", error.message);
    return { ok: false, message: "Employee could not be deleted. Check the database connection." };
  }
});

function validateEvaluationMonth(value) {
  const month = String(value || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new EmployeeValidationError("Choose a valid evaluation month.");
  }
  return month;
}

function validateTalkingTimeDate(value, month) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month) {
    throw new EmployeeValidationError("Choose a valid day within the selected month.");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new EmployeeValidationError("Choose a valid day within the selected month.");
  }
  return date;
}

ipcMain.handle("talking-time:list", async (event, monthValue, dateValue) => {
  try {
    const month = validateEvaluationMonth(monthValue);
    const date = validateTalkingTimeDate(dateValue, month);
    const database = await getDatabase();
    const usersCollection = database.collection("users");
    const entries = database.collection("talkingTimeEntries");
    await entries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "talking_time_employee_date_unique" });
    
    // Get current user for filtering
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await usersCollection.findOne({ _id: new ObjectId(actorId) }) : null;

    let teamFilter = {};
    let employeeFilter = { employmentStatus: { $ne: "Resigned" } };
    
    if (actor) {
      if (actor.role === "Quality") {
        // Quality sees only teams assigned to them
        teamFilter = { qualityOwnerId: String(actor._id) };
        // Get their assigned teams for employee filtering
        const qualityTeams = await database.collection("teams").find(
          { qualityOwnerId: String(actor._id) },
          { projection: { _id: 1 } }
        ).toArray();
        const qualityTeamIds = qualityTeams.map((team) => team._id);
        employeeFilter = { employmentStatus: { $ne: "Resigned" }, teamId: { $in: qualityTeamIds } };
      } else if (actor.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
        // Team Leader sees only their assigned teams
        teamFilter = { _id: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
        employeeFilter = { employmentStatus: { $ne: "Resigned" }, teamId: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
      } else if (actor.role === "Manager") {
        // Manager sees all teams but can't edit
        teamFilter = {};
        employeeFilter = { employmentStatus: { $ne: "Resigned" } };
      }
      // Admin sees all teams
    }

    const [teamDocuments, employeeDocuments] = await Promise.all([
      database.collection("teams").find(teamFilter).sort({ teamName: 1 }).toArray(),
      database.collection("employees").find(employeeFilter).sort({ fullNameLower: 1, fullName: 1 }).toArray(),
    ]);
    const employeeIds = employeeDocuments.map((employee) => employee._id);
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const monthlyEntries = employeeIds.length ? await entries.aggregate([
      { $match: { employeeId: { $in: employeeIds }, date: { $gte: `${month}-01`, $lte: lastDay } } },
      { $group: {
        _id: "$employeeId",
        monthTotalSeconds: { $sum: { $ifNull: ["$seconds", { $multiply: [{ $ifNull: ["$hours", 0] }, 3600] }] } },
        dailySeconds: { $sum: { $cond: [
          { $eq: ["$date", date] },
          { $ifNull: ["$seconds", { $multiply: [{ $ifNull: ["$hours", 0] }, 3600] }] },
          0,
        ] } },
        dailyEntryCount: { $sum: { $cond: [{ $eq: ["$date", date] }, 1, 0] } },
      } },
    ]).toArray() : [];
    const totalsByEmployee = new Map(monthlyEntries.map((entry) => [entry._id.toString(), entry]));
    const teamsById = new Map(teamDocuments.map((team) => [team._id.toString(), {
      id: team._id.toString(),
      name: team.teamName,
      targets: {
        Agent: team.kpis?.agent?.talkingTimeHours || null,
        Senior: team.kpis?.senior?.talkingTimeHours || null,
      },
      employees: [],
    }]));

    for (const employee of employeeDocuments) {
      const teamId = employee.teamId?.toString() || "";
      const team = teamsById.get(teamId);
      if (!team) continue;
      const monthly = totalsByEmployee.get(employee._id.toString());
      const employeeLevel = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "Senior" : "Agent";
      const teamTarget = team.targets[employeeLevel] || {};
      team.employees.push({
        id: employee._id.toString(),
        fullName: employee.fullName,
        employeeType: employeeLevel,
        talkingTimeTarget: {
          ...teamTarget,
          target: getEmployeeTalkingTimeTarget(employee, { talkingTimeHours: teamTarget }),
        },
        code3cx: employee.code3cx || "",
        awfarCode: employee.awfarCode || "",
        dailySeconds: monthly?.dailySeconds || 0,
        hasDailyEntry: Boolean(monthly?.dailyEntryCount),
        monthTotalSeconds: monthly?.monthTotalSeconds || 0,
      });
    }

    return { ok: true, month, date, teams: [...teamsById.values()] };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not load talking time:", error.message);
    return { ok: false, message: "Talking time could not be loaded. Check the database connection." };
  }
});

function normalizeCallStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["leave", "outage"].includes(status) ? status : null;
}

ipcMain.handle("calls-tracking:list", async (event, monthValue) => {
  try {
    const month = validateEvaluationMonth(monthValue);
    const database = await getDatabase();
    const usersCollection = database.collection("users");
    const entries = database.collection("callsTrackingEntries");
    await entries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "calls_tracking_employee_date_unique" });
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    
    // Get current user for filtering
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await usersCollection.findOne({ _id: new ObjectId(actorId) }) : null;

    let teamFilter = {};
    let employeeFilter = { employmentStatus: { $ne: "Resigned" } };
    
    if (actor) {
      if (actor.role === "Quality") {
        // Quality sees only teams assigned to them
        teamFilter = { qualityOwnerId: String(actor._id) };
        // Get their assigned teams for employee filtering
        const qualityTeams = await database.collection("teams").find(
          { qualityOwnerId: String(actor._id) },
          { projection: { _id: 1 } }
        ).toArray();
        const qualityTeamIds = qualityTeams.map((team) => team._id);
        employeeFilter = { employmentStatus: { $ne: "Resigned" }, teamId: { $in: qualityTeamIds } };
      } else if (actor.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
        // Team Leader sees only their assigned teams
        teamFilter = { _id: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
        employeeFilter = { employmentStatus: { $ne: "Resigned" }, teamId: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
      } else if (actor.role === "Manager") {
        // Manager sees all teams but can't edit
        teamFilter = {};
        employeeFilter = { employmentStatus: { $ne: "Resigned" } };
      }
      // Admin sees all teams
    }

    const [teamDocuments, employeeDocuments, callEntries] = await Promise.all([
      database.collection("teams").find(teamFilter).sort({ teamName: 1 }).toArray(),
      database.collection("employees").find(employeeFilter).sort({ fullNameLower: 1, fullName: 1 }).toArray(),
      entries.find({ month }).toArray(),
    ]);
    const entryByEmployee = new Map();
    for (const entry of callEntries) {
      const employeeKey = entry.employeeId.toString();
      if (!entryByEmployee.has(employeeKey)) entryByEmployee.set(employeeKey, {});
      entryByEmployee.get(employeeKey)[entry.date] = { calls: Number(entry.calls || 0), status: entry.status || null };
    }
    const teamsById = new Map(teamDocuments.map((team) => [team._id.toString(), {
      id: team._id.toString(), name: team.teamName,
      targets: { Agent: team.kpis?.agent?.dailyCalls || null, Senior: team.kpis?.senior?.dailyCalls || null }, employees: [],
    }]));
    for (const employee of employeeDocuments) {
      const team = teamsById.get(employee.teamId?.toString() || "");
      if (!team) continue;
      team.employees.push({ id: employee._id.toString(), fullName: employee.fullName,
        employeeType: String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "Senior" : "Agent",
        code3cx: employee.code3cx || "", awfarCode: employee.awfarCode || "", days: entryByEmployee.get(employee._id.toString()) || {} });
    }
    return { ok: true, month, daysInMonth: Number(lastDay.slice(-2)), teams: [...teamsById.values()] };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not load calls tracking:", error.message);
    return { ok: false, message: "Calls tracking could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("calls-tracking:save", async (event, input = {}) => {
  try {
    const employeeId = String(input.employeeId || "");
    if (!ObjectId.isValid(employeeId)) throw new EmployeeValidationError("This employee is no longer available.");
    const date = String(input.date || "");
    const month = validateEvaluationMonth(date.slice(0, 7));
    validateTalkingTimeDate(date, month);
    const status = normalizeCallStatus(input.status);
    const calls = input.calls === "" || input.calls == null ? 0 : Number(input.calls);
    if (!status && (!Number.isInteger(calls) || calls < 0)) throw new EmployeeValidationError("Enter a valid non-negative whole number of calls.");
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canEditCalls");
    if (!access.ok) return access;
    const employee = await database.collection("employees").findOne({ _id: new ObjectId(employeeId), employmentStatus: { $ne: "Resigned" } }, { projection: { _id: 1, teamId: 1 } });
    if (!employee) throw new EmployeeValidationError("Only active employees can receive call entries.");
    const entries = database.collection("callsTrackingEntries");
    await entries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "calls_tracking_employee_date_unique" });
    if (!status && calls === 0) {
      await entries.deleteOne({ employeeId: employee._id, date });
      return { ok: true, calls: 0, status: null };
    }
    await entries.updateOne({ employeeId: employee._id, date }, { $set: { employeeId: employee._id, teamId: employee.teamId, date, month, calls: status ? 0 : calls, status, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    return { ok: true, calls: status ? 0 : calls, status };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not save call entry:", error.message);
    return { ok: false, message: "Call entry could not be saved. Check the database connection." };
  }
});

ipcMain.handle("calls-tracking:delete", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canEditCalls");
    if (!access.ok) return access;
    const allTeams = input.allTeams === true;
    const teamId = String(input.teamId || "");
    if (!allTeams && !ObjectId.isValid(teamId)) throw new EmployeeValidationError("Choose a valid team for deletion.");
    const month = validateEvaluationMonth(input.month);
    const scope = String(input.scope || "");
    if (!["day", "month"].includes(scope)) throw new EmployeeValidationError("Choose a valid deletion period.");
    const dateFilter = scope === "day"
      ? { date: validateTalkingTimeDate(input.date, month) }
      : { date: { $gte: `${month}-01`, $lte: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) } };
    const employeeQuery = allTeams
      ? { employmentStatus: { $ne: "Resigned" } }
      : {
        employmentStatus: { $ne: "Resigned" },
        $or: [{ teamId: new ObjectId(teamId) }, { teamId }],
      };
    const employees = await database.collection("employees").find(employeeQuery, { projection: { _id: 1 } }).toArray();
    const employeeIds = employees.map((employee) => employee._id);
    const result = await database.collection("callsTrackingEntries").deleteMany({ employeeId: { $in: employeeIds }, ...dateFilter });
    return { ok: true, deletedCount: result.deletedCount, scope, month, allTeams, teamId: allTeams ? null : teamId };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not delete call entries:", error.name, error.code || "");
    return { ok: false, message: "Call entries could not be deleted. Check the database connection and try again." };
  }
});

ipcMain.handle("talking-time:save", async (event, input = {}) => {
  try {
    const employeeId = String(input.employeeId || "");
    if (!ObjectId.isValid(employeeId)) throw new EmployeeValidationError("This employee is no longer available.");
    const date = String(input.date || "");
    const month = validateEvaluationMonth(date.slice(0, 7));
    validateTalkingTimeDate(date, month);
    const seconds = input.seconds !== undefined
      ? (input.seconds === "" || input.seconds == null ? null : Number(input.seconds))
      : (input.hours === "" || input.hours == null ? null : Math.round(Number(input.hours) * 3600));
    if (seconds !== null && (!Number.isSafeInteger(seconds) || seconds < 0)) {
      throw new EmployeeValidationError("Daily time must be a valid non-negative duration.");
    }

    const database = await getDatabase();
  const access = await requireAccountPermission(database, event, "canEditTalkingTime");
  if (!access.ok) return access;
    const employee = await database.collection("employees").findOne({
      _id: new ObjectId(employeeId),
      employmentStatus: { $ne: "Resigned" },
    }, { projection: { _id: 1, teamId: 1 } });
    if (!employee) throw new EmployeeValidationError("Only active employees can receive talking time entries.");

    const entries = database.collection("talkingTimeEntries");
    await entries.createIndex({ employeeId: 1, date: 1 }, { unique: true, name: "talking_time_employee_date_unique" });
    if (seconds === null) {
      await entries.deleteOne({ employeeId: employee._id, date });
      return { ok: true, dailySeconds: null };
    }

    const now = new Date();
    await entries.updateOne(
      { employeeId: employee._id, date },
      {
        $set: { employeeId: employee._id, teamId: employee.teamId, date, month, seconds, updatedAt: now },
        $unset: { hours: "" },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return { ok: true, dailySeconds: seconds, updatedAt: now };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not save talking time:", error.message);
    return { ok: false, message: "Daily talking time could not be saved. Check the database connection." };
  }
});

ipcMain.handle("talking-time:delete", async (event, input = {}) => {
  try {
    const allTeams = input.allTeams === true;
    const teamId = String(input.teamId || "");
    if (!allTeams && !ObjectId.isValid(teamId)) throw new EmployeeValidationError("Choose a valid team for deletion.");
    const month = validateEvaluationMonth(input.month);
    const scope = String(input.scope || "");
    if (!["day", "month"].includes(scope)) throw new EmployeeValidationError("Choose a valid deletion period.");
    const dateFilter = scope === "day"
      ? { date: validateTalkingTimeDate(input.date, month) }
      : { date: { $gte: `${month}-01`, $lte: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) } };
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canEditTalkingTime");
    if (!access.ok) return access;
    const employeeQuery = allTeams
      ? { employmentStatus: { $ne: "Resigned" } }
      : {
        employmentStatus: { $ne: "Resigned" },
        $or: [{ teamId: new ObjectId(teamId) }, { teamId }],
      };
    const activeEmployees = await database.collection("employees").find(
      employeeQuery,
      { projection: { _id: 1 } },
    ).toArray();
    let employeeIds = activeEmployees.map((employee) => employee._id);
    if (!allTeams && input.employeeIds !== undefined) {
      const selectedIds = [...new Set((Array.isArray(input.employeeIds) ? input.employeeIds : []).map((id) => String(id)))];
      if (!selectedIds.length || selectedIds.length > 500 || selectedIds.some((id) => !ObjectId.isValid(id))) {
        throw new EmployeeValidationError("Select valid employees from this team before deleting talking time.");
      }
      const activeEmployeeIds = new Set(employeeIds.map((id) => id.toString()));
      if (selectedIds.some((id) => !activeEmployeeIds.has(id))) {
        throw new EmployeeValidationError("One or more selected employees are no longer active members of this team.");
      }
      employeeIds = selectedIds.map((id) => new ObjectId(id));
    }

    const result = await database.collection("talkingTimeEntries").deleteMany({
      employeeId: { $in: employeeIds },
      ...dateFilter,
    });
    return { ok: true, deletedCount: result.deletedCount, scope, month, allTeams, teamId: allTeams ? null : teamId };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not delete talking time:", error.message);
    return { ok: false, message: "Talking time could not be deleted. Check the database connection." };
  }
});

class QualityFormValidationError extends Error {}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatNumber(value, digits = 1) {
  const number = Number(value) || 0;
  return number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function normalizeEmailList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/);
  const emails = [...new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  if (emails.some((email) => !emailPattern.test(email))) {
    throw new QualityFormValidationError("Enter valid email addresses in the CC field.");
  }
  return emails;
}

function escapeEmailHtml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br>");
}

function formatEmailAnswer(answer) {
  return Array.isArray(answer) ? answer.join(", ") || "—" : answer || "—";
}

function formatEmailDate(value) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

async function sendQualityEvaluationEmail({ employee, team, evaluator, month, callIndex, form, answers, feedback, score, callReference, cc }) {
  const smtpHost = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const smtpUser = String(process.env.SMTP_USER || "orientgroup588@gmail.com").trim();
  const smtpPass = String(process.env.SMTP_PASS || "tcdl xccm yvae iqoh");
  const smtpFrom = String(process.env.SMTP_FROM || "Quality Operations \u003corientgroup588@gmail.com\u003e").trim();
  if (!smtpHost || !smtpFrom) {
    return { state: "not_configured", message: "SMTP is not configured." };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
  });
  const recipients = [...new Set([employee.email, team.teamLeader?.email].map((email) => String(email || "").trim().toLowerCase()).filter((email) => emailPattern.test(email)))];
  if (!recipients.length) return { state: "no_recipients", message: "No employee or team leader email is configured." };

  const questionRows = form.questions.map((question, index) => `
    <tr>
      <td style="padding:14px 16px;border-top:1px solid #e8eee9;color:#6a7a70;font-size:12px;font-weight:700;vertical-align:top;width:34%;">${index + 1}. ${escapeEmailHtml(question.label)}</td>
      <td style="padding:14px 16px;border-top:1px solid #e8eee9;color:#24392d;font-size:13px;line-height:1.55;vertical-align:top;">${escapeEmailHtml(formatEmailAnswer(answers?.[question.id]))}</td>
    </tr>`).join("");
  const monthLabel = new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const subject = `Quality call evaluation | ${employee.fullName} | Call ${callIndex}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f7f4;font-family:Segoe UI,Arial,sans-serif;color:#24392d;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #dce9df;border-radius:18px;overflow:hidden;">
      <div style="padding:28px 30px;background:linear-gradient(135deg,#dff3e5,#edf4ff);border-bottom:1px solid #d5e6da;">
        <div style="font-size:11px;letter-spacing:1.5px;font-weight:800;color:#347052;">NORTHSTAR QUALITY OPERATIONS</div>
        <h1 style="margin:10px 0 5px;font-size:25px;color:#1f3b2c;">Call evaluation completed</h1>
        <p style="margin:0;color:#587064;font-size:13px;">A new quality review is ready for ${escapeEmailHtml(employee.fullName)}.</p>
      </div>
      <div style="padding:24px 30px;">
        <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0 8px;font-size:13px;">
          <tr><td style="color:#708077;font-weight:700;width:34%;">Employee</td><td style="color:#263d31;font-weight:800;">${escapeEmailHtml(employee.fullName)}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">Team</td><td style="color:#263d31;font-weight:700;">${escapeEmailHtml(team.teamName)}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">3CX code</td><td style="color:#263d31;">${escapeEmailHtml(employee.code3cx || "Not assigned")}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">AWFAR code</td><td style="color:#263d31;">${escapeEmailHtml(employee.awfarCode || "Not assigned")}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">Hire date</td><td style="color:#263d31;">${escapeEmailHtml(formatEmailDate(employee.hireDate))}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">Evaluated by</td><td style="color:#263d31;font-weight:700;">${escapeEmailHtml(evaluator.name)}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">Evaluation period</td><td style="color:#263d31;">${escapeEmailHtml(monthLabel)}</td></tr>
          <tr><td style="color:#708077;font-weight:700;">Call reference</td><td style="color:#263d31;">${escapeEmailHtml(callReference || `Call ${callIndex}`)}</td></tr>
        </table>
        <div style="display:inline-block;margin:18px 0 22px;padding:14px 20px;border-radius:14px;background:#e8f6ec;color:#21613d;"><span style="display:block;font-size:11px;font-weight:700;">QUALITY SCORE</span><strong style="font-size:30px;">${escapeEmailHtml(score)}<small style="font-size:14px;"> / 100</small></strong></div>
        <h2 style="margin:0 0 10px;font-size:17px;color:#294534;">${escapeEmailHtml(form.name)}</h2>
        <table style="width:100%;border:1px solid #e8eee9;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden;">${questionRows}</table>
        <h2 style="margin:24px 0 10px;font-size:17px;color:#294534;">Evaluator feedback</h2>
        <div style="padding:16px;border-left:4px solid #63a778;border-radius:8px;background:#f5faf6;color:#3f5548;font-size:13px;line-height:1.7;">${escapeEmailHtml(feedback)}</div>
      </div>
      <div style="padding:16px 30px;background:#f8fbf8;color:#829087;font-size:11px;">This email was generated automatically by Quality Operations.</div>
    </div>
  </body></html>`;
  await transporter.sendMail({ from: smtpFrom, to: recipients.join(", "), cc: cc.filter((email) => !recipients.includes(email)).join(", "), subject, text: `Quality call evaluation completed for ${employee.fullName}. Score: ${score}/100.`, html });
  return { state: "sent", message: `Sent to ${recipients.join(", ")}.` };
}

function normalizeQualityForm(input = {}) {
  const name = String(input.name || "").trim();
  if (!name) throw new QualityFormValidationError("Enter a name for this form.");
  if (name.length > 120) throw new QualityFormValidationError("Form names cannot exceed 120 characters.");
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new QualityFormValidationError("Add at least one question before saving the form.");
  }
  if (input.questions.length > 200) throw new QualityFormValidationError("A form cannot contain more than 200 questions.");

  const ids = new Set();
  const questions = input.questions.map((question, index) => {
    const id = String(question.id || randomUUID());
    const label = String(question.label || "").trim();
    const type = String(question.type || "");
    if (ids.has(id)) throw new QualityFormValidationError("Question identifiers must be unique.");
    ids.add(id);
    if (!label) throw new QualityFormValidationError(`Enter a question for item ${index + 1}.`);
    if (label.length > 500) throw new QualityFormValidationError("Question text cannot exceed 500 characters.");
    if (!["single", "multi", "date", "text"].includes(type)) {
      throw new QualityFormValidationError(`Choose a supported question type for item ${index + 1}.`);
    }

    const normalized = { id, label, type, required: question.required !== false };
    if (type === "single" || type === "multi") {
      const seenOptions = new Set();
      const optionEntries = [];
      for (const [optionIndex, value] of (Array.isArray(question.options) ? question.options : []).entries()) {
        const option = String(value || "").trim();
        if (!option || seenOptions.has(option)) continue;
        seenOptions.add(option);
        optionEntries.push({ label: option, optionIndex });
      }
      const options = optionEntries.map(({ label: option }) => option);
      if (options.length < 2) throw new QualityFormValidationError(`Add at least two choices for item ${index + 1}.`);
      if (options.some((option) => option.length > 200)) throw new QualityFormValidationError("Choice text cannot exceed 200 characters.");
      normalized.options = options;
      if (!Array.isArray(question.optionScores) || question.optionScores.length !== (Array.isArray(question.options) ? question.options.length : 0)) {
        throw new QualityFormValidationError(`Enter valid points for each choice in question ${index + 1}.`);
      }
      normalized.scored = question.scored !== false;
      normalized.optionScores = optionEntries.map(({ optionIndex }) => {
        const points = Number(question.optionScores[optionIndex]);
        if (!Number.isFinite(points) || points < 0 || points > 1000000) {
          throw new QualityFormValidationError(`Enter valid non-negative points for each choice in question ${index + 1}.`);
        }
        return points;
      });
    } else {
      normalized.scored = false;
    }
    return normalized;
  });

  const maximumPoints = questions.reduce((total, question) => {
    if (!question.scored) return total;
    const points = question.optionScores;
    return total + (question.type === "single" ? Math.max(...points) : points.reduce((sum, value) => sum + value, 0));
  }, 0);
  if (maximumPoints <= 0) throw new QualityFormValidationError("Assign points to at least one choice before saving this form.");

  return { name, nameLower: name.toLocaleLowerCase(), questions };
}

function calculateQualityScore(form, answers) {
  let earnedPoints = 0;
  let maximumPoints = 0;
  for (const question of form.questions) {
    if (!question.scored || !["single", "multi"].includes(question.type)) continue;
    const points = question.options.map((_, index) => Number(question.optionScores?.[index] || 0));
    const selected = question.type === "multi"
      ? (Array.isArray(answers[question.id]) ? answers[question.id] : [])
      : [answers[question.id]];
    if (selected.length === 0 || (question.type === "single" && !String(selected[0] || "").trim())) continue;
    maximumPoints += question.type === "single"
      ? Math.max(...points)
      : points.reduce((total, value) => total + value, 0);
    earnedPoints += question.options.reduce(
      (total, option, index) => total + (selected.includes(option) ? points[index] : 0),
      0,
    );
  }
  if (maximumPoints <= 0) throw new QualityFormValidationError("This form has no scored choices. Ask an administrator to configure its scoring.");
  return Math.round((earnedPoints / maximumPoints) * 10000) / 100;
}

function normalizeFormAnswers(form, input = {}) {
  const source = input.answers && typeof input.answers === "object" ? input.answers : {};
  const answers = {};
  for (const question of form.questions) {
    const value = source[question.id];
    if (question.type === "multi") {
      const selected = Array.isArray(value) ? [...new Set(value.map(String))] : [];
      if (question.required && selected.length === 0) throw new QualityFormValidationError(`Answer: ${question.label}`);
      if (selected.some((answer) => !question.options.includes(answer))) throw new QualityFormValidationError(`Choose valid options for: ${question.label}`);
      answers[question.id] = selected;
      continue;
    }

    const answer = String(value ?? "").trim();
    if (question.required && !answer) throw new QualityFormValidationError(`Answer: ${question.label}`);
    if (question.type === "single" && answer && !question.options.includes(answer)) {
      throw new QualityFormValidationError(`Choose a valid option for: ${question.label}`);
    }
    if (question.type === "date" && answer) {
      const parsed = new Date(`${answer}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(answer) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== answer) {
        throw new QualityFormValidationError(`Enter a valid date for: ${question.label}`);
      }
    }
    if (question.type === "text" && answer.length > 5000) throw new QualityFormValidationError(`Answers cannot exceed 5,000 characters: ${question.label}`);
    answers[question.id] = answer;
  }
  return answers;
}

async function getEvaluationEmployee(database, employeeId) {
  if (!ObjectId.isValid(String(employeeId || ""))) throw new QualityFormValidationError("This employee is no longer available.");
  const employee = await database.collection("employees").findOne({
    _id: new ObjectId(String(employeeId)),
    employmentStatus: { $ne: "Resigned" },
  });
  if (!employee) throw new QualityFormValidationError("Only active employees can be evaluated.");
  const team = await database.collection("teams").findOne({ _id: employee.teamId });
  if (!team) throw new QualityFormValidationError("This employee's assigned team could not be found.");
  const level = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "senior" : "agent";
  const targetMetric = team.kpis?.[level]?.evaluatedCalls;
  const targetCount = targetMetric?.enabled !== false ? Math.ceil(Number(targetMetric?.target) || 0) : 0;
  if (targetCount <= 0) throw new QualityFormValidationError("Set an Evaluated Calls target for this employee's level in the assigned team first.");
  if (targetCount > 500) throw new QualityFormValidationError("The monthly call target cannot exceed 500 evaluations per employee.");
  return { employee, team, targetCount };
}

ipcMain.handle("quality-evaluation:list", async (event, monthValue) => {
  try {
    const month = validateEvaluationMonth(monthValue);
    const database = await getDatabase();
    const usersCollection = database.collection("users");
    const evaluationCollection = database.collection("qualityEvaluations");
    await evaluationCollection.createIndex({ employeeId: 1, month: 1 }, { unique: true, name: "quality_employee_month_unique" });

    // Get current user for filtering
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await usersCollection.findOne({ _id: new ObjectId(actorId) }) : null;

    let employeeFilter = { employmentStatus: { $ne: "Resigned" } };
    if (actor) {
      if (actor.role === "Quality") {
        // Quality sees only employees from teams assigned to them
        const qualityTeams = await database.collection("teams").find(
          { qualityOwnerId: String(actor._id) },
          { projection: { _id: 1 } }
        ).toArray();
        const qualityTeamIds = qualityTeams.map((team) => team._id);
        employeeFilter = { employmentStatus: { $ne: "Resigned" }, teamId: { $in: qualityTeamIds } };
      } else if (actor.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
        // Team Leader sees only employees from their assigned teams
        employeeFilter = { employmentStatus: { $ne: "Resigned" }, teamId: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) } };
      } else if (actor.role === "Manager") {
        // Manager sees all employees but can't edit
        employeeFilter = { employmentStatus: { $ne: "Resigned" } };
      }
      // Admin sees all employees
    }

    const [employees, teams] = await Promise.all([
      database.collection("employees").aggregate([
        { $match: employeeFilter },
        { $lookup: { from: "teams", localField: "teamId", foreignField: "_id", as: "team" } },
        { $unwind: { path: "$team", preserveNullAndEmptyArrays: false } },
        { $sort: { "team.teamName": 1, fullNameLower: 1, fullName: 1 } },
      ]).toArray(),
      database.collection("teams").find({}, { projection: { teamName: 1, kpis: 1, performance: 1 } }).sort({ teamName: 1 }).toArray(),
    ]);

    const employeeIds = employees.map((employee) => employee._id);
    const evaluations = employeeIds.length ? await evaluationCollection.find({ employeeId: { $in: employeeIds }, month }).toArray() : [];
    const evaluationsByEmployee = new Map(evaluations.map((evaluation) => [evaluation.employeeId.toString(), evaluation]));

    return {
      ok: true,
      month,
      employees: employees.map((employee) => {
        const level = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "senior" : "agent";
        const monthly = evaluationsByEmployee.get(employee._id.toString());
        return {
          id: employee._id.toString(),
          fullName: employee.fullName,
          employeeType: level === "senior" ? "Senior" : "Agent",
          code3cx: employee.code3cx || "",
          awfarCode: employee.awfarCode || "",
          email: employee.email || "",
          hireDate: employee.hireDate,
          teamId: employee.team._id.toString(),
          teamName: employee.team.teamName,
          kpiTarget: employee.team.kpis?.[level]?.evaluatedCalls?.enabled !== false
            ? employee.team.kpis?.[level]?.evaluatedCalls?.target ?? null
            : null,
          kpiWeight: employee.team.kpis?.[level]?.evaluatedCalls?.enabled !== false
            ? employee.team.kpis?.[level]?.evaluatedCalls?.weight ?? null
            : null,
          salesEnabled: getEmployeeSalesSettings(employee, employee.team).enabled,
          salesZones: getEmployeeSalesSettings(employee, employee.team).zones,
          sales: monthly?.sales ?? null,
          evaluatedCalls: monthly?.evaluatedCalls ?? null,
          qualityScore: monthly?.qualityScore ?? null,
          updatedAt: monthly?.updatedAt || null,
        };
      }),
      teams: teams.map((team) => ({ id: team._id.toString(), name: team.teamName })),
    };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not load quality evaluations:", error.message);
    return { ok: false, message: "Quality evaluations could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("quality-evaluation:save", async (event, input) => {
  try {
    const employeeId = String(input?.employeeId || "");
    if (!ObjectId.isValid(employeeId)) throw new EmployeeValidationError("This employee is no longer available.");
    const month = validateEvaluationMonth(input.month);
    const sales = input.sales === "" || input.sales == null ? null : Number(input.sales);
    if (sales !== null && (!Number.isFinite(sales) || sales < 0)) throw new EmployeeValidationError("Sales must be a valid non-negative number.");

    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canEditSales");
    if (!access.ok) return access;
    const employee = await database.collection("employees").findOne({
      _id: new ObjectId(employeeId),
      employmentStatus: { $ne: "Resigned" },
    }, { projection: { _id: 1, teamId: 1 } });
    if (!employee) throw new EmployeeValidationError("Only active employees can receive monthly evaluations.");

    const evaluationCollection = database.collection("qualityEvaluations");
    await evaluationCollection.createIndex({ employeeId: 1, month: 1 }, { unique: true, name: "quality_employee_month_unique" });
    const now = new Date();
    await evaluationCollection.updateOne(
      { employeeId: new ObjectId(employeeId), month },
      {
        $set: { employeeId: employee._id, teamId: employee.teamId, month, sales, updatedAt: now },
        $setOnInsert: { createdAt: now, evaluatedCalls: 0, qualityScore: null },
      },
      { upsert: true },
    );
    return { ok: true, updatedAt: now };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    if (error.code === 11000) return { ok: false, message: "This employee's monthly evaluation was updated elsewhere. Refresh and try again." };
    console.error("Could not save monthly evaluation:", error.message);
    return { ok: false, message: "Monthly evaluation could not be saved. Check the database connection." };
  }
});

ipcMain.handle("quality-evaluation:import-sales", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canImportSales");
    if (!access.ok) return access;
    const month = validateEvaluationMonth(input.month);
    const workbookData = input.workbookData;
    if (!(workbookData instanceof ArrayBuffer) && !ArrayBuffer.isView(workbookData)) {
      throw new EmployeeValidationError("Choose a valid Excel workbook.");
    }
    const workbookBytes = Buffer.from(workbookData);
    if (workbookBytes.length > 20 * 1024 * 1024) throw new EmployeeValidationError("The workbook cannot exceed 20 MB.");
    const workbook = XLSX.read(workbookBytes, { type: "buffer" });
    const sheet = workbook.Sheets.Sheet1;
    if (!sheet) throw new EmployeeValidationError("The workbook must contain a Sheet1 worksheet.");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const headers = rows.slice(0, 8).flatMap((row, rowIndex) => row.map((value, columnIndex) => ({
      name: String(value).trim().toLocaleLowerCase(), rowIndex, columnIndex,
    })));
    const codeHeader = headers.find((header) => header.name === "3cx");
    const totalHeader = headers.find((header) => header.name === "total");
    if (!codeHeader || !totalHeader) throw new EmployeeValidationError("Sheet1 must include 3cx and Total columns.");
    const entries = rows.slice(Math.max(codeHeader.rowIndex, totalHeader.rowIndex) + 1).map((row) => {
      const code = String(row[codeHeader.columnIndex] ?? "").trim();
      const rawSales = String(row[totalHeader.columnIndex] ?? "").trim().replaceAll(",", "");
      return { code, sales: rawSales ? Number(rawSales) : null };
    }).filter((entry) => entry.code);
    if (entries.length > 5000) throw new EmployeeValidationError("The workbook contains too many sales rows.");

    const entriesByCode = new Map();
    let invalid = 0;
    for (const entry of entries) {
      const code = String(entry?.code ?? "").trim().toLocaleLowerCase();
      const sales = entry?.sales === "" || entry?.sales == null ? NaN : Number(entry.sales);
      if (!code || !Number.isFinite(sales) || sales < 0) {
        invalid += 1;
        continue;
      }
      if (!entriesByCode.has(code)) entriesByCode.set(code, []);
      entriesByCode.get(code).push(sales);
    }

    const employees = await (await getDatabase()).collection("employees").find(
      { employmentStatus: { $ne: "Resigned" } },
      { projection: { _id: 1, teamId: 1, code3cx: 1, awfarCode: 1, code3cxLower: 1, awfarCodeLower: 1 } },
    ).toArray();
    const employeesByCode = new Map();
    for (const employee of employees) {
      for (const code of [employee.code3cxLower || employee.code3cx, employee.awfarCodeLower || employee.awfarCode]) {
        const normalizedCode = String(code || "").trim().toLocaleLowerCase();
        if (!normalizedCode) continue;
        if (!employeesByCode.has(normalizedCode)) employeesByCode.set(normalizedCode, new Map());
        employeesByCode.get(normalizedCode).set(employee._id.toString(), employee);
      }
    }

    let unmatched = 0;
    let duplicates = 0;
    let ambiguous = 0;
    const updates = [];
    const now = new Date();
    for (const [code, salesRows] of entriesByCode) {
      if (salesRows.length !== 1) {
        duplicates += salesRows.length;
        continue;
      }
      const matches = employeesByCode.get(code);
      if (!matches?.size) {
        unmatched += 1;
        continue;
      }
      if (matches.size !== 1) {
        ambiguous += 1;
        continue;
      }
      const employee = matches.values().next().value;
      updates.push({
        updateOne: {
          filter: { employeeId: employee._id, month },
          update: {
            $set: { employeeId: employee._id, teamId: employee.teamId, month, sales: salesRows[0], updatedAt: now },
            $setOnInsert: { createdAt: now, evaluatedCalls: 0, qualityScore: null },
          },
          upsert: true,
        },
      });
    }

    if (updates.length) {
      const evaluationCollection = database.collection("qualityEvaluations");
      await evaluationCollection.createIndex({ employeeId: 1, month: 1 }, { unique: true, name: "quality_employee_month_unique" });
      await evaluationCollection.bulkWrite(updates, { ordered: false });
    }
    return { ok: true, month, totalRows: entries.length, imported: updates.length, unmatched, duplicates, ambiguous, invalid };
  } catch (error) {
    if (error instanceof EmployeeValidationError) return { ok: false, message: error.message };
    console.error("Could not import monthly sales:", error.message);
    return { ok: false, message: "Sales could not be imported. Check the workbook and database connection." };
  }
});

ipcMain.handle("quality-forms:list", async () => {
  try {
    const database = await getDatabase();
    const collection = database.collection("qualityForms");
    await collection.createIndex({ nameLower: 1 }, {
      unique: true,
      name: "quality_form_name_active_unique",
      partialFilterExpression: { isActive: true },
    });
    await collection.createIndex({ teamIds: 1 }, {
      unique: true,
      name: "quality_form_team_active_unique",
      partialFilterExpression: { isActive: true, "teamIds.0": { $exists: true } },
    });
    const forms = await collection.find({ isActive: { $ne: false } }).sort({ updatedAt: -1, name: 1 }).toArray();
    const teams = await database.collection("teams").find({}, { projection: { teamName: 1 } }).sort({ teamName: 1 }).toArray();
    const teamNames = new Map(teams.map((team) => [team._id.toString(), team.teamName]));
    return {
      ok: true,
      teams: teams.map((team) => ({ id: team._id.toString(), name: team.teamName })),
      forms: forms.map((form) => ({
        id: form._id.toString(),
        name: form.name,
        teamIds: (form.teamIds || []).map((id) => id.toString()),
        teamNames: (form.teamIds || []).map((id) => teamNames.get(id.toString()) || "Deleted team"),
        questions: form.questions,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
      })),
    };
  } catch (error) {
    console.error("Could not load quality forms:", error.message);
    return { ok: false, message: "Forms could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("quality-forms:save", async (event, input) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageQualityForms");
    if (!access.ok) return access;
    if (access.actor.role !== "Admin") return { ok: false, message: "Only Admin accounts can create or change evaluation forms." };
    const formsCollection = database.collection("qualityForms");
    const requestedTeamIds = Array.isArray(input.teamIds) ? [...new Set(input.teamIds.map(String))] : [];
    if (!requestedTeamIds.length) throw new QualityFormValidationError("Assign this form to at least one team.");
    if (requestedTeamIds.some((id) => !ObjectId.isValid(id))) throw new QualityFormValidationError("Choose valid teams for this form.");
    const teamIds = requestedTeamIds.map((id) => new ObjectId(id));
    const existingTeams = await database.collection("teams").countDocuments({ _id: { $in: teamIds } });
    if (existingTeams !== teamIds.length) throw new QualityFormValidationError("One or more selected teams no longer exist. Refresh the form and try again.");
    const normalized = normalizeQualityForm(input);
    normalized.teamIds = teamIds;
    if (input.id && !ObjectId.isValid(String(input.id))) {
      throw new QualityFormValidationError("This form is no longer available. Refresh and try again.");
    }
    const id = input.id ? new ObjectId(String(input.id)) : null;
    const duplicate = await formsCollection.findOne({
      nameLower: normalized.nameLower,
      isActive: { $ne: false },
      ...(id ? { _id: { $ne: id } } : {}),
    }, { projection: { _id: 1 } });
    if (duplicate) throw new QualityFormValidationError("A form with this name already exists.");

    const now = new Date();
    if (id) {
      const result = await formsCollection.updateOne({ _id: id, isActive: { $ne: false } }, { $set: { ...normalized, updatedAt: now } });
      if (!result.matchedCount) throw new QualityFormValidationError("This form no longer exists. Refresh and try again.");
      return { ok: true, id: id.toString() };
    }

    const result = await formsCollection.insertOne({ ...normalized, isActive: true, createdAt: now, updatedAt: now });
    return { ok: true, id: result.insertedId.toString() };
  } catch (error) {
    if (error instanceof QualityFormValidationError) return { ok: false, message: error.message };
    if (error.code === 11000) {
      if (error.message?.includes("quality_form_team_active_unique")) {
        return { ok: false, message: "A team can be assigned to only one active evaluation form." };
      }
      return { ok: false, message: "A form with this name already exists." };
    }
    console.error("Could not save quality form:", error.message);
    return { ok: false, message: "Form could not be saved. Check the database connection." };
  }
});

ipcMain.handle("quality-forms:delete", async (event, formId) => {
  try {
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canManageQualityForms");
    if (!access.ok) return access;
    if (access.actor.role !== "Admin") return { ok: false, message: "Only Admin accounts can delete evaluation forms." };
    const id = String(formId || "");
    if (!ObjectId.isValid(id)) return { ok: false, message: "This form is no longer available." };
    const result = await database.collection("qualityForms").updateOne(
      { _id: new ObjectId(id), isActive: { $ne: false } },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
    if (!result.matchedCount) return { ok: false, message: "This form no longer exists. Refresh the library and try again." };
    return { ok: true, id };
  } catch (error) {
    console.error("Could not archive quality form:", error.name, error.code || "");
    return { ok: false, message: "Form could not be deleted. Check the database connection and try again." };
  }
});

ipcMain.handle("quality-call-evaluations:list", async (event, employeeId, monthValue) => {
  try {
    const month = validateEvaluationMonth(monthValue);
    const database = await getDatabase();
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = await findSettingsActor(database, event, actorId);
    if (!actor) return { ok: false, message: "Sign in again before loading call evaluations." };
    if (actor.role !== "Admin" && !normalizeAccountPermissions(actor.permissions, actor.role).canEvaluate) {
      return { ok: false, message: "Your account does not have permission to evaluate calls." };
    }
    const { employee, team, targetCount } = await getEvaluationEmployee(database, employeeId);
    const formsCollection = database.collection("qualityForms");
    await formsCollection.createIndex({ teamIds: 1 }, {
      unique: true,
      name: "quality_form_team_active_unique",
      partialFilterExpression: { isActive: true, "teamIds.0": { $exists: true } },
    });
    const assignedForm = await formsCollection.findOne(
      { isActive: { $ne: false }, teamIds: team._id },
      { projection: { name: 1, questions: 1 } },
    );

    const evaluations = await database.collection("qualityCallEvaluations").find({
      employeeId: employee._id,
      month,
    }).sort({ callIndex: 1 }).toArray();

    return {
      ok: true,
      month,
      targetCount,
      savedCc: normalizeEmailList(actor.qualityEvaluationCc || []),
      employee: {
        id: employee._id.toString(),
        fullName: employee.fullName,
        employeeType: employee.employeeType,
        teamName: team.teamName,
        teamId: team._id.toString(),
        code3cx: employee.code3cx || "",
        awfarCode: employee.awfarCode || "",
      },
      forms: assignedForm ? [{ id: assignedForm._id.toString(), name: assignedForm.name, questions: assignedForm.questions }] : [],
      evaluations: evaluations.map((evaluation) => ({
        id: evaluation._id.toString(),
        callIndex: evaluation.callIndex,
        callReference: evaluation.callReference || "",
        formId: evaluation.formId?.toString() || null,
        formName: evaluation.formSnapshot?.name || (evaluation.formId ? "Saved form" : "Direct evaluation"),
        formSnapshot: evaluation.formSnapshot,
        evaluationMode: evaluation.evaluationMode || (evaluation.formId ? "form" : "direct"),
        answers: evaluation.answers,
        feedback: evaluation.feedback,
        score: evaluation.score,
        updatedAt: evaluation.updatedAt,
      })),
    };
  } catch (error) {
    if (error instanceof QualityFormValidationError) return { ok: false, message: error.message };
    console.error("Could not load call evaluations:", error.message);
    return { ok: false, message: "Call evaluations could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("quality-call-evaluations:save", async (event, input) => {
  try {
    const month = validateEvaluationMonth(input.month);
    const callIndex = Number(input.callIndex);
    const database = await getDatabase();
    const access = await requireAccountPermission(database, event, "canEvaluate");
    if (!access.ok) return access;
    const { employee, team, targetCount } = await getEvaluationEmployee(database, input.employeeId);
    if (!Number.isInteger(callIndex) || callIndex < 1 || callIndex > targetCount) {
      throw new QualityFormValidationError(`Call number must be between 1 and ${targetCount}.`);
    }
    if (input.mode === "direct") throw new QualityFormValidationError("Choose a saved form so the quality score can be calculated from the answers.");
    const evaluator = access.actor;
    const formsCollection = database.collection("qualityForms");
    await formsCollection.createIndex({ teamIds: 1 }, {
      unique: true,
      name: "quality_form_team_active_unique",
      partialFilterExpression: { isActive: true, "teamIds.0": { $exists: true } },
    });
    const form = await formsCollection.findOne({
      isActive: { $ne: false },
      teamIds: team._id,
    });
    if (!form) throw new QualityFormValidationError("No evaluation form is assigned to this employee's team. Ask an administrator to assign one.");

    const feedback = String(input.feedback || "").trim();
    const callReference = String(input.callReference || "").trim();
    const cc = normalizeEmailList(input.cc);
    if (!feedback) throw new QualityFormValidationError("Enter the call feedback.");
    if (feedback.length > 10000) throw new QualityFormValidationError("Feedback cannot exceed 10,000 characters.");
    if (callReference.length > 160) throw new QualityFormValidationError("Call reference cannot exceed 160 characters.");
    const answers = normalizeFormAnswers(form, input);
    const score = calculateQualityScore(form, answers);
    if (typeof input.rememberCc === "boolean") {
      const preferenceResult = await database.collection("users").updateOne(
        { _id: access.actor._id, isActive: { $ne: false } },
        input.rememberCc
          ? { $set: { qualityEvaluationCc: cc, updatedAt: new Date() } }
          : { $unset: { qualityEvaluationCc: "" }, $set: { updatedAt: new Date() } },
      );
      if (preferenceResult.matchedCount !== 1) {
        throw new Error("The signed-in account could not be updated.");
      }
    }

    const collection = database.collection("qualityCallEvaluations");
    await collection.createIndex({ employeeId: 1, month: 1, callIndex: 1 }, { unique: true, name: "quality_call_slot_unique" });
    const now = new Date();
    await collection.updateOne(
      { employeeId: employee._id, month, callIndex },
      {
        $set: {
          employeeId: employee._id,
          teamId: team._id,
          month,
          callIndex,
          callReference,
          evaluationMode: "form",
          formId: form._id,
          formSnapshot: { name: form.name, questions: form.questions },
          answers,
          feedback,
          score,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    const savedEvaluations = await collection.find({ employeeId: employee._id, month }).toArray();
    const averageScore = savedEvaluations.length
      ? savedEvaluations.reduce((total, evaluation) => total + Number(evaluation.score || 0), 0) / savedEvaluations.length
      : null;
    await database.collection("qualityEvaluations").updateOne(
      { employeeId: employee._id, month },
      { $set: { employeeId: employee._id, teamId: team._id, month, evaluatedCalls: savedEvaluations.length, qualityScore: averageScore, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );

    let emailStatus;
    try {
      emailStatus = await sendQualityEvaluationEmail({ employee, team, evaluator: { name: String(evaluator.name || evaluator.username || evaluator.email) }, month, callIndex, form, answers, feedback, score, callReference, cc });
    } catch (error) {
      console.error("Could not send quality evaluation email:", error.message);
      emailStatus = { state: "failed", message: "Evaluation saved, but the email could not be sent." };
    }
    return { ok: true, updatedAt: now, evaluatedCalls: savedEvaluations.length, qualityScore: averageScore, emailStatus };
  } catch (error) {
    if (error instanceof QualityFormValidationError) return { ok: false, message: error.message };
    if (error.code === 11000) return { ok: false, message: "This call slot was updated elsewhere. Refresh and try again." };
    console.error("Could not save call evaluation:", error.message);
    return { ok: false, message: "Call evaluation could not be saved. Check the database connection." };
  }
});

function dashboardTalkingSeconds(entry) {
  const seconds = Number(entry?.seconds);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const hours = Number(entry?.hours);
  if (Number.isFinite(hours) && hours > 0) return hours * 3600;
  return 0;
}

function dashboardLocalStamp(value = new Date()) {
  return {
    month: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`,
    date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
  };
}

function getMonthlyCustomKpiActual(employee, kpiName, month) {
  const monthValues = employee.customKpiAchievementsByMonth?.[month] || {};
  const storageKey = encodeURIComponent(kpiName).replaceAll(".", "%2E");
  if (Object.hasOwn(monthValues, storageKey)) return Number(monthValues[storageKey] ?? 0);
  return month === dashboardLocalStamp().month ? Number(employee.customKpiAchievements?.[kpiName] || 0) : 0;
}

function getMonthlyCustomKpiTarget(employee, kpiName, month) {
  const monthValues = employee.customKpiTargetsByMonth?.[month] || {};
  const storageKey = encodeURIComponent(kpiName).replaceAll(".", "%2E");
  if (!Object.hasOwn(monthValues, storageKey)) return 0;
  return Number(monthValues[storageKey] ?? 0);
}

function getEmployeeSalesSettings(employee, team) {
  const level = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "senior" : "agent";
  const teamSales = team?.performance?.[level] || {};
  const employeeTargets = employee.performanceTargets || {};
  const custom = employeeTargets.salesMode === "custom";
  return {
    enabled: custom || Boolean(team?.performance?.enabled),
    zones: custom ? employeeTargets.sales || {} : teamSales,
  };
}

function getEmployeeTalkingTimeTarget(employee, teamKpis) {
  const employeeTargets = employee.performanceTargets || {};
  if (employeeTargets.talkingTimeMode === "custom") return Number(employeeTargets.talkingTimeHours) || 0;
  const metric = teamKpis.talkingTimeHours;
  return metric?.enabled ? Number(metric.target || 0) : 0;
}

function getMonthlyManualKpi(employee, month) {
  const monthValues = employee.manualKpiByMonth || {};
  if (Object.hasOwn(monthValues, month)) return Number(monthValues[month] ?? 0);
  return month === dashboardLocalStamp().month ? Number(employee.manualKpi || 0) : 0;
}

function normalizeDashboardFilterPreset(input = {}) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Enter a name for this saved dashboard filter.");
  if (name.length > 80) throw new Error("Saved dashboard filter names cannot exceed 80 characters.");

  const config = input.config && typeof input.config === "object" ? input.config : {};
  const month = String(config.month || "");
  const date = String(config.date || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${month}-`)) {
    throw new Error("Choose a valid dashboard month and date before saving.");
  }
  const selectedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(selectedDate.getTime()) || selectedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Choose a valid dashboard month and date before saving.");
  }

  const numberInRange = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const normalizeMap = (value, convert) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key.slice(0, 120), convert(item)]));
  };

  return {
    name,
    config: {
      month,
      date,
      searchQuery: String(config.searchQuery || "").slice(0, 200),
      selectedTeam: String(config.selectedTeam || "all").slice(0, 160),
      selectedSalesZone: ["all", "Green", "Yellow", "Red", "Below"].includes(config.selectedSalesZone) ? config.selectedSalesZone : "all",
      kpiRange: {
        min: numberInRange(config.kpiRange?.min, 0, 0, 100),
        max: numberInRange(config.kpiRange?.max, 100, 0, 100),
      },
      sortField: /^[a-zA-Z0-9:_-]{1,120}$/.test(String(config.sortField || "")) ? String(config.sortField) : "totalKpi",
      sortDirection: config.sortDirection === "asc" ? "asc" : "desc",
      visibleColumns: normalizeMap(config.visibleColumns, (value) => value === true),
      columnWidths: normalizeMap(config.columnWidths, (value) => numberInRange(value, 120, 64, 1000)),
      rowHeight: numberInRange(config.rowHeight, 46, 36, 88),
      showFilters: config.showFilters === true,
      showColumnSelector: config.showColumnSelector === true,
    },
  };
}

async function getDashboardFilterActor(database, event) {
  const actorId = activeSettingsSessions.get(event.sender.id);
  return findSettingsActor(database, event, actorId);
}

ipcMain.handle("dashboard:filters-get", async (event) => {
  try {
    const database = await getDatabase();
    const actor = await getDashboardFilterActor(database, event);
    if (!actor) return { ok: false, message: "Sign in again before loading saved dashboard filters." };
    return {
      ok: true,
      presets: Array.isArray(actor.dashboardFilterPresets) ? actor.dashboardFilterPresets : [],
      defaultPresetId: actor.dashboardDefaultFilterPresetId || "",
    };
  } catch (error) {
    console.error("Could not load dashboard filter presets:", error.message);
    return { ok: false, message: "Saved dashboard filters could not be loaded." };
  }
});

ipcMain.handle("dashboard:filters-save", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actor = await getDashboardFilterActor(database, event);
    if (!actor) return { ok: false, message: "Sign in again before saving dashboard filters." };
    const normalized = normalizeDashboardFilterPreset(input);
    const presets = Array.isArray(actor.dashboardFilterPresets) ? actor.dashboardFilterPresets : [];
    const id = String(input.id || randomUUID());
    const existingIndex = presets.findIndex((preset) => preset.id === id);
    if (existingIndex < 0 && presets.length >= 30) {
      return { ok: false, message: "You can save up to 30 dashboard filters. Delete one before adding another." };
    }
    if (presets.some((preset) => preset.id !== id && preset.name.toLocaleLowerCase() === normalized.name.toLocaleLowerCase())) {
      return { ok: false, message: "A saved dashboard filter already uses this name." };
    }
    const now = new Date();
    const preset = { id, ...normalized, updatedAt: now };
    if (existingIndex < 0) presets.push({ ...preset, createdAt: now });
    else presets[existingIndex] = { ...presets[existingIndex], ...preset };

    const update = { $set: { dashboardFilterPresets: presets, updatedAt: now } };
    if (actor.dashboardDefaultFilterPresetId === id) update.$set.dashboardDefaultFilterPresetId = id;
    const result = await database.collection("users").updateOne(
      { _id: actor._id, isActive: { $ne: false } },
      update,
    );
    if (result.matchedCount !== 1) return { ok: false, message: "The signed-in account could not be updated." };
    return { ok: true, preset };
  } catch (error) {
    console.error("Could not save dashboard filter preset:", error.message);
    return { ok: false, message: error.message || "Dashboard filter could not be saved." };
  }
});

ipcMain.handle("dashboard:filters-delete", async (event, presetId) => {
  try {
    const database = await getDatabase();
    const actor = await getDashboardFilterActor(database, event);
    if (!actor) return { ok: false, message: "Sign in again before deleting dashboard filters." };
    const id = String(presetId || "");
    const presets = (Array.isArray(actor.dashboardFilterPresets) ? actor.dashboardFilterPresets : []).filter((preset) => preset.id !== id);
    if (presets.length === (actor.dashboardFilterPresets || []).length) {
      return { ok: false, message: "This saved dashboard filter no longer exists." };
    }
    const update = { $set: { dashboardFilterPresets: presets, updatedAt: new Date() } };
    if (actor.dashboardDefaultFilterPresetId === id) update.$unset = { dashboardDefaultFilterPresetId: "" };
    await database.collection("users").updateOne({ _id: actor._id, isActive: { $ne: false } }, update);
    return { ok: true, presetId: id };
  } catch (error) {
    console.error("Could not delete dashboard filter preset:", error.message);
    return { ok: false, message: "Saved dashboard filter could not be deleted." };
  }
});

ipcMain.handle("dashboard:filters-set-default", async (event, presetId) => {
  try {
    const database = await getDatabase();
    const actor = await getDashboardFilterActor(database, event);
    if (!actor) return { ok: false, message: "Sign in again before changing dashboard filter preferences." };
    const id = String(presetId || "");
    const presets = Array.isArray(actor.dashboardFilterPresets) ? actor.dashboardFilterPresets : [];
    if (id && !presets.some((preset) => preset.id === id)) {
      return { ok: false, message: "Choose one of your saved dashboard filters." };
    }
    const update = id
      ? { $set: { dashboardDefaultFilterPresetId: id, updatedAt: new Date() } }
      : { $unset: { dashboardDefaultFilterPresetId: "" }, $set: { updatedAt: new Date() } };
    const result = await database.collection("users").updateOne({ _id: actor._id, isActive: { $ne: false } }, update);
    if (result.matchedCount !== 1) return { ok: false, message: "The signed-in account could not be updated." };
    return { ok: true, defaultPresetId: id };
  } catch (error) {
    console.error("Could not update default dashboard filter:", error.message);
    return { ok: false, message: "Default dashboard filter could not be updated." };
  }
});

ipcMain.handle("dashboard:summary", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId
      ? await database.collection("users").findOne({ _id: new ObjectId(actorId) })
      : null;
    let employeeFilter = { employmentStatus: { $ne: "Resigned" } };
    if (actor?.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
      employeeFilter = {
        employmentStatus: { $ne: "Resigned" },
        teamId: { $in: actor.teamIds.map((id) => new ObjectId(String(id))) },
      };
    }
    return await getDashboardSummary(database, input, { employeeFilter });
  } catch (error) {
    if (error.name === "DashboardSummaryValidationError") return { ok: false, message: error.message };
    console.error("Dashboard summary failed:", error.message);
    return { ok: false, message: "Dashboard data could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("dashboard:send-email", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = await findSettingsActor(database, event, actorId);
    if (!actor) return { ok: false, message: "Sign in again before sending emails." };
    
    // Check email permission
    if (actor.role !== "Admin" && !normalizeAccountPermissions(actor.permissions, actor.role).canSendEmails) {
      return { ok: false, message: "Your account does not have permission to send emails." };
    }
    
    const { employees, visibleColumns, columnDefinitions, date, sortField, sortDirection } = input;
    
    // Validate date format
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, message: "Invalid date format for email report." };
    }
    
    if (!Array.isArray(employees) || employees.length === 0) {
      return { ok: false, message: "No employee data to send." };
    }

    const smtpHost = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
    const smtpUser = String(process.env.SMTP_USER || "orientgroup588@gmail.com").trim();
    const smtpPass = String(process.env.SMTP_PASS || "tcdl xccm yvae iqoh");
    const smtpFrom = String(process.env.SMTP_FROM || "Quality Operations \u003corientgroup588@gmail.com\u003e").trim();

    if (!smtpHost || !smtpFrom) {
      return { ok: false, message: "SMTP is not configured in .env file." };
    }

    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    });

    // Get unique team leader emails and employee emails
    const teamLeaderEmails = new Map();
    const employeeEmails = new Set();
    
    for (const employee of employees) {
      // Collect team leader emails
      if (employee.teamName && employee.teamLeaderEmail) {
        const email = String(employee.teamLeaderEmail).trim().toLowerCase();
        if (emailPattern.test(email)) {
          if (!teamLeaderEmails.has(email)) {
            teamLeaderEmails.set(email, { teamName: employee.teamName, name: employee.teamLeaderName || "Team Leader" });
          }
        }
      }
      
      // Collect employee emails
      if (employee.email) {
        const email = String(employee.email).trim().toLowerCase();
        if (emailPattern.test(email)) {
          employeeEmails.add(email);
        }
      }
    }

    // Combine all recipients (team leaders + employees)
    const allRecipients = [...new Set([...teamLeaderEmails.keys(), ...employeeEmails])];
    
    if (allRecipients.length === 0) {
      return { ok: false, message: "No email addresses found for the filtered employees or their team leaders." };
    }

    // Build HTML table
    const visibleDefs = columnDefinitions.filter((col) => visibleColumns[col.key]);
    
    const headerRow = visibleDefs.map((col) => 
      `<th style="padding:12px 16px;background:#2d4a3e;color:#fff;font-size:12px;font-weight:700;text-align:left;border-right:1px solid #1e352b;">${escapeEmailHtml(col.label)}</th>`
    ).join("");

    const dataRows = employees.map((employee) => {
      const cells = visibleDefs.map((col) => {
        let value = "—";
        if (col.key === "fullName") value = employee.fullName;
        else if (col.key === "code3cx") value = employee.code3cx || "—";
        else if (col.key === "awfarCode") value = employee.awfarCode || "—";
        else if (col.key === "teamName") value = employee.teamName;
        else if (col.key === "hireDate") value = employee.hireDate ? new Date(employee.hireDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
        else if (col.key === "sales") value = `${Number(employee.sales || 0).toLocaleString()} (${employee.salesZone || "N/A"})`;
        else if (col.key === "dailyCalls") value = Number(employee.dailyCalls || 0).toLocaleString();
        else if (col.key === "dailyTalkingTime") value = formatTime(employee.dailyTalkingTime);
        else if (col.key === "monthlyTalkingTime") value = formatTime(employee.monthlyTalkingTime);
        else if (col.key === "monthlyCalls") value = Number(employee.monthlyCalls || 0).toLocaleString();
        else if (col.key === "talkingTimePercent") value = `${formatNumber(employee.talkingTimePercent)}%`;
        else if (col.key === "callsPercent") value = `${formatNumber(employee.callsPercent)}%`;
        else if (col.key === "qualityPercent") value = `${formatNumber(employee.qualityPercent, 2)}%`;
        else if (col.key === "manualKpi") value = employee.manualKpi > 0 ? `${formatNumber(employee.manualKpi)}%` : "—";
        else if (col.key === "totalKpi") value = `${formatNumber(employee.totalKpi)}%`;
        else if (col.key.startsWith("custom:")) {
          const customName = col.customName;
          const kpi = (employee.customKpis || []).find((k) => k.name === customName);
          value = kpi ? `${formatNumber(k.weightedPercent)}% | ${Number(k.actual || 0).toLocaleString()} / ${Number(k.target || 0).toLocaleString()}` : "—";
        }
        
        const cellStyle = col.key === "totalKpi" 
          ? (employee.totalKpi >= 80 ? "background:#d4edda;color:#155724;" : employee.totalKpi >= 60 ? "background:#fff3cd;color:#856404;" : employee.totalKpi >= 40 ? "background:#f8d7da;color:#721c24;" : "background:#f5c6cb;color:#721c24;")
          : "";
        
        return `<td style="padding:12px 16px;border-bottom:1px solid #e8eee9;color:#24392d;font-size:12px;border-right:1px solid #e8eee9;${cellStyle}">${escapeEmailHtml(value)}</td>`;
      }).join("");
      
      return `<tr>${cells}</tr>`;
    }).join("");

    const dateLabel = date ? new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Current Date";
    const subject = `Dashboard Report | ${employees.length} Employees | ${dateLabel}`;
    
    const teamLeaderList = [...teamLeaderEmails.values()].map((tl) => 
      `<li style="margin-bottom:4px;color:#24392d;">${escapeEmailHtml(tl.name)} (${escapeEmailHtml(tl.teamName)})</li>`
    ).join("");
    
    const employeeList = employees.filter((e) => e.email).map((e) => 
      `<li style="margin-bottom:4px;color:#24392d;">${escapeEmailHtml(e.fullName)} (${escapeEmailHtml(e.teamName)})</li>`
    ).join("");
    
    const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f3f7f4;font-family:Segoe UI,Arial,sans-serif;color:#24392d;">
  <div style="max-width:1200px;margin:0 auto;background:#fff;border:1px solid #dce9df;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 30px;background:linear-gradient(135deg,#2d4a3e,#3d5a4e);border-bottom:1px solid #1e352b;">
      <div style="font-size:11px;letter-spacing:1.5px;font-weight:800;color:#a8c5b8;">NORTHSTAR QUALITY OPERATIONS</div>
      <h1 style="margin:10px 0 5px;font-size:28px;color:#fff;">Dashboard Performance Report</h1>
      <p style="margin:0;color:#d4e5d9;font-size:14px;">Employee performance data for ${escapeEmailHtml(dateLabel)}</p>
    </div>
    
    <div style="padding:24px 30px;">
      <div style="display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;padding:16px;background:#f8fbf8;border-radius:8px;border:1px solid #e8eee9;">
          <div style="font-size:11px;font-weight:700;color:#708077;text-transform:uppercase;letter-spacing:0.5px;">Total Employees</div>
          <div style="font-size:24px;font-weight:800;color:#2d4a3e;margin-top:4px;">${employees.length}</div>
        </div>
        <div style="flex:1;min-width:200px;padding:16px;background:#f8fbf8;border-radius:8px;border:1px solid #e8eee9;">
          <div style="font-size:11px;font-weight:700;color:#708077;text-transform:uppercase;letter-spacing:0.5px;">Report Date</div>
          <div style="font-size:14px;font-weight:600;color:#2d4a3e;margin-top:4px;">${escapeEmailHtml(dateLabel)}</div>
        </div>
        <div style="flex:1;min-width:200px;padding:16px;background:#f8fbf8;border-radius:8px;border:1px solid #e8eee9;">
          <div style="font-size:11px;font-weight:700;color:#708077;text-transform:uppercase;letter-spacing:0.5px;">Recipients</div>
          <div style="font-size:14px;font-weight:600;color:#2d4a3e;margin-top:4px;">${allRecipients.length}</div>
        </div>
      </div>

      <div style="margin-bottom:24px;padding:16px;background:#e8f6ec;border-radius:8px;border:1px solid #c3e6d0;">
        <div style="font-size:12px;font-weight:700;color:#21613d;margin-bottom:8px;">This report is being sent to:</div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#21613d;margin-bottom:4px;">Team Leaders (${teamLeaderEmails.size}):</div>
          <ul style="margin:0;padding-left:20px;">${teamLeaderList}</ul>
        </div>
        ${employeeList.length > 0 ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:#21613d;margin-bottom:4px;">Employees (${employeeList.length}):</div>
          <ul style="margin:0;padding-left:20px;">${employeeList}</ul>
        </div>
        ` : ""}
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12px;">
          <thead>
            <tr>${headerRow}</tr>
          </thead>
          <tbody>
            ${dataRows}
          </tbody>
        </table>
      </div>
      
      <div style="margin-top:24px;padding:16px;background:#fff8e1;border-left:4px solid #ffc107;border-radius:4px;">
        <div style="font-size:12px;font-weight:700;color:#856404;margin-bottom:4px;">Report Filters Applied</div>
        <div style="font-size:11px;color:#856404;line-height:1.6;">
          This report includes ${employees.length} employees based on the current dashboard filters and column visibility settings.
          Data is sorted by: ${escapeEmailHtml(sortField || "KPI")} (${sortDirection === "asc" ? "Ascending" : "Descending"}).
        </div>
      </div>
    </div>
    
    <div style="padding:16px 30px;background:#f8fbf8;border-top:1px solid #e8eee9;color:#829087;font-size:11px;">
      This email was generated automatically by Northstar Quality Operations Dashboard.<br>
      For questions or support, please contact your system administrator.
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: smtpFrom,
      to: allRecipients.join(", "),
      subject,
      text: `Dashboard Performance Report\n\nTotal Employees: ${employees.length}\nReport Date: ${dateLabel}\n\nThis report includes employee performance data based on current dashboard filters.`,
      html,
    });

    return { ok: true, message: `Email sent successfully to ${allRecipients.length} recipient(s) (${teamLeaderEmails.size} team leaders + ${employeeEmails.size} employees).` };
  } catch (error) {
    console.error("Could not send dashboard email:", error.message);
    return { ok: false, message: `Email could not be sent: ${error.message}` };
  }
});

ipcMain.handle("auth:load-remembered", async () => {
  if (!hasSecureStorage()) return { ok: true, credentials: null };

  try {
    const encrypted = await fs.readFile(getRememberedCredentialsPath());
    const credentials = JSON.parse(safeStorage.decryptString(encrypted));
    if (typeof credentials.identifier !== "string" || typeof credentials.password !== "string") {
      return { ok: false, message: "Saved sign-in details are invalid." };
    }
    return { ok: true, credentials };
  } catch (error) {
    if (error.code === "ENOENT") return { ok: true, credentials: null };
    console.error("Could not load saved sign-in details:", error.message);
    return { ok: false, message: "Saved sign-in details could not be read." };
  }
});

ipcMain.handle("auth:save-remembered", async (_event, credentials) => {
  const filePath = getRememberedCredentialsPath();

  try {
    if (!credentials?.remember) {
      await fs.rm(filePath, { force: true });
      return { ok: true };
    }

    if (!hasSecureStorage()) {
      return { ok: false, message: "Secure password storage is unavailable on this device." };
    }

    const identifier = String(credentials.identifier || "").trim();
    const password = String(credentials.password || "");
    if (!identifier || !password) {
      return { ok: false, message: "Enter your username and password before saving them." };
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify({ identifier, password }));
    await fs.writeFile(filePath, encrypted, { mode: 0o600 });
    return { ok: true };
  } catch (error) {
    console.error("Could not save sign-in details:", error.message);
    return { ok: false, message: "Sign-in details could not be saved securely." };
  }
});

// Alerts IPC handlers
ipcMain.handle("alerts:list", async (event, input = {}) => {
  try {
    const database = await getDatabase();
    const usersCollection = database.collection("users");
    const months = Number(input.months) || 3;
    const teamFilter = input.teamId || null;
    
    // Get current user for filtering
    const actorId = activeSettingsSessions.get(event.sender.id);
    const actor = actorId ? await usersCollection.findOne({ _id: new ObjectId(actorId) }) : null;

    // Calculate the date threshold (X months ago)
    const today = new Date();
    const thresholdDate = new Date(today.getFullYear(), today.getMonth() - months, 1);
    const thresholdMonth = `${thresholdDate.getFullYear()}-${String(thresholdDate.getMonth() + 1).padStart(2, "0")}`;
    
    // Build match condition
    const matchCondition = { employmentStatus: { $ne: "Resigned" } };
    
    // Apply role-based filtering
    if (actor) {
      if (actor.role === "Quality") {
        // Quality sees only employees from teams assigned to them
        const qualityTeams = await database.collection("teams").find(
          { qualityOwnerId: String(actor._id) },
          { projection: { _id: 1 } }
        ).toArray();
        const qualityTeamIds = qualityTeams.map((team) => team._id);
        matchCondition.teamId = { $in: qualityTeamIds };
      } else if (actor.role === "Team Leader" && Array.isArray(actor.teamIds) && actor.teamIds.length > 0) {
        // Team Leader sees only employees from their assigned teams
        matchCondition.teamId = { $in: actor.teamIds.map((id) => new ObjectId(String(id))) };
      }
      // Manager and Admin see all teams (no additional filter needed)
    }
    
    // If teamFilter is explicitly provided in input, it overrides role-based filtering
    if (teamFilter && ObjectId.isValid(String(teamFilter))) {
      matchCondition.teamId = new ObjectId(String(teamFilter));
    }
    
    // Use aggregation with better performance - get all data in one query
    // Add projection to limit fields returned
    const employees = await database.collection("employees").aggregate([
      { $match: matchCondition },
      { $project: {
        _id: 1,
        fullName: 1,
        fullNameLower: 1,
        code3cx: 1,
        awfarCode: 1,
        email: 1,
        teamId: 1,
        hireDate: 1,
        employeeType: 1,
        actionPlan: 1,
        manualKpi: 1,
        customKpiAchievements: 1,
        manualKpiByMonth: 1,
        customKpiAchievementsByMonth: 1,
        customKpiTargetsByMonth: 1,
        performanceTargets: 1,
      }},
      { $lookup: { from: "teams", localField: "teamId", foreignField: "_id", as: "team" } },
      { $unwind: "$team" },
      { $lookup: { 
        from: "qualityEvaluations", 
        let: { employeeId: "$_id" },
        pipeline: [
          { $match: { 
            $expr: { $eq: ["$employeeId", "$$employeeId"] },
            month: { $gte: thresholdMonth }
          }},
          { $project: {
            month: 1,
            sales: 1,
            qualityScore: 1,
            evaluatedCalls: 1,
          }},
          { $sort: { month: 1 } }
        ],
        as: "qualityEvaluations"
      }},
      { $lookup: {
        from: "callsTrackingEntries",
        let: { employeeId: "$_id" },
        pipeline: [
          { $match: {
            $expr: { $eq: ["$employeeId", "$$employeeId"] },
            month: { $gte: thresholdMonth }
          }},
          { $project: {
            month: 1,
            date: 1,
            calls: 1,
            status: 1,
          }},
        ],
        as: "callsByMonth"
      }},
      { $lookup: {
        from: "talkingTimeEntries",
        let: { employeeId: "$_id" },
        pipeline: [
          { $match: {
            $expr: { $eq: ["$employeeId", "$$employeeId"] },
            month: { $gte: thresholdMonth }
          }},
          { $project: {
            month: 1,
            seconds: 1,
          }},
          { $group: { _id: "$month", totalSeconds: { $sum: "$seconds" } } }
        ],
        as: "talkingTimeByMonth"
      }},
      { $sort: { "team.teamName": 1, fullNameLower: 1 } }
    ]).toArray();

    const employeesWithAlerts = [];
    
    for (const employee of employees) {
      const employeeId = employee._id.toString();
      const employeeType = String(employee.employeeType || "Agent").toLowerCase() === "senior" ? "senior" : "agent";
      const teamKpis = employee.team.kpis?.[employeeType] || {};
      const salesSettings = getEmployeeSalesSettings(employee, employee.team);
      const teamPerformance = salesSettings.zones;
      const salesEnabled = salesSettings.enabled;

      // Calculate monthly data
      const monthlyData = [];
      let monthsInRedZone = 0;
      
      // Create a map for calls by month (with daily breakdown)
      const callsByMonthMap = new Map();
      for (const c of employee.callsByMonth || []) {
        const monthKey = c.month;
        if (!callsByMonthMap.has(monthKey)) {
          callsByMonthMap.set(monthKey, {});
        }
        if (c.date && c.calls !== undefined) {
          callsByMonthMap.get(monthKey)[c.date] = { calls: Number(c.calls || 0), status: c.status };
        }
      }
      
      // Create a map for talking time by month
      const talkingTimeMap = new Map();
      for (const t of employee.talkingTimeByMonth || []) {
        talkingTimeMap.set(t._id, t.totalSeconds);
      }
      
      for (let i = 0; i < months; i++) {
        const checkDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}`;
        
        const monthQuality = employee.qualityEvaluations?.find(q => q.month === monthKey);
        const employeeCalls = callsByMonthMap.get(monthKey) || {};
        const totalCalls = Object.values(employeeCalls).reduce((sum, entry) => sum + (entry.calls || 0), 0);
        const totalSeconds = talkingTimeMap.get(monthKey) || 0;
        
        // Format talking time as hours:minutes
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const talkingTimeStr = totalSeconds > 0 ? `${hours}h ${minutes}m` : "0h 0m";
        
        // Calculate KPI components (same as dashboard)
        const qualityScore = monthQuality?.qualityScore || 0;
        const evaluatedCallsWeight = teamKpis.evaluatedCalls?.enabled ? Number(teamKpis.evaluatedCalls.weight || 0) : 0;
        const qualityWeightedPercent = evaluatedCallsWeight > 0 ? (qualityScore / 100) * evaluatedCallsWeight : 0;
        
        const talkingTimeTargetHours = getEmployeeTalkingTimeTarget(employee, teamKpis);
        const talkingTimeWeight = teamKpis.talkingTimeHours?.enabled ? Number(teamKpis.talkingTimeHours.weight || 0) : 0;
        const talkingTimeTargetSeconds = talkingTimeTargetHours * 3600;
        const talkingTimeAchievement = talkingTimeTargetSeconds > 0
          ? Math.min((totalSeconds / talkingTimeTargetSeconds) * 100, 100)
          : 0;
        const talkingTimeWeightedPercent = talkingTimeTargetSeconds > 0 && talkingTimeWeight > 0
          ? Math.min((totalSeconds / talkingTimeTargetSeconds) * talkingTimeWeight, talkingTimeWeight)
          : 0;
        
        const callsTarget = teamKpis.dailyCalls?.enabled ? Number(teamKpis.dailyCalls.target || 0) : 0;
        const callsWeight = teamKpis.dailyCalls?.enabled ? Number(teamKpis.dailyCalls.weight || 0) : 0;
        // Calculate calls exactly like dashboard
        const callDayEntries = Object.values(employeeCalls);
        const callWorkDays = callDayEntries.filter((entry) => Number(entry.calls) > 0).length;
        const callTargetDays = callsTarget > 0
          ? callDayEntries.filter((entry) => Number(entry.calls) > 0 && Number(entry.calls) >= callsTarget).length
          : 0;
        const callsAchievement = callWorkDays > 0 ? (callTargetDays / callWorkDays) * 100 : 0;
        const callsWeightedPercent = callsWeight > 0 && callWorkDays > 0
          ? callsWeight * (callTargetDays / callWorkDays)
          : 0;
        
        // Custom KPIs - calculate from employee's customKpiAchievements
        const customKpis = Array.isArray(teamKpis.custom) && teamKpis.custom.length
          ? teamKpis.custom
          : (Array.isArray(teamKpis.customKPIs) ? teamKpis.customKPIs : []);
        const customKpiResults = [];
        let customKpiWeightedTotal = 0;

        for (const customKpi of customKpis) {
          if (customKpi.enabled === false) continue;
          const customName = String(customKpi.name || "").trim();
          if (!customName) continue;
          const customTarget = getMonthlyCustomKpiTarget(employee, customName, monthKey);
          const customWeight = Number(customKpi.weight || 0);
          const customActual = getMonthlyCustomKpiActual(employee, customName, monthKey);
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
          customKpiWeightedTotal += customWeightedPercent;
        }
        
        // Calculate total KPI (same as dashboard)
        const totalKpi = talkingTimeWeightedPercent + callsWeightedPercent + qualityWeightedPercent + customKpiWeightedTotal;
        
        // Determine sales zone (same as dashboard)
        const sales = monthQuality?.sales || 0;
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
          // If sales system is not enabled for this team, treat as Yellow zone
          salesZone = "Yellow";
        }
        
        // Apply zone logic to total KPI (same as dashboard)
        let finalKpi = totalKpi;
        if (salesZone === "Green") {
          // If green zone override is enabled, use calculated KPI; otherwise set to 100%
          finalKpi = teamPerformance.greenZoneOverride ? totalKpi : 100;
        } else if (salesZone === "Red") {
          // If red zone override is enabled, use calculated KPI; otherwise set to 0%
          finalKpi = teamPerformance.redZoneOverride ? totalKpi : 0;
        }
        // For Yellow zone or when sales is not enabled, use the calculated totalKpi

        // Apply manual KPI override if set (same as dashboard)
        const manualKpi = getMonthlyManualKpi(employee, monthKey);
        if (manualKpi > 0) {
          finalKpi = manualKpi;
        }
        
        // Determine if in red zone this month
        let inRedZone = false;
        
        if (salesEnabled) {
          // If sales is enabled, check sales zone
          const redFrom = Number(teamPerformance.red?.from) || 0;
          const redTo = Number(teamPerformance.red?.to) || Infinity;
          
          // Check if sales is in red zone (either in range or below)
          if (sales <= redTo) {
            inRedZone = true;
          }
        } else {
          // If sales not enabled, check KPI
          if (finalKpi < 80) {
            inRedZone = true;
          }
        }
        
        if (inRedZone) {
          monthsInRedZone++;
        }
        
        monthlyData.push({
          month: checkDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          sales,
          calls: totalCalls,
          qualityWeightedPercent: evaluatedCallsWeight > 0 ? qualityWeightedPercent : undefined,
          talkingTime: talkingTimeStr,
          kpi: finalKpi,
          inRedZone,
        });
      }

      // Only include if they've been in red zone for the specified months
      if (monthsInRedZone >= months) {
        employeesWithAlerts.push({
          id: employeeId,
          fullName: employee.fullName,
          code3cx: employee.code3cx || "",
          awfarCode: employee.awfarCode || "",
          email: employee.email || "",
          teamName: employee.team.teamName,
          teamId: employee.teamId?.toString() || "",
          teamLeaderEmail: employee.team.teamLeader?.email || "",
          teamLeaderName: employee.team.teamLeader?.name || "",
          hireDate: employee.hireDate,
          employeeType: employee.employeeType || "Agent",
          monthsInRedZone,
          performanceData: monthlyData,
          actionPlan: employee.actionPlan || null,
        });
      }
    }

    // Get only teams that have employees with alerts for filter
    const teamIdsWithAlerts = new Set(employeesWithAlerts.map((e) => e.teamId).filter(Boolean));
    const teams = teamIdsWithAlerts.size > 0 
      ? await database.collection("teams").find({ _id: { $in: [...teamIdsWithAlerts].map((id) => new ObjectId(String(id))) } }).toArray()
      : [];

    return {
      ok: true,
      employees: employeesWithAlerts,
      months,
      teams: teams.map((t) => ({ id: t._id.toString(), teamName: t.teamName })),
    };
  } catch (error) {
    console.error("Could not load alerts data:", error.message);
    return { ok: false, message: "Alerts data could not be loaded. Check the database connection." };
  }
});

ipcMain.handle("alerts:saveActionPlan", async (_event, input = {}) => {
  try {
    const database = await getDatabase();
    const { employeeId, strengths, weaknesses, nextSteps } = input;
    
    if (!ObjectId.isValid(String(employeeId || ""))) {
      return { ok: false, message: "Invalid employee ID." };
    }

    const now = new Date();
    const result = await database.collection("employees").updateOne(
      { _id: new ObjectId(String(employeeId)) },
      {
        $set: {
          actionPlan: {
            strengths: String(strengths || "").trim(),
            weaknesses: String(weaknesses || "").trim(),
            nextSteps: String(nextSteps || "").trim(),
            updatedAt: now,
          },
          updatedAt: now,
        },
      }
    );

    if (!result.matchedCount) {
      return { ok: false, message: "Employee not found." };
    }

    return { ok: true, message: "Action Plan saved successfully." };
  } catch (error) {
    console.error("Could not save action plan:", error.message);
    return { ok: false, message: "Action Plan could not be saved. Check the database connection." };
  }
});

ipcMain.handle("alerts:sendWarningEmail", async (_event, input = {}) => {
  try {
    const { recipients, cc, dataOptions, months } = input;
    
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return { ok: false, message: "No recipients selected." };
    }

    const smtpHost = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
    const smtpUser = String(process.env.SMTP_USER || "orientgroup588@gmail.com").trim();
    const smtpPass = String(process.env.SMTP_PASS || "tcdl xccm yvae iqoh");
    const smtpFrom = String(process.env.SMTP_FROM || "Quality Operations \u003corientgroup588@gmail.com\u003e").trim();

    if (!smtpHost || !smtpFrom) {
      return { ok: false, message: "SMTP is not configured in .env file." };
    }

    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    });

    // Collect all unique email addresses
    const allEmails = new Set();
    recipients.forEach((r) => {
      if (r.email && emailPattern.test(r.email)) allEmails.add(r.email);
      if (r.teamLeaderEmail && emailPattern.test(r.teamLeaderEmail)) allEmails.add(r.teamLeaderEmail);
    });
    
    // Add CC emails
    cc.forEach((email) => {
      if (email && emailPattern.test(email)) allEmails.add(email);
    });

    const emailList = [...allEmails];
    if (emailList.length === 0) {
      return { ok: false, message: "No valid email addresses found." };
    }

    // Build email content
    const employeeRows = recipients.map((emp) => {
      let performanceTableHtml = "";
      if (dataOptions.includePerformanceMetrics && emp.performanceData) {
        let tableHeaders = '<th style="padding:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #991b1b;">Month</th>';
        let tableRows = '';
        
        if (dataOptions.includeSales) tableHeaders += '<th style="padding:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #991b1b;">Sales</th>';
        if (dataOptions.includeCalls) tableHeaders += '<th style="padding:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #991b1b;">Calls</th>';
        if (dataOptions.includeQualityPercent) tableHeaders += '<th style="padding:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #991b1b;">Quality %</th>';
        if (dataOptions.includeTalkTime) tableHeaders += '<th style="padding:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #991b1b;">Talk Time</th>';
        if (dataOptions.includeKPI) tableHeaders += '<th style="padding:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #991b1b;">Total KPI</th>';
        
        emp.performanceData.forEach((m) => {
          tableRows += '<tr style="border-bottom:1px solid #fecaca;">';
          tableRows += `<td style="padding:10px;font-size:13px;font-weight:700;color:#dc2626;">${escapeEmailHtml(m.month)} ${m.inRedZone ? '⚠️' : ''}</td>`;
          if (dataOptions.includeSales) tableRows += `<td style="padding:10px;font-size:13px;">${formatNumber(m.sales, 0)}</td>`;
          if (dataOptions.includeCalls) tableRows += `<td style="padding:10px;font-size:13px;">${formatNumber(m.calls, 0)}</td>`;
          if (dataOptions.includeQualityPercent) tableRows += `<td style="padding:10px;font-size:13px;">${m.qualityWeightedPercent !== undefined ? formatNumber(m.qualityWeightedPercent, 0) + '%' : '—'}</td>`;
          if (dataOptions.includeTalkTime) tableRows += `<td style="padding:10px;font-size:13px;">${escapeEmailHtml(m.talkingTime)}</td>`;
          if (dataOptions.includeKPI) tableRows += `<td style="padding:10px;font-size:13px;font-weight:700;color:${m.kpi < 80 ? '#dc2626' : '#059669'};">${formatNumber(m.kpi, 0)}%</td>`;
          tableRows += '</tr>';
        });
        
        performanceTableHtml = `
          <div style="margin-top:16px;">
            <div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:8px;">PERFORMANCE DATA (Last ${months} Month${months > 1 ? 's' : ''}):</div>
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
              <thead><tr>${tableHeaders}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        `;
      }

      let actionPlanHtml = "";
      if (dataOptions.includeActionPlan && emp.actionPlan) {
        actionPlanHtml = `
          <div style="margin-top:16px;padding:16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;">
            <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:12px;">ACTION PLAN:</div>
            ${emp.actionPlan.strengths ? `<div style="margin-bottom:10px;"><strong style="color:#059669;display:block;margin-bottom:4px;">Strengths:</strong> <span style="color:#1f2937;line-height:1.5;">${escapeEmailHtml(emp.actionPlan.strengths)}</span></div>` : ""}
            ${emp.actionPlan.weaknesses ? `<div style="margin-bottom:10px;"><strong style="color:#dc2626;display:block;margin-bottom:4px;">Weaknesses:</strong> <span style="color:#1f2937;line-height:1.5;">${escapeEmailHtml(emp.actionPlan.weaknesses)}</span></div>` : ""}
            ${emp.actionPlan.nextSteps ? `<div><strong style="color:#1d4ed8;display:block;margin-bottom:4px;">Next Steps:</strong> <span style="color:#1f2937;line-height:1.5;">${escapeEmailHtml(emp.actionPlan.nextSteps)}</span></div>` : ""}
          </div>
        `;
      }

      return `
        <div style="margin-bottom:24px;padding:20px;background:#fff;border:2px solid #dc2626;border-radius:12px;box-shadow:0 2px 8px rgba(220,38,38,0.1);">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:0;">
                <h3 style="margin:0 0 4px 0;font-size:20px;font-weight:800;color:#dc2626;">${escapeEmailHtml(emp.fullName)}</h3>
                <p style="margin:0;color:#6b7280;font-size:14px;">${escapeEmailHtml(emp.teamName)} • ${escapeEmailHtml(emp.employeeType)}</p>
              </td>
              <td style="text-align:right;vertical-align:top;">
                <div style="display:inline-block;padding:8px 16px;background:#dc2626;color:#fff;border-radius:20px;font-size:13px;font-weight:700;text-transform:uppercase;">
                  ${emp.monthsInRedZone} Month${emp.monthsInRedZone > 1 ? 's' : ''} in Red Zone
                </div>
              </td>
            </tr>
          </table>
          
          ${dataOptions.includeEmployeeData ? `
            <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#f9fafb;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                  <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;">3CX Code</div>
                  <div style="font-size:15px;font-weight:700;color:#1f2937;margin-top:2px;">${escapeEmailHtml(emp.code3cx || "—")}</div>
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                  <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;">Awfar Code</div>
                  <div style="font-size:15px;font-weight:700;color:#1f2937;margin-top:2px;">${escapeEmailHtml(emp.awfarCode || "—")}</div>
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                  <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;">Hire Date</div>
                  <div style="font-size:15px;font-weight:700;color:#1f2937;margin-top:2px;">${escapeEmailHtml(emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—")}</div>
                </td>
              </tr>
              ${dataOptions.includeTeamLeaderInfo ? `
                <tr>
                  <td colspan="3" style="padding:12px 16px;">
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;">Team Leader</div>
                    <div style="font-size:15px;font-weight:700;color:#1f2937;margin-top:2px;">${escapeEmailHtml(emp.teamLeaderName || "—")}</div>
                    <div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeEmailHtml(emp.teamLeaderEmail || "—")}</div>
                  </td>
                </tr>
              ` : ""}
            </table>
          ` : ""}
          
          ${performanceTableHtml}
          ${actionPlanHtml}
        </div>
      `;
    }).join("");

    const subject = `⚠️ PERFORMANCE WARNING ALERT - ${recipients.length} Employee${recipients.length > 1 ? 's' : ''} at Risk`;
    
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Warning Alert</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;line-height:1.6;">
  <div style="max-width:1000px;margin:0 auto;background:#fff;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);padding:40px 32px;text-align:center;">
      <div style="font-size:12px;letter-spacing:3px;font-weight:900;color:#fecaca;text-transform:uppercase;margin-bottom:12px;">NORTHSTAR QUALITY OPERATIONS</div>
      <h1 style="margin:0;font-size:42px;color:#fff;font-weight:900;letter-spacing:-1px;">⚠️ PERFORMANCE WARNING</h1>
      <p style="margin:12px 0 0 0;color:#fecaca;font-size:18px;font-weight:600;">Employees requiring immediate attention</p>
    </div>
    
    <!-- Content -->
    <div style="padding:40px 32px;">
      <!-- Alert Summary -->
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:20px 24px;border-radius:0 8px 8px 0;margin-bottom:32px;">
        <div style="font-size:14px;font-weight:800;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">ALERT SUMMARY</div>
        <div style="font-size:16px;color:#1f2937;">
          <strong>${recipients.length} employee${recipients.length > 1 ? 's' : ''}</strong> ha${recipients.length > 1 ? 've' : 's'} been in the 
          <strong style="color:#dc2626;">RED ZONE</strong> for <strong>${months} month${months > 1 ? 's' : ''}</strong> or more.
          Immediate action is required to improve performance.
        </div>
      </div>

      <!-- Employee Details -->
      ${employeeRows}
      
      <!-- Next Steps -->
      <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:24px;border-radius:0 8px 8px 0;margin-top:32px;">
        <div style="font-size:14px;font-weight:800;color:#1d4ed8;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">RECOMMENDED ACTIONS</div>
        <div style="font-size:15px;color:#1e40af;">
          <ol style="margin:0;padding-left:20px;line-height:2;">
            <li>Review each employee's performance data above</li>
            <li>Discuss with the employee their challenges and areas for improvement</li>
            <li>Create and implement a comprehensive action plan</li>
            <li>Monitor progress weekly and provide regular feedback</li>
            <li>Document all discussions and follow-up meetings</li>
          </ol>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
      <div style="font-size:13px;color:#6b7280;line-height:1.6;">
        <strong style="color:#1f2937;">This is an automated warning email from Northstar Quality Operations.</strong><br>
        Please address these performance issues immediately.<br>
        For questions or support, contact your system administrator.
      </div>
      <div style="margin-top:16px;font-size:12px;color:#9ca3af;">
        Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: smtpFrom,
      to: emailList.join(", "),
      subject,
      text: `PERFORMANCE WARNING ALERT\n\n${recipients.length} employee(s) have been in the RED ZONE for ${months} month(s) or more.\n\nImmediate action is required to improve performance.`,
      html,
    });

    return { ok: true, message: `Warning email sent successfully to ${emailList.length} recipient(s).` };
  } catch (error) {
    console.error("Could not send warning email:", error.message);
    return { ok: false, message: `Email could not be sent: ${error.message}` };
  }
});

// IPC handlers for manual update control
ipcMain.handle("updater:check", async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    console.error("Update check failed:", error);
    return { ok: false, message: error.message };
  }
});

ipcMain.handle("updater:download", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    console.error("Update download failed:", error);
    return { ok: false, message: error.message };
  }
});

ipcMain.handle("updater:install", async () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (error) {
    console.error("Update install failed:", error);
    return { ok: false, message: error.message };
  }
});

// Auto-updater configuration
autoUpdater.setFeedURL({
  provider: "generic",
  url: "https://masar-indol-nine.vercel.app/updates",
});

// Auto-updater event listeners
autoUpdater.on("checking-for-update", () => {
  console.log("Checking for updates...");
  if (mainWindow) {
    mainWindow.webContents.send("update-status", { status: "checking" });
  }
});

autoUpdater.on("update-available", (info) => {
  console.log("Update available:", info);
  if (mainWindow) {
    mainWindow.webContents.send("update-status", { status: "available", info });
  }
});

autoUpdater.on("update-not-available", (info) => {
  console.log("Update not available:", info);
  if (mainWindow) {
    mainWindow.webContents.send("update-status", { status: "not-available", info });
  }
});

autoUpdater.on("error", (err) => {
  console.error("Update error:", err);
  if (mainWindow) {
    mainWindow.webContents.send("update-status", { status: "error", error: err.message });
  }
});

autoUpdater.on("download-progress", (progressObj) => {
  console.log("Download progress:", progressObj);
  if (mainWindow) {
    mainWindow.webContents.send("update-status", { status: "downloading", progress: progressObj });
  }
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("Update downloaded:", info);
  if (mainWindow) {
    mainWindow.webContents.send("update-status", { status: "downloaded", info });
  }
});

// Check for updates when app is ready (only in production)
app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  console.log("All desktop windows closed.");
  if (mongoClient) void mongoClient.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  console.log("Electron is shutting down.");
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});