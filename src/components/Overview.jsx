import { ArrowDownRight, ArrowUpRight, Link2, Rows3, Table2, HardDrive, RefreshCw } from "lucide-react";
import { formatBytes, formatCount } from "../api";
import ErDiagram from "./ErDiagram";
import { CategoryBars, MonthlyActivity } from "./Insights";

function Tile({ icon: Icon, label, value }) {
  return (
    <div className="tile">
      <span className="tile-label">
        <Icon size={14} /> {label}
      </span>
      <strong className="tile-value">{value}</strong>
    </div>
  );
}

const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function ActivityFeed({ activity, onOpen }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Live activity</h2>
          <p>Changes seen since you connected</p>
        </div>
      </header>
      {activity.length === 0 ? (
        <p className="panel-empty">Watching for changes. Add something in the app and it appears here.</p>
      ) : (
        <ul className="feed">
          {activity.map((a) => (
            <li key={a.id}>
              <span className={`feed-icon ${a.delta > 0 ? "up" : a.delta < 0 ? "down" : ""}`}>
                {a.delta > 0 ? <ArrowUpRight size={14} /> : a.delta < 0 ? <ArrowDownRight size={14} /> : <RefreshCw size={13} />}
              </span>
              <div className="grow">
                <button className="link-button mono" onClick={() => onOpen(a.table)}>
                  {a.table}
                </button>
                <span className="feed-text">
                  {a.delta > 0
                    ? `${a.delta} ${a.delta === 1 ? "row" : "rows"} added`
                    : a.delta < 0
                      ? `${-a.delta} ${a.delta === -1 ? "row" : "rows"} removed`
                      : "rows updated"}
                </span>
              </div>
              <time>{timeOf(a.at)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Overview({ info, tables, insights, activity, pulses, onOpen }) {
  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  const relationships = tables.reduce((s, t) => s + t.foreignKeys.length, 0);
  const bytes = tables.reduce((s, t) => s + t.bytes, 0);
  const ranked = [...tables].sort((a, b) => b.rows - a.rows);
  const maxRows = Math.max(1, ranked[0]?.rows ?? 1);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{info.database}</h1>
          <p>
            Connected as <code>{info.user}</code> to <code>{info.host}</code>
          </p>
        </div>
      </header>

      <div className="tiles">
        <Tile icon={Table2} label="Tables" value={formatCount(tables.length)} />
        <Tile icon={Rows3} label="Total rows" value={formatCount(totalRows)} />
        <Tile icon={Link2} label="Relationships" value={formatCount(relationships)} />
        <Tile icon={HardDrive} label="Size (approx.)" value={formatBytes(bytes)} />
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Schema map</h2>
            <p>How tables reference each other. Hover a table to see all its links, click to open it.</p>
          </div>
        </header>
        <ErDiagram tables={tables} pulses={pulses} onOpen={onOpen} />
      </section>

      <div className="two-col">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Rows per table</h2>
              <p>Updates as data changes</p>
            </div>
          </header>
          <ul className="bars">
            {ranked.map((t) => (
              <li key={t.name}>
                <button className="bar-row" onClick={() => onOpen(t.name)}>
                  <span className="mono truncate">{t.name}</span>
                  <span className="bar-track">
                    <i style={{ width: `${(t.rows / maxRows) * 100}%` }} />
                  </span>
                  <span className="num">{formatCount(t.rows)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <ActivityFeed activity={activity} onOpen={onOpen} />
      </div>

      {insights && insights.months.length > 0 && (
        <div className="two-col">
          <MonthlyActivity months={insights.months} />
          <CategoryBars categories={insights.categories} />
        </div>
      )}
    </div>
  );
}
