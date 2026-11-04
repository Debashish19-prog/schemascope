# Schemascope

A read-only, live visualizer for MySQL databases, built for the Expense Tracker but usable with any MySQL database. Enter a host and credentials to see:

- a **schema map** of tables and their foreign-key relationships
- **row counts, sizes and activity charts** (charts appear when the Expense Tracker tables are present)
- a **data grid** with sorting, search and paging, plus a **Structure** tab for each table
- **live sync:** changes in the database appear within about 3 seconds, without refreshing, and changed rows are highlighted

## Run it

```bash
npm install
npm run app     # builds the site and starts it at http://localhost:5100
```

| Database | Host | Port | Database | TLS |
| --- | --- | --- | --- | --- |
| Local MySQL | `localhost` | `3306` | `expense_tracker` | off |
| Aiven | your Aiven host | your Aiven port | `defaultdb` | on, with `ca.pem` |

## Safeguards

- **Read-only:** every connection is set to read-only, the server only runs SELECT-style queries it builds itself, and there is no custom SQL box. For extra protection, connect with a MySQL user that only has `SELECT`.
- **Credentials:** held in server memory only, and dropped on disconnect or after 30 idle minutes. The browser remembers the host, port, database and username, never the password or certificate.
- **Sensitive columns:** columns with names like `password`, `hash`, `token` or `secret` are never sent to the browser, searched or sorted.
- **Local by default:** it listens only on this computer and rejects cross-site requests.
- **Limits:** 20 connection attempts per 15 minutes. Restarting the server resets this.

All other columns are visible, including users' names and emails, so treat access to this tool like access to the database.

## Hosting it for other people

It needs an always-on server, because it keeps database connections and live streams open, so it **won't work on Vercel**. Use a service like Render:

- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`
- Environment variable: `PUBLIC_MODE=true`

Public mode refuses hosts on private networks and requires HTTPS for its session cookie. It can only reach databases that accept connections from the hosting service.

## How live sync works

While a browser is connected, the server compares a checksum of each table every 2.5 seconds and pushes changes over Server-Sent Events. Tables over about 500,000 rows use MySQL's table statistics instead, which can be slower to notice changes.
