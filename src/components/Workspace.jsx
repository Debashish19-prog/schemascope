import { useEffect, useState } from "react";
import { Activity, Database, LayoutGrid, Lock, LogOut, Menu, Moon, Sun, Table2, X } from "lucide-react";
import { api, formatCount } from "../api";
import { toggleTheme } from "../theme";
import Overview from "./Overview";
import TableView from "./TableView";
import { useLiveDatabase } from "./useLiveDatabase";

const readHash = () => {
  const match = window.location.hash.match(/^#\/table\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

function LiveBadge({ status, lastSync }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null;
  const label = status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting" : "Connecting";
  return (
    <span className={`live-badge ${status}`} role="status">
      <i />
      {label}
      {status === "live" && seconds !== null && <small>synced {seconds < 2 ? "just now" : `${seconds}s ago`}</small>}
    </span>
  );
}

export default function Workspace({ onDisconnected }) {
  const live = useLiveDatabase(onDisconnected);
  const [selected, setSelected] = useState(readHash);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setSelected(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const open = (name) => {
    window.location.hash = name ? `#/table/${encodeURIComponent(name)}` : "#/";
    setNavOpen(false);
  };
  const disconnect = async () => {
    await api.disconnect().catch(() => {});
    window.location.hash = "";
    onDisconnected();
  };

  const { overview } = live;
  if (!overview) {
    return <div className="boot">{live.error ? live.error : "Reading the database…"}</div>;
  }
  const { info, tables, insights } = overview;
  const table = selected ? tables.find((t) => t.name === selected) : null;

  return (
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle tables list">
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <button className="logo-row logo-button" onClick={() => open(null)}>
          <span className="logo">
            <Database size={16} />
          </span>
          <span className="logo-text">Schemascope</span>
        </button>
        <div className="conn-chip" title={`${info.user}@${info.host}:${info.port} · MySQL ${info.version}`}>
          <code className="truncate">
            {info.host}:{info.port}
          </code>
          <span className="chip-sep">/</span>
          <strong className="truncate">{info.database}</strong>
          {info.tls && <Lock size={12} aria-label="TLS" />}
        </div>
        <span className="topbar-gap" />
        <LiveBadge status={live.status} lastSync={live.lastSync} />
        <span className="read-only-tag">Read-only</span>
        <button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          <Sun size={16} className="when-dark" />
          <Moon size={16} className="when-light" />
        </button>
        <button className="icon-button" onClick={disconnect} aria-label="Disconnect" title="Disconnect">
          <LogOut size={16} />
        </button>
      </header>

      <div className="workspace-body">
        <nav className={`sidebar ${navOpen ? "open" : ""}`} aria-label="Tables">
          <button className={`side-item ${!table ? "active" : ""}`} onClick={() => open(null)}>
            <LayoutGrid size={15} /> Overview
          </button>
          <div className="side-label">
            Tables <span>{tables.length}</span>
          </div>
          {tables.map((t) => (
            <button key={t.name} className={`side-item ${table?.name === t.name ? "active" : ""}`} onClick={() => open(t.name)}>
              <Table2 size={15} />
              <span className="truncate grow">{t.name}</span>
              <span key={live.pulses[t.name] ?? 0} className={`side-count ${live.pulses[t.name] ? "bump" : ""}`}>
                {formatCount(t.rows)}
              </span>
            </button>
          ))}
          <div className="side-foot">
            <Activity size={13} /> MySQL {String(info.version).split("-")[0]}
          </div>
        </nav>

        <main className="content">
          {table ? (
            <TableView key={table.name} table={table} revision={live.revisions[table.name] ?? 0} onOpen={open} />
          ) : selected ? (
            <div className="empty-block">
              The table <code>{selected}</code> no longer exists.
            </div>
          ) : (
            <Overview info={info} tables={tables} insights={insights} activity={live.activity} pulses={live.pulses} onOpen={open} />
          )}
        </main>
      </div>
    </div>
  );
}
