import { useRef, useState } from "react";
import { ArrowRight, Database, Eye, EyeOff, FileUp, KeyRound, Lock, Radio, ShieldCheck } from "lucide-react";
import { api } from "../api";

const SAVED = "schemascope-connection";

// Remembers everything except the password and certificate.
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED)) ?? {};
  } catch {
    return {};
  }
};
const save = (values) => {
  try {
    localStorage.setItem(SAVED, JSON.stringify(values));
  } catch {
    /* fields just won't be remembered */
  }
};

const POINTS = [
  [ShieldCheck, "Read-only", "Connections can't change your data, and there's no way to run custom SQL."],
  [KeyRound, "Nothing stored", "Your password stays in the server's memory until you disconnect."],
  [Radio, "Always in sync", "Changes in the database appear here within seconds, without refreshing."],
];

export default function ConnectScreen({ onConnected, notice }) {
  const saved = useRef(loadSaved()).current;
  const [ssl, setSsl] = useState(saved.ssl ?? false);
  const [ca, setCa] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const { info } = await api.connect({ ...v, port: Number(v.port) || 3306, ssl, ca: ssl ? ca : "" });
      save({ host: v.host, port: v.port, user: v.user, database: v.database, ssl });
      onConnected(info);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const readCa = async (e) => {
    const file = e.target.files?.[0];
    if (file) setCa(await file.text());
  };

  return (
    <main className="connect">
      <section className="connect-intro">
        <div className="logo-row">
          <span className="logo">
            <Database size={18} />
          </span>
          Schemascope
        </div>
        <h1>See inside your database, as it changes.</h1>
        <p className="connect-lede">Enter a MySQL host to map its tables and relationships and browse its data live.</p>
        <ul className="connect-points">
          {POINTS.map(([Icon, title, text]) => (
            <li key={title}>
              <Icon size={18} />
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="connect-panel">
        <form className="connect-form" onSubmit={submit}>
          <h2>Connect to a database</h2>
          {notice && <p className="note">{notice}</p>}
          <div className="form-grid">
            <label className="field host-field">
              Host
              <input name="host" required autoFocus defaultValue={saved.host ?? ""} placeholder="localhost or mysql-xxx.aivencloud.com" autoComplete="off" spellCheck={false} />
            </label>
            <label className="field port-field">
              Port
              <input name="port" type="number" min="1" max="65535" required defaultValue={saved.port ?? 3306} />
            </label>
            <label className="field">
              Database
              <input name="database" required defaultValue={saved.database ?? ""} placeholder="expense_tracker" autoComplete="off" spellCheck={false} />
            </label>
            <label className="field">
              Username
              <input name="user" required defaultValue={saved.user ?? ""} placeholder="expense_user" autoComplete="off" spellCheck={false} />
            </label>
            <label className="field span-all">
              Password
              <span className="input-with-action">
                <input name="password" type={showPassword ? "text" : "password"} autoComplete="off" />
                <button type="button" className="icon-button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
          </div>

          <label className="toggle">
            <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
            <span className="toggle-track" />
            <span>
              <strong>Use TLS</strong>
              <small>Needed for hosted databases such as Aiven</small>
            </span>
          </label>

          {ssl && (
            <div className="field">
              <span className="label-row">
                CA certificate <em>optional</em>
                <label className="file-link">
                  <FileUp size={14} /> Upload ca.pem
                  <input type="file" accept=".pem,.crt,.cer,text/plain" onChange={readCa} hidden />
                </label>
              </span>
              <textarea value={ca} onChange={(e) => setCa(e.target.value)} rows={3} spellCheck={false} placeholder="-----BEGIN CERTIFICATE-----" />
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Connect"} {!busy && <ArrowRight size={16} />}
          </button>
          <p className="form-foot">
            <Lock size={13} /> Sensitive columns such as password hashes are always hidden.
          </p>
        </form>
      </section>
    </main>
  );
}
