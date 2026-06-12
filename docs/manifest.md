# BadocK Project Manifest

The project manifest lives at `.badock/project.json` and contains versioned, non-secret configuration.

## Versioned fields

- `version`: manifest schema version. The current value is `1`.
- `project`: project name, optional description and optional repository root.
- `stack`: declared language, runtime, package manager and frameworks.
- `agents`: explicit agent profiles with role, provider alias, model, permission mode and optional capabilities.
- `providers`: public provider metadata such as alias, type, endpoint, default model and non-secret parameters.
- `permissions`: default permission mode, command allowlist, sensitive file patterns and network policy.

## Sensitive values

The manifest rejects keys such as `secret`, `token`, `apiKey`, `api_key`, `accessKey`, `password`, `credential`, `authorization` and `privateKey` at any nesting level. API keys and other secrets must stay outside versioned configuration.

Agents must access model providers through the Provider Gateway. The manifest may declare public provider facts, but it must never contain raw keys, bearer tokens, passwords or provider credentials. Runtime secrets belong in an OS secret store or equivalent local secret store.

Every agent `provider` must point to a provider declared in the same manifest. Duplicate provider IDs and duplicate agent IDs are rejected so run plans can trace a selected agent back to one provider/model pair.

Create the file manually from `.badock/project.example.json`, then validate it with:

```bash
pnpm --filter @badock/cli badock manifest validate .badock/project.json
```
