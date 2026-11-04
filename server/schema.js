// Columns whose values are never sent to the browser, searched or sorted on.
export const SENSITIVE = /pass(word|wd|phrase)?|secret|token|api[_-]?key|hash|salt|private/i;

/** Reads tables, columns, keys and relationships from information_schema. */
export async function readSchema(session) {
  const { pool, info } = session;
  const db = info.database;
  const [[tables], [columns], [fks]] = await Promise.all([
    pool.query(
      `SELECT TABLE_NAME AS name, ENGINE AS engine, DATA_LENGTH AS dataBytes, INDEX_LENGTH AS indexBytes
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [db],
    ),
    pool.query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
              COLUMN_KEY AS keyType, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    ),
    pool.query(
      `SELECT k.TABLE_NAME AS tableName, k.COLUMN_NAME AS columnName,
              k.REFERENCED_TABLE_NAME AS refTable, k.REFERENCED_COLUMN_NAME AS refColumn, r.DELETE_RULE AS onDelete
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
       WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
      [db],
    ),
  ]);
  return tables.map((t) => {
    const tableFks = fks.filter((f) => f.tableName === t.name);
    return {
      name: t.name,
      engine: t.engine,
      bytes: Number(t.dataBytes ?? 0) + Number(t.indexBytes ?? 0),
      columns: columns
        .filter((c) => c.tableName === t.name)
        .map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable === "YES",
          primary: c.keyType === "PRI",
          unique: c.keyType === "UNI",
          defaultValue: c.defaultValue,
          extra: c.extra,
          sensitive: SENSITIVE.test(c.name),
          references: tableFks.find((f) => f.columnName === c.name) ?? null,
        })),
      foreignKeys: tableFks,
    };
  });
}

export async function countRows(session, names) {
  const { pool } = session;
  const counts = await Promise.all(
    names.map(async (name) => {
      const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${pool.escapeId(name)}`);
      return [name, Number(n)];
    }),
  );
  return Object.fromEntries(counts);
}

const safeValue = (value) => (Buffer.isBuffer(value) ? `<binary, ${value.length} bytes>` : value);

/** One page of a table. Table and column names are only ever taken from the live schema. */
export async function readRows(session, table, { page, pageSize, sort, dir, q }) {
  const { pool } = session;
  const visible = table.columns.filter((c) => !c.sensitive);
  const tableId = pool.escapeId(table.name);
  const params = [];
  let where = "";
  if (q && visible.length > 0) {
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    where = `WHERE ${visible.map((c) => `CAST(${pool.escapeId(c.name)} AS CHAR) LIKE ?`).join(" OR ")}`;
    visible.forEach(() => params.push(like));
  }
  const sortColumn = visible.find((c) => c.name === sort);
  const fallback = table.columns.filter((c) => c.primary);
  const order = sortColumn
    ? `ORDER BY ${pool.escapeId(sortColumn.name)} ${dir === "asc" ? "ASC" : "DESC"}`
    : fallback.length
      ? `ORDER BY ${fallback.map((c) => `${pool.escapeId(c.name)} DESC`).join(", ")}`
      : "";
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${tableId} ${where}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM ${tableId} ${where} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  return {
    total: Number(n),
    rows: rows.map((row) =>
      Object.fromEntries(table.columns.map((c) => [c.name, c.sensitive ? null : safeValue(row[c.name])])),
    ),
  };
}

const hasColumns = (schema, table, cols) => {
  const t = schema.find((x) => x.name === table);
  return !!t && cols.every((c) => t.columns.some((x) => x.name === c));
};

/** Activity charts for the expense tracker's tables. Counts only, since users may hold different currencies. */
export async function readInsights(session, schema) {
  if (!hasColumns(schema, "transactions", ["type", "date", "category_id"]) || !hasColumns(schema, "categories", ["id", "name", "color"])) {
    return null;
  }
  const { pool } = session;
  const [[monthly], [categories]] = await Promise.all([
    pool.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month, type, COUNT(*) AS n
       FROM transactions GROUP BY month, type ORDER BY month DESC LIMIT 60`,
    ),
    pool.query(
      `SELECT COALESCE(c.name, 'Uncategorized') AS name, COUNT(*) AS n
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type <> 'transfer' GROUP BY name ORDER BY n DESC LIMIT 8`,
    ),
  ]);
  const months = [...new Set(monthly.map((m) => m.month))].slice(0, 12).reverse();
  return {
    months: months.map((month) => {
      const of = (type) => Number(monthly.find((m) => m.month === month && m.type === type)?.n ?? 0);
      return { month, expense: of("expense"), income: of("income"), transfer: of("transfer") };
    }),
    categories: categories.map((c) => ({ name: c.name, count: Number(c.n) })),
  };
}
