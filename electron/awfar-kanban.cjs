const {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} = require("node:crypto");

const API_BASE = "https://whatsapi.awfar.io/api";
const EMBEDDED_ENCRYPTION_KEY = createHash("sha256")
  .update("Northstar Quality Operations: Awfar Kanban credentials v1")
  .digest();
const REQUEST_TIMEOUT = 30000;
const PAGE_SIZE = 1000;
const CONCURRENCY = 10;
const MAX_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const CAMPAIGNS = [
  ["عمرة اسيوط", "6a4e5f4dbd8c422781900226"],
  ["تيسير اسيوط", "6a4ceeb454d623325069bc3e"],
  ["حج همسه", "6a2167696a7cef25124dd5a7"],
  ["حج اليماني", "6a1d78492e51b02fdb9fbfbd"],
  ["hamsa", "69ca532e3f4a19d533b0dc63"],
  ["اورينت عمرة", "6a5d09a1f1211c6b96b9ea50"],
  ["orient hajj", "6a2428bb6e6216bb0a5ce4e1"],
  ["كاش مطروح", "6a5f4e2d992ba720b984fd02"],
  ["رشيد كاش", "6a5f3f1524d893c8c6ef3898"],
  ["cash crown", "6a5e01745d47ccdf9bc4dccf"],
  ["cash hamsaa", "6a5e026a9c770f9695fe9eb3"],
  ["crown", "69edee9eac4adeb547d2de03"],
  ["crown haj", "6a2d51d57cdd4e71a7a6299f"],
  ["elymany", "69ee257d2dde9b1a611fd4d9"],
  ["elymany cash", "6a5dff0a5d47ccdf9bc3deb3"],
  ["حج اسيوط", "6a4e33ae0bd57d938a5caba9"],
  ["orient tours tayseer", "69eded1eefc40e1761ac2c72"],
  ["عملاء مبادرة تيسير", "696669536deb06506ee4b031"],
  ["يمانيي رشيد حج", "6a3c355c2c3affc88710708a"],
  ["يمانى مطروح", "69cbc6154522f5be498f1409"],
  ["يمانى رشيد", "69cbca12901405fa4b74cbb6"],
  ["cashh sohag", "6aa2a1fae432515cdfeccad5"],
  ["haj sohag", "6aa27b452a01bd2d6bc2f7ea"],
  ["taisser sohag", "6aa27cacd2802e47b6f82eac"],
];

const STATUSES = [
  ["pending", "Pending", { status: "606dd8793a62b5c4cad30ca7" }],
  ["processing", "Processing", { status: "606dd8b43a62b5c4cad30ca8" }],
  ["follow_up", "Follow Up", { status: "606dd8fa3a62b5c4cad30ca9" }],
  ["done", "Done", { status: "6072f41052adaf0bd560bc8e" }],
  ["unassigned", "Unassigned", { status: "9" }],
  ["unread", "Unread", { unread: true }],
];

function encryptWithKey(credentials, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("hex")).join(":");
}

function encryptCredentials(credentials) {
  return encryptWithKey(credentials, EMBEDDED_ENCRYPTION_KEY);
}

function decryptWithKey(encrypted, key) {
  const parts = String(encrypted || "").split(":");
  if (parts.length !== 3 || parts.some((part) => !/^[a-fA-F0-9]+$/.test(part))) {
    throw new Error("The saved Awfar credentials are invalid. Save them again in Settings.");
  }
  const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, "hex"));
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error("The saved Awfar credentials are invalid. Save them again in Settings.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const credentials = JSON.parse(plaintext);
  if (!credentials.username || !credentials.password) {
    throw new Error("The saved Awfar credentials are incomplete. Save them again in Settings.");
  }
  return credentials;
}

function decryptCredentials(encrypted) {
  try {
    return decryptWithKey(encrypted, EMBEDDED_ENCRYPTION_KEY);
  } catch {
    const legacyKey = String(process.env.AWFAR_KANBAN_ENCRYPTION_KEY || "").trim();
    if (!/^[a-fA-F0-9]{64}$/.test(legacyKey)) {
      throw new Error("Saved Awfar credentials cannot be decrypted. Enter the Awfar password and save the credentials again.");
    }
    try {
      return decryptWithKey(encrypted, Buffer.from(legacyKey, "hex"));
    } catch {
      throw new Error("Saved Awfar credentials cannot be decrypted. Enter the Awfar password and save the credentials again.");
    }
  }
}

function extractAuthValues(payload) {
  let token = "";
  let socketUrl = "";
  const pending = [payload];
  while (pending.length) {
    const current = pending.shift();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    token ||= current.accessToken || current.access_token || current.token || "";
    socketUrl ||= current.socketUrl || current.socket_url || current.socketURL || "";
    pending.push(...Object.values(current).filter((value) => value && typeof value === "object"));
  }
  return { token, socketUrl };
}

