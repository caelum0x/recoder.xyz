# Git Nexus Context

Git Nexus is the repo intelligence provider used before instruction compilation.

Package:

- `packages/git-nexus`

Outputs:

- repo map
- dependency graph
- ownership map
- test target map
- impact report
- context pack

Compiler use:

```text
TaskSpec target paths
  -> impact report
  -> related tests
  -> risky files
  -> package boundaries
  -> InstructionBundle source refs
```

The goal is focused context, not dumping the whole repository into a runtime prompt.
