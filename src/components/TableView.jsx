import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, KeyRound, Link2, Lock, Search } from "lucide-react";
import { api, formatBytes, formatCount } from "../api";

const PAGE_SIZE = 50;

/** Identifies a row across refreshes, so new and changed rows can be highlighted. */
const rowKey = (row, primary, index) => (primary.length ? primary.map((c) => row[c.name]).join("|") : String(index));

const Cell = ({ value, column }) => {
  if (column.sensitive) {
    return (
      <span className="masked" title="Hidden because this column may hold sensitive data">
        <Lock size={11} /> hidden
      </span>
    );
  }
  if (value === null || value === undefined) return <span className="null">NULL</span>;
  const text = String(value);
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return (
      <span className="color-cell">
        <i style={{ background: text }} />
        {text}
      </span>
    );
  }
  return <span title={text.length > 40 ? text : undefined}>{text}</span>;
};

function DataGrid({ table, revision }) {
  const [query, setQuery] = useState({ page: 1, sort: "", dir: "desc", q: "" });
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(new Map()); // row key -> flash id
  const previous = useRef(null);
  const primary = table.columns.filter((c) => c.primary);
  const lastRevision = useRef(revision);

  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === search ? q : { ...q, q: search, page: 1 })), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const live = lastRevision.current !== revision;
    lastRevision.current = revision;
    api
      .rows(table.name, { ...query, pageSize: PAGE_SIZE })
      .then((next) => {
        if (cancelled) return;
        setError("");
        // Only highlight rows when the database changed, not when paging or sorting.
        if (live && previous.current) {
          const before = new Map(previous.current.map((r, i) => [rowKey(r, primary, i), JSON.stringify(r)]));
          const changed = new Map();
          next.rows.forEach((r, i) => {
            const key = rowKey(r, primary, i);
            if (before.get(key) !== JSON.stringify(r)) changed.set(key, Date.now());
          });
          setFlash(changed);
        } else {
          setFlash(new Map());
        }
        previous.current = next.rows;
        setData(next);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.name, query, revision]);

  const sortBy = (column) => {
    if (column.sensitive) return;
    setQuery((q) => ({
      ...q,
      page: 1,
      sort: column.name,
      dir: q.sort === column.name && q.dir === "desc" ? "asc" : "desc",
    }));
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const first = data && data.total ? (query.page - 1) * PAGE_SIZE + 1 : 0;
  const last = data ? Math.min(query.page * PAGE_SIZE, data.total) : 0;

  return (
    <section className="panel grid-panel">
      <div className="grid-toolbar">
        <label className="search">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all columns" aria-label="Search all columns" spellCheck={false} />
        </label>
        <span className="grid-count">
          {data ? `${formatCount(first)}–${formatCount(last)} of ${formatCount(data.total)}` : ""}
        </span>
      </div>
      {error && <p className="form-error grid-error">{error}</p>}
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.name} aria-sort={query.sort === c.name ? (query.dir === "asc" ? "ascending" : "descending") : undefined}>
                  <button onClick={() => sortBy(c)} disabled={c.sensitive}>
                    {c.primary && <KeyRound size={11} className="pk-icon" />}
                    {c.references && <Link2 size={11} className="fk-icon" />}
                    {c.name}
                    {query.sort === c.name && (query.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((row, i) => {
              const key = rowKey(row, primary, i);
              return (
                <tr key={`${key}-${flash.get(key) ?? 0}`} className={flash.has(key) ? "flash" : ""}>
                  {table.columns.map((c) => (
                    <td key={c.name}>
                      <Cell value={row[c.name]} column={c} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <p className="panel-empty">{query.q ? "No rows match that search." : "This table is empty."}</p>}
      </div>
      {pages > 1 && (
        <footer className="grid-foot">
          <span>
            Page {query.page} of {formatCount(pages)}
          </span>
          <span className="pager">
            <button className="ghost-button" disabled={query.page <= 1} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>
              <ChevronLeft size={15} /> Previous
            </button>
            <button className="ghost-button" disabled={query.page >= pages} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>
              Next <ChevronRight size={15} />
            </button>
          </span>
        </footer>
      )}
    </section>
  );
}

function Structure({ table, onOpen }) {
  return (
    <section className="panel grid-panel">
      <div className="grid-scroll">
        <table className="grid structure">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Nullable</th>
              <th>Key</th>
              <th>Default</th>
              <th>References</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((c) => (
              <tr key={c.name}>
                <td className="strong">
                  {c.name} {c.sensitive && <Lock size={11} className="inline-lock" aria-label="Values hidden" />}
                </td>
                <td>{c.type}</td>
                <td>{c.nullable ? "Yes" : "No"}</td>
                <td>{c.primary ? <span className="key-tag pk">Primary</span> : c.unique ? <span className="key-tag">Unique</span> : c.references ? <span className="key-tag fk">Foreign</span> : ""}</td>
                <td>{c.defaultValue ?? <span className="null">—</span>}</td>
                <td>
                  {c.references ? (
                    <button className="link-button" onClick={() => onOpen(c.references.refTable)}>
                      {c.references.refTable}.{c.references.refColumn}
                    </button>
                  ) : (
                    ""
                  )}
                  {c.references && <small className="on-delete"> on delete {c.references.onDelete.toLowerCase()}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TableView({ table, revision, onOpen }) {
  const [tab, setTab] = useState("data");
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="mono-title">{table.name}</h1>
          <p>
            {formatCount(table.rows)} {table.rows === 1 ? "row" : "rows"} · {table.columns.length} columns · {formatBytes(table.bytes)} approx.
          </p>
        </div>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "data"} className={tab === "data" ? "on" : ""} onClick={() => setTab("data")}>
            Data
          </button>
          <button role="tab" aria-selected={tab === "structure"} className={tab === "structure" ? "on" : ""} onClick={() => setTab("structure")}>
            Structure
          </button>
        </div>
      </header>
      {tab === "data" ? <DataGrid table={table} revision={revision} /> : <Structure table={table} onOpen={onOpen} />}
    </div>
  );
}
