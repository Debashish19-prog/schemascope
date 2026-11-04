import crypto from "node:crypto";
import mysql from "mysql2/promise";

const IDLE_MS = 30 * 60 * 1000;
const POLL_MS = 2500;
const MAX_SESSIONS = 50;
// Checksums read every row, so very large tables fall back to metadata.
const CHECKSUM_ROW_LIMIT = 500_000;

// Credentials live only in these in-memory pools; they're never written anywhere.
const sessions = new Map();

export async function openSession({ host, port, user, password, database, ssl, ca }) {
  if (sessions.size >= MAX_SESSIONS) throw new Error("Too many open sessions");
  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    ssl: ssl ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined,
    connectionLimit: 3,
    connectTimeout: 8000,
    enableKeepAlive: true,
    // Show stored values exactly as they are, without rounding or timezone shifts.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    // Never let a server the user pointed us at read files from this machine.
    flags: ["-LOCAL_FILES"],
  });
  // Every connection is read-only, as a second safeguard: the server only builds SELECTs anyway.
  pool.on("connection", (conn) => {
    conn.query("SET SESSION TRANSACTION READ ONLY");
    conn.query("SET SESSION MAX_EXECUTION_TIME = 8000", () => {}); // not supported on every server
  });
  try {
    const [[{ version }]] = await pool.query("SELECT VERSION() AS version");
    const id = crypto.randomBytes(32).toString("hex");
    const session = {
      id,
      pool,
      info: { host, port, database, user, tls: !!ssl, version },
      clients: new Set(),
      lastSeen: Date.now(),
      timer: null,
      fingerprints: null,
      tableNames: "",
      polling: false,
    };
    sessions.set(id, session);
    return session;
  } catch (err) {
    await pool.end().catch(() => {});
    throw err;
  }
}

export function getSession(id) {
  const session = id ? sessions.get(id) : null;
  if (session) session.lastSeen = Date.now();
  return session ?? null;
}

export async function closeSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  clearTimeout(session.timer);
  for (const client of session.clients) client.end();
  await session.pool.end().catch(() => {});
}

setInterval(() => {
  for (const session of sessions.values()) {
    if (session.clients.size === 0 && Date.now() - session.lastSeen > IDLE_MS) closeSession(session.id);
  }
}, 60_000).unref();

const send = (session, event, data) => {
  for (const client of session.clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

async function fingerprintTables(session) {
  const { pool, info } = session;
  const [meta] = await pool.query(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS est, UPDATE_TIME AS updated
     FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [info.database],
  );
  const small = meta.filter((t) => Number(t.est) <= CHECKSUM_ROW_LIMIT);
  const prints = new Map(meta.map((t) => [t.name, `meta:${t.est}:${t.updated}`]));
  if (small.length > 0) {
    const [sums] = await pool.query(`CHECKSUM TABLE ${small.map((t) => pool.escapeId(t.name)).join(", ")}`);
    for (const row of sums) prints.set(row.Table.slice(row.Table.indexOf(".") + 1), String(row.Checksum));
  }
  return prints;
}

async function poll(session) {
  if (session.clients.size === 0) {
    session.polling = false;
    return;
  }
  try {
    const prints = await fingerprintTables(session);
    const names = [...prints.keys()].sort().join("|");
    if (session.fingerprints) {
      if (names !== session.tableNames) send(session, "schema", { at: Date.now() });
      const changes = [];
      for (const [table, print] of prints) {
        const before = session.fingerprints.get(table);
        if (before !== undefined && before !== print) changes.push(table);
      }
      if (changes.length > 0) {
        const { pool } = session;
        const updates = await Promise.all(
          changes.map(async (table) => {
            const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${pool.escapeId(table)}`);
            return { table, rows: Number(n) };
          }),
        );
        send(session, "change", { at: Date.now(), updates });
      }
    }
    session.fingerprints = prints;
    session.tableNames = names;
    send(session, "sync", { at: Date.now(), ok: true });
  } catch {
    send(session, "sync", { at: Date.now(), ok: false });
  }
  session.timer = setTimeout(() => poll(session), POLL_MS);
}

/** Registers an open event stream and starts watching the database for changes. */
export function subscribe(session, res) {
  session.clients.add(res);
  res.on("close", () => {
    session.clients.delete(res);
    session.lastSeen = Date.now();
  });
  if (!session.polling) {
    session.polling = true;
    session.fingerprints = null;
    poll(session);
  }
}
