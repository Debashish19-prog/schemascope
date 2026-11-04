import { useMemo, useState } from "react";
import { formatCount } from "../api";

const NODE_W = 220;
const HEAD_H = 40;
const ROW_H = 22;
const GAP_X = 96;
const GAP_Y = 24;
const PAD = 16;
const MAX_ROWS = 6;

/** Only key columns are drawn, so the map stays readable. */
const keyColumns = (t) => t.columns.filter((c) => c.primary || c.references).slice(0, MAX_ROWS);

/** Arranges tables in columns: referenced tables on the left, tables that depend on them to the right. */
function layout(tables) {
  const names = new Set(tables.map((t) => t.name));
  const parents = new Map(
    tables.map((t) => [t.name, t.foreignKeys.map((f) => f.refTable).filter((r) => names.has(r) && r !== t.name)]),
  );
  const depth = new Map();
  const depthOf = (name, seen = new Set()) => {
    if (depth.has(name)) return depth.get(name);
    if (seen.has(name)) return 0; // circular references
    seen.add(name);
    const d = Math.max(-1, ...parents.get(name).map((p) => depthOf(p, seen))) + 1;
    depth.set(name, d);
    return d;
  };
  tables.forEach((t) => depthOf(t.name));

  const columns = [];
  tables.forEach((t) => (columns[depth.get(t.name)] ??= []).push(t));

  const pos = new Map();
  let height = 0;
  columns.forEach((col, x) => {
    // Sit each table near the tables it references, to reduce crossing lines.
    const score = (t) => {
      const ys = parents.get(t.name).map((p) => pos.get(p)?.y).filter((y) => y !== undefined);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    };
    col.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
    let y = PAD;
    for (const t of col) {
      const h = HEAD_H + keyColumns(t).length * ROW_H + 8;
      pos.set(t.name, { x: PAD + x * (NODE_W + GAP_X), y, h });
      y += h + GAP_Y;
    }
    height = Math.max(height, y - GAP_Y + PAD);
  });
  const width = PAD * 2 + columns.length * NODE_W + Math.max(0, columns.length - 1) * GAP_X;
  return { pos, width, height };
}

export default function ErDiagram({ tables, pulses, onOpen }) {
  const [hover, setHover] = useState(null);
  const { pos, width, height } = useMemo(() => layout(tables), [tables]);

  const childCount = useMemo(() => {
    const counts = new Map();
    tables.forEach((t) => t.foreignKeys.forEach((f) => counts.set(f.refTable, (counts.get(f.refTable) ?? 0) + 1)));
    return counts;
  }, [tables]);

  const edges = tables.flatMap((t) =>
    t.foreignKeys
      .filter((f) => pos.has(f.refTable))
      .map((f) => {
        const child = pos.get(t.name);
        const parent = pos.get(f.refTable);
        const rowIndex = keyColumns(t).findIndex((c) => c.name === f.columnName);
        const childY = child.y + HEAD_H + (rowIndex < 0 ? 0 : rowIndex) * ROW_H + ROW_H / 2;
        const parentY = parent.y + HEAD_H / 2;
        const leftToRight = parent.x < child.x;
        const x1 = leftToRight ? parent.x + NODE_W : parent.x;
        const x2 = leftToRight ? child.x : child.x + NODE_W;
        const bend = Math.max(40, Math.abs(x2 - x1) / 2) * (leftToRight ? 1 : -1);
        const dir = leftToRight ? -1 : 1;
        return {
          id: `${t.name}.${f.columnName}`,
          from: f.refTable,
          to: t.name,
          label: `${t.name}.${f.columnName} → ${f.refTable}.${f.refColumn}`,
          path: `M${x1},${parentY} C${x1 + bend},${parentY} ${x2 - bend},${childY} ${x2},${childY}`,
          crow: `M${x2 + dir * 9},${childY} L${x2},${childY - 5} M${x2 + dir * 9},${childY} L${x2},${childY + 5}`,
          // Links from a table nearly everything references (like users) would otherwise dominate,
          // so they're quiet, and those crossing other tables only appear on hover.
          faint: (childCount.get(f.refTable) ?? 0) > 3,
          long: Math.abs(child.x - parent.x) > NODE_W + GAP_X,
        };
      }),
  );

  const related = (name) => hover === name || edges.some((e) => (e.from === hover && e.to === name) || (e.to === hover && e.from === name));

  return (
    <div className="er-scroll">
      <svg className="er" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 900), maxWidth: width }} role="img" aria-label={`Diagram of ${tables.length} tables and their relationships`}>
        <g fill="none">
          {edges.map((e) => {
            const active = hover && (e.from === hover || e.to === hover);
            return (
              <g key={e.id} className={`er-edge ${active ? "active" : hover ? "dim" : e.faint ? (e.long ? "on-hover" : "faint") : ""}`}>
                <title>{e.label}</title>
                <path d={e.path} />
                <path d={e.crow} />
              </g>
            );
          })}
        </g>
        {tables.map((t) => {
          const p = pos.get(t.name);
          const cols = keyColumns(t);
          return (
            <g
              key={t.name}
              transform={`translate(${p.x},${p.y})`}
              className={`er-node ${hover && !related(t.name) ? "dim" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={`Open ${t.name}, ${t.rows} rows`}
              onMouseEnter={() => setHover(t.name)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(t.name)}
              onBlur={() => setHover(null)}
              onClick={() => onOpen(t.name)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(t.name))}
            >
              <rect className="er-card" width={NODE_W} height={p.h} rx="10" />
              {/* Remounting restarts the highlight animation whenever this table changes. */}
              {pulses[t.name] && <rect key={pulses[t.name]} className="er-pulse" width={NODE_W} height={p.h} rx="10" />}
              <text className="er-name" x="14" y="25">
                {t.name}
              </text>
              <text className="er-count" x={NODE_W - 14} y="25" textAnchor="end">
                {formatCount(t.rows)}
              </text>
              <line className="er-rule" x1="0" x2={NODE_W} y1={HEAD_H - 2} y2={HEAD_H - 2} />
              {cols.map((c, i) => (
                <g key={c.name} transform={`translate(0,${HEAD_H + i * ROW_H})`}>
                  <text className={`er-key ${c.primary ? "pk" : "fk"}`} x="14" y="15">
                    {c.primary ? "PK" : "FK"}
                  </text>
                  <text className="er-col" x="38" y="15">
                    {c.name.length > 24 ? `${c.name.slice(0, 23)}…` : c.name}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
