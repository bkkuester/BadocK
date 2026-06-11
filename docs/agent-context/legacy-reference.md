# Legacy Reference — Environment / Orquestração de Agentes IDE

Last consolidated: 2026-06-11

This file preserves the operational interpretation of the uploaded legacy discussion named `Orquestração de Agentes IDE.txt`.

Important normalization rule:

- `BadocK` is the official current project name.
- `Environment` is only a legacy name/reference.
- If legacy material says Environment, agents must map the intended product definition to BadocK unless explicitly analyzing old repository/code.

## Key legacy conclusions retained

1. The product is not born as a full IDE.
2. The product is an ADOC — Agentic Development Operation Center.
3. The MVP must be an operational command center, not a polished IDE.
4. The future may evolve into desktop app, workbench and IDE.
5. AI can suggest stack and agent teams, but the result must become explicit configuration.
6. GitHub is relevant, but local projects and local issues must be supported.
7. Agents must run through an adapter layer, not a single closed provider integration.
8. Work must happen by issue/run, preferably in isolated branch/worktree.
9. Logs, diff, review and cost must be captured.
10. Secrets must not be exposed to agents or stored in versioned manifests.

## Preserved core sentence

BadocK is a local-first ADOC that turns project + issue + model + agent into traceable, reviewable and measurable execution.

## Preserved MVP flow

```txt
Usuário abre projeto
↓
BadocK detecta stack
↓
Chat geral ajuda a criar/melhorar issue
↓
IA sugere agente adequado
↓
Usuário aprova agente/modelo/permissões
↓
BadocK cria branch/worktree
↓
Agente executa
↓
BadocK captura logs, comandos e diff
↓
Review-agent avalia resultado
↓
Usuário vê resumo
↓
Usuário cria PR ou descarta run
```

## Preserved subissue sequence

1. Definir ADOC Core e manifesto de projeto.
2. Implementar scanner inicial de projeto e stack.
3. Criar Issue Manager local com formato padrão.
4. Implementar Agent Runtime Adapter inicial.
5. Executar issue em branch/worktree isolado.
6. Criar painel de run com logs, diff e resumo.
7. Integrar GitHub Issues e Pull Requests parcialmente.
8. Implementar Cost Tracker básico por agente/modelo.

## Scope warning retained

The biggest risk is scope explosion: IDE, GitHub client, autonomous agent, cost dashboard, model manager, security system, PR tool, orchestrator, evaluator, editor, terminal and CI manager all at once.

The MVP must stay ugly, functional and traceable.
