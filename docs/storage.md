# BadocK Local Storage

The MVP storage uses a local SQLite database. By default, project databases should live under `.badock/`, for example `.badock/badock.sqlite`.

The initial schema includes:

- `project`
- `issue`
- `stack_profile`
- `run`
- `run_plan`
- `run_log`
- `cost_record`
- `decision`

The `issue` table stores the local BadocK issue format: title, objective, scope, suggested agents, acceptance criteria, technical notes, optional candidate files, minimal state and future GitHub sync metadata.

The `stack_profile` table can store deterministic profiles generated from `project scan` facts.

The `run_plan` table stores the first operational bridge from issue to execution planning. A stored run plan requires manual review by default and does not authorize execution automatically.

The database is local only and does not require an external server. Paths should point to project-local state and must not contain secrets.

To initialize a database:

```bash
pnpm --filter @badock/cli badock storage init .badock/badock.sqlite
```

To create and plan a local issue:

```bash
pnpm --filter @badock/cli badock issue create .badock/badock.sqlite --project <project-id> --title <title> --objective <objective> --scope <scope> --agent <agent-id> --acceptance <criterion>
pnpm --filter @badock/cli badock plan create .badock/badock.sqlite <issue-id>
```

To reset local state safely, stop any BadocK process and delete only the intended local database files:

```bash
Remove-Item -LiteralPath .badock/badock.sqlite, .badock/badock.sqlite-shm, .badock/badock.sqlite-wal
```

Do not delete `.badock/project.json` when resetting runtime state.
