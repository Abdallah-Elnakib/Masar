const path = require("node:path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");

dotenv.config({ path: path.join(process.cwd(), ".env") });

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function seedAdmin() {
  const uri = process.env.MONGODB_URI;
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || "").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";

  if (!uri) throw new Error("MONGODB_URI is missing from the local .env file.");
  if (!username || !password) {
    throw new Error("Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD for this command.");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DB || "qa_sys");
    const users = database.collection("users");
    const usernameLower = username.toLowerCase();
    const usernamePattern = new RegExp(`^${escapeRegex(username)}$`, "i");

    await users.createIndex({ usernameLower: 1 }, { unique: true, sparse: true, name: "usernameLower_unique" });

    const existing = await users.findOne({
      $or: [{ usernameLower }, { username: usernamePattern }],
    });

    if (existing) {
      const passwordMatches = typeof existing.passwordHash === "string"
        && await bcrypt.compare(password, existing.passwordHash);
      if (existing.role !== "Admin" || !passwordMatches) {
        throw new Error("This username already exists with different account details; no changes were made.");
      }
      console.log("The Admin account already exists and was left unchanged.");
      return;
    }

    await users.insertOne({
      username,
      usernameLower,
      name: username,
      role: "Admin",
      passwordHash: await bcrypt.hash(password, 12),
      isActive: true,
      createdAt: new Date(),
    });

    console.log("Admin account created with a bcrypt password hash.");
  } finally {
    await client.close();
  }
}

seedAdmin().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});