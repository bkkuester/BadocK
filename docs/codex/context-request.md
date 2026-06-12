# Codex Initial Context Request

Use this prompt when starting a BadocK task in a fresh repository context.

```text
Inspect the repository before implementation.

Report:
- current branch and git status
- package manager and available scripts
- relevant project docs
- files likely affected by this issue
- validation commands that should be run
- risks or missing information

Do not implement yet. Wait until the repository context is summarized and the issue scope is clear.
```

This prompt is for context gathering only. It does not grant permission to edit files, execute broad commands, publish branches, push commits or open pull requests.
