import { useEffect, useState } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { formatCount } from "../api";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const SERIES = [
  ["expense", "Expenses", "--series-expense"],
  ["income", "Income", "--series-income"],
  ["transfer", "Transfers", "--series-transfer"],
];

function useCssColors() {
  const read = () => {
    const css = getComputedStyle(document.documentElement);
    return (name) => css.getPropertyValue(name).trim();
  };
  const [get, setGet] = useState(() => read());
  useEffect(() => {
    const update = () => setGet(() => read());
    window.addEventListener("schemascope:theme", update);
    return () => window.removeEventListener("schemascope:theme", update);
  }, []);
  return get;
}

const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", year: "2-digit" });

export function MonthlyActivity({ months }) {
  const css = useCssColors();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Transactions per month</h2>
          <p>Number recorded by type, across all users</p>
        </div>
        <button className="ghost-button" onClick={() => setAsTable((t) => !t)}>
          {asTable ? "Show chart" : "Show table"}
        </button>
      </header>
      <div className="panel-body">
        {asTable ? (
          <table className="mini-table">
            <thead>
              <tr>
                <th>Month</th>
                {SERIES.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  {SERIES.map(([key]) => (
                    <td key={key}>{formatCount(m[key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div className="legend">
              {SERIES.map(([key, label, color]) => (
                <span key={key}>
                  <i style={{ background: `var(${color})` }} /> {label}
                </span>
              ))}
            </div>
            <div className="chart-box">
              <Bar
                aria-label="Transactions per month by type"
                data={{
                  labels: months.map((m) => monthLabel(m.month)),
                  datasets: SERIES.map(([key, label, color]) => ({
                    label,
                    data: months.map((m) => m[key]),
                    backgroundColor: css(color),
                    borderColor: css("--surface"),
                    borderWidth: 2,
                    borderRadius: 4,
                    borderSkipped: false,
                    maxBarThickness: 28,
                  })),
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 300 },
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: css("--surface"),
                      titleColor: css("--ink"),
                      bodyColor: css("--ink"),
                      borderColor: css("--line"),
                      borderWidth: 1,
                      padding: 10,
                      boxPadding: 4,
                    },
                  },
                  scales: {
                    x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: css("--muted") } },
                    y: {
                      stacked: true,
                      beginAtZero: true,
                      grid: { color: css("--grid") },
                      border: { display: false },
                      ticks: { color: css("--muted"), precision: 0, maxTicksLimit: 5 },
                    },
                  },
                }}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function CategoryBars({ categories }) {
  const max = Math.max(1, ...categories.map((c) => c.count));
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Most-used categories</h2>
          <p>Income and expense transactions, across all users</p>
        </div>
      </header>
      <ul className="bars">
        {categories.map((c) => (
          <li key={c.name}>
            <div className="bar-row static">
              <span className="truncate">{c.name}</span>
              <span className="bar-track">
                <i style={{ width: `${(c.count / max) * 100}%` }} />
              </span>
              <span className="num">{formatCount(c.count)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
