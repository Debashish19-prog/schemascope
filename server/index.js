import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countRows, readInsights, readRows, readSchema } from "./schema.js";
import { allowAttempt, assertHostAllowed, friendlyError, guardRequests, PUBLIC_MODE, securityHeaders } from "./security.js";
import { closeSession, getSession, openSession, subscribe } from "./sessions.js";

const COOKIE = "viewer_session";
const app = express();
app.disable("x-powered-by");
if (PUBLIC_MODE) app.set("trust proxy", 1);
app.use(securityHeaders);
app.use("/api", guardRequests);
app.use(express.json({ limit: "64kb" }));

const readCookie = (req) => {
  const match = (req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`));
  return match?.[1];
};

const requireSession = (req, res, next) => {
  req.session = getSession(readCookie(req));
  if (!req.session) return res.status(401).json({ error: "Not connected" });
  next();
};

const asText = (v) => (typeof v === "string" ? v : "");

app.post("/api/connect", async (req, res) => {
  if (!allowAttempt(req.ip)) return res.status(429).json({ error: "Too many attempts. Please wait a few minutes." });
  const host = asText(req.body?.host).trim();
  const user = asText(req.body?.user).trim();
  const database = asText(req.body?.database).trim();
  const port = Number(req.body?.port ?? 3306);
  if (!/^[a-zA-Z0-9.:_-]{1,255}$/.test(host)) return res.status(400).json({ error: "Enter a valid host." });
  if (!user) return res.status(400).json({ error: "Enter a username." });
  if (!database) return res.status(400).json({ error: "Enter a database name." });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return res.status(400).json({ error: "Enter a valid port." });
  try {
    await assertHostAllowed(host);
    const session = await openSession({
      host,
      port,
      user,
      database,
      password: asText(req.body?.password),
      ssl: req.body?.ssl === true,
      ca: asText(req.body?.ca).trim() || undefined,
    });
    await closeSession(readCookie(req));
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${session.id}; HttpOnly; SameSite=Strict; Path=/${PUBLIC_MODE ? "; Secure" : ""}`,
    );
    res.json({ info: session.info });
  } catch (err) {
    res.status(400).json({ error: friendlyError(err) });
  }
});

app.post("/api/disconnect", async (req, res) => {
  await closeSession(readCookie(req));
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  const session = getSession(readCookie(req));
  res.json({ info: session?.info ?? null });
});

app.get("/api/overview", requireSession, async (req, res, next) => {
  try {
    const tables = await readSchema(req.session);
    const counts = await countRows(req.session, tables.map((t) => t.name));
    res.json({
      info: req.session.info,
      tables: tables.map((t) => ({ ...t, rows: counts[t.name] })),
      insights: await readInsights(req.session, tables),
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/tables/:name/rows", requireSession, async (req, res, next) => {
  try {
    const table = (await readSchema(req.session)).find((t) => t.name === req.params.name);
    if (!table) return res.status(404).json({ error: "Table not found" });
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 50));
    res.json(
      await readRows(req.session, table, {
        page,
        pageSize,
        sort: asText(req.query.sort),
        dir: asText(req.query.dir),
        q: asText(req.query.q).slice(0, 200),
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.get("/api/stream", requireSession, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  subscribe(req.session, res);
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "That's too large." });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request." });
  console.error(err?.code ?? "error", err?.sqlMessage ?? err?.message);
  res.status(500).json({ error: "The database returned an error." });
});

const port = Number(process.env.PORT ?? 5100);
const bind = PUBLIC_MODE ? "0.0.0.0" : "127.0.0.1";
app.listen(port, bind, () => console.log(`Schemascope running at http://localhost:${port}`));