function extractContacts(payload) {
  if (Array.isArray(payload)) {
    if (payload.length && payload.every((item) => item && typeof item === "object")
      && payload.some((item) => ["_id", "instance", "remoteJid", "lastMessage"].some((key) => key in item))) {
      return payload;
    }
    for (const item of payload) {
      const contacts = extractContacts(item);
      if (contacts.length) return contacts;
    }
  } else if (payload && typeof payload === "object") {
    for (const key of ["contacts", "data", "results", "items", "docs"]) {
      const contacts = extractContacts(payload[key]);
      if (contacts.length) return contacts;
    }
  }
  return [];
}

function getAgentName(contact) {
  const agentName = contact?.agent && typeof contact.agent === "object"
    ? contact.agent.name
    : null;
  return String(agentName || contact?.lastAssignAgent || "Unassigned").trim() || "Unassigned";
}

async function readJsonResponse(response, failureMessage) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(failureMessage);
  }
  if (!payload || typeof payload !== "object") throw new Error(failureMessage);
  return payload;
}

async function login(credentials, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_name: credentials.username, password: credentials.password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const payload = await readJsonResponse(response, "Awfar returned an invalid sign-in response.");
  const { token, socketUrl } = extractAuthValues(payload);
  if (!response.ok || !token || !socketUrl) {
    throw new Error("Awfar sign-in failed. Check the saved username and password.");
  }
  if (!String(socketUrl).replace(/\/+$/, "").endsWith("/admin")) {
    throw new Error("The saved Awfar account is not authorized to access the campaign dashboard.");
  }
  return token;
}

class AwfarHttpError extends Error {
  constructor(status) {
    super(`Awfar campaign request failed (HTTP ${status}).`);
    this.status = status;
  }
}

async function fetchAgentCounts(token, instance, filter, fetchImpl = fetch) {
  const counts = new Map();
  let page = 1;
  let totalCount = null;
  let received = 0;
  while (totalCount === null || received < totalCount) {
    const response = await fetchImpl(`${API_BASE}/contactSearch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: { instance, type: "All", filters: filter },
        paging: { page, pageSize: PAGE_SIZE },
        sorting: { isPin: -1, "lastMessage.time": -1 },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (response.status === 401 || response.status === 403) {
      const error = new Error("Awfar rejected access to campaign data. The account may not have access to this campaign.");
      error.status = response.status;
      throw error;
    }
    if (!response.ok) throw new AwfarHttpError(response.status);
    const payload = await readJsonResponse(response, "Awfar returned an invalid campaign response.");
    const contacts = extractContacts(payload);
    if (typeof payload.totalCount === "number" && Number.isFinite(payload.totalCount)) {
      totalCount = payload.totalCount;
    }
    received += contacts.length;
    for (const contact of contacts) {
      const agentName = getAgentName(contact).toLocaleLowerCase();
      counts.set(agentName, (counts.get(agentName) || 0) + 1);
    }
    if (contacts.length < PAGE_SIZE || !contacts.length) break;
    page += 1;
  }
  return counts;
}

function isRetryableError(error) {
  if (RETRYABLE_HTTP_STATUSES.has(error?.status)) return true;
  return ["AbortError", "TimeoutError"].includes(error?.name) || error instanceof TypeError;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchKanbanCounts(credentials, fetchImpl = fetch) {
  let token = await login(credentials, fetchImpl);
  let tokenRefreshPromise = null;
  const jobs = [];
  for (const [campaignName, instance] of CAMPAIGNS) {
    for (const [statusKey, statusLabel, filter] of STATUSES) {
      jobs.push({ campaignName, instance, statusKey, statusLabel, filter });
    }
  }
  const results = new Map();
  const failedJobs = [];
  let nextJob = 0;

  async function fetchJob(job) {
    let requestToken = token;
    let refreshedAfterAuthFailure = false;
    let retryCount = 0;
    while (true) {
      try {
        return await fetchAgentCounts(requestToken, job.instance, job.filter, fetchImpl);
      } catch (error) {
        if ((error.status === 401 || error.status === 403) && !refreshedAfterAuthFailure) {
          if (!tokenRefreshPromise) {
            tokenRefreshPromise = login(credentials, fetchImpl).then((refreshedToken) => {
              token = refreshedToken;
              return refreshedToken;
            });
          }
          requestToken = await tokenRefreshPromise;
          refreshedAfterAuthFailure = true;
          continue;
        }
        if (isRetryableError(error) && retryCount < MAX_RETRIES) {
          await wait(500 * (2 ** retryCount));
          retryCount += 1;
          continue;
        }
        throw error;
      }
    }
  }

  async function worker() {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob];
      nextJob += 1;
      try {
        const counts = await fetchJob(job);
        results.set(`${job.campaignName}\u0000${job.statusKey}`, counts);
      } catch (error) {
        failedJobs.push({
          campaignName: job.campaignName,
          statusKey: job.statusKey,
          statusLabel: job.statusLabel,
          message: error.message || "Awfar request failed.",
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));
  return { counts: results, failedJobs };
}

module.exports = {
  CAMPAIGNS: CAMPAIGNS.map(([name, instance]) => ({ name, instance })),
  STATUSES: STATUSES.map(([key, label]) => ({ key, label })),
  decryptCredentials,
  encryptCredentials,
  fetchKanbanCounts,
};
