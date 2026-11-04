import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

const FEED_SIZE = 30;

/** Loads the overview and keeps it current from the server's change stream. */
export function useLiveDatabase(onLost) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("connecting"); // connecting | live | reconnecting
  const [lastSync, setLastSync] = useState(null);
  const [activity, setActivity] = useState([]);
  const [revisions, setRevisions] = useState({}); // table -> change counter
  const [pulses, setPulses] = useState({}); // table -> time of last change
  const overviewRef = useRef(null);
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  const load = useCallback(async () => {
    try {
      const data = await api.overview();
      overviewRef.current = data;
      setOverview(data);
      setError("");
    } catch (err) {
      if (err.status === 401) onLostRef.current("Your session ended. Please connect again.");
      else setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const stream = new EventSource("/api/stream");

    stream.addEventListener("sync", (e) => {
      const { at, ok } = JSON.parse(e.data);
      setStatus(ok ? "live" : "reconnecting");
      if (ok) setLastSync(at);
    });

    stream.addEventListener("change", (e) => {
      const { at, updates } = JSON.parse(e.data);
      const before = overviewRef.current?.tables ?? [];
      const entries = updates.map((u) => {
        const previous = before.find((t) => t.name === u.table)?.rows;
        return { id: `${at}-${u.table}`, at, table: u.table, rows: u.rows, delta: previous === undefined ? 0 : u.rows - previous };
      });
      // Show new counts right away; the full reload below follows a moment later.
      if (overviewRef.current) {
        const counts = new Map(updates.map((u) => [u.table, u.rows]));
        overviewRef.current = {
          ...overviewRef.current,
          tables: overviewRef.current.tables.map((t) => (counts.has(t.name) ? { ...t, rows: counts.get(t.name) } : t)),
        };
        setOverview(overviewRef.current);
      }
      setActivity((a) => [...entries, ...a].slice(0, FEED_SIZE));
      setRevisions((r) => {
        const next = { ...r };
        for (const u of updates) next[u.table] = (next[u.table] ?? 0) + 1;
        return next;
      });
      setPulses((p) => {
        const next = { ...p };
        for (const u of updates) next[u.table] = at;
        return next;
      });
      load();
    });

    stream.addEventListener("schema", () => load());

    stream.onerror = async () => {
      setStatus("reconnecting");
      const { info } = await api.session().catch(() => ({ info: undefined }));
      if (info === null) {
        stream.close();
        onLostRef.current("Your session ended. Please connect again.");
      }
    };
    return () => stream.close();
  }, [load]);

  return { overview, error, status, lastSync, activity, revisions, pulses };
}
