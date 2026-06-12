# BadocK Project Manifest

The project manifest lives at `.badock/project.json` and contains versioned, non-secret configuration.

## Versioned fields

- `version`: manifest schema version. The current value is `1`.
- `project`: project name, optional description and optional repository root.
- `stack`: declared language, runtime, package manager and frameworks.
- `agents`: explicit agent profiles with role, provider alias, model and permission mode.
- `providers`: public provider metadata such as alias, type, endpoint and default model.
- `permissions`: default permission mode, command allowlist, sensitive file patterns and network policy.

## Sensitive values

The manifest rejects keys such as `secret`, `token`, `apiKey`, `api_key`, `password`, `credential` and `privateKey` at any nesting level. API keys and other secrets must stay outside versioned configuration.

Create the file manually from `.badock/project.example.json`, then validate it with:

```bash
pnpm --filter @badock/cli badock manifest validate .badock/project.json
```
