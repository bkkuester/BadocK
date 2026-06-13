# BadocK Local Storage

The MVP storage uses a local SQLite database. By default, project databases should live under `.badock/`, for example `.badock/badock.sqlite`.

The initial schema includes:

- `project`
- `provider_profile`
- `agent_profile`
- `issue`
- `stack_profile`
- `run`
- `run_plan`
- `run_log`
- `cost_record`
- `decision`

The `issue` table stores the local BadocK issue format: title, objective, scope, suggested agents, acceptance criteria, technical notes, optional candidate files, minimal state and future GitHub sync metadata.

The `provider_profile` table stores local, non-secret provider metadata. It may hold provider alias, type, endpoint, default model and basic parameters, but never raw API keys.

The `agent_profile` table stores local agent declarations with role, provider, model, permission mode and capabilities. It references `provider_profile`, so an agent cannot be registered for a missing provider.

The `stack_profile` table can store deterministic profiles generated from `project scan` facts.

The `run_plan` table stores the first operational bridge from issue to execution planning. It can also store an editable agent selection and provider/model metadata for later cost tracking. A stored run plan requires manual review by default and does not authorize execution automatically.

Run logs, decision summaries and model/provider metadata are sanitized before persistence to avoid storing common secret patterns in local reports.

Adapter results can be persisted as sanitized run logs through `recordAgentRuntimeResult()`. The method stores the structured result under `run_log.metadata_json` and redacts common secret patterns in stdout, stderr, errors and nested metadata before persistence.

The database is local only and does not require an external server. Paths should point to project-local state and must not contain secrets.

To initialize a database:

```bash
pnpm --filter @badock/cli badock storage init .badock/badock.sqlite
```

To create and plan a local issue:

```bash
pnpm --filter @badock/cli badock provider register .badock/badock.sqlite --project <project-id> --id mock --type mock --default-model mock-planner
pnpm --filter @badock/cli badock agent register .badock/badock.sqlite --project <project-id> --id backend-agent --role backend --provider mock --model mock-planner --permission manual
pnpm --filter @badock/cli badock issue create .badock/badock.sqlite --project <project-id> --title <title> --objective <objective> --scope <scope> --agent <agent-id> --acceptance <criterion>
pnpm --filter @badock/cli badock plan create .badock/badock.sqlite <issue-id> --agent <agent-id>
```

To reset local state safely, stop any BadocK process and delete only the intended local database files:

```bash
Remove-Item -LiteralPath .badock/badock.sqlite, .badock/badock.sqlite-shm, .badock/badock.sqlite-wal
```

Do not delete `.badock/project.json` when resetting runtime state.
