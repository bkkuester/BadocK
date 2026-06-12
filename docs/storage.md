# BadocK Local Storage

The MVP storage uses a local SQLite database. By default, project databases should live under `.badock/`, for example `.badock/badock.sqlite`.

The initial schema includes:

- `project`
- `issue`
- `run`
- `run_log`
- `cost_record`
- `decision`

The database is local only and does not require an external server. Paths should point to project-local state and must not contain secrets.

To initialize a database:

```bash
pnpm --filter @badock/cli badock storage init .badock/badock.sqlite
```

To reset local state safely, stop any BadocK process and delete only the intended local database files:

```bash
Remove-Item -LiteralPath .badock/badock.sqlite, .badock/badock.sqlite-shm, .badock/badock.sqlite-wal
```

Do not delete `.badock/project.json` when resetting runtime state.
