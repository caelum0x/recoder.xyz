# Production Rule

- Production deploy, preview deploy, DNS, TLS, WAF, billing, auth, and customer-visible delivery changes require an approval gate unless the Recoder task spec explicitly marks them as safe automation.
- Do not mark runtime work complete unless artifacts include the relevant evidence: command output, changed files, PR or preview URL, and any browser verification result requested by the task spec.
- Treat Daytona, E2B, Playwright, and browser agents as execution substrates. They may attach evidence, but they do not own task, approval, artifact, or memory state.
- Prefer signed preview URLs and explicit preview health over inferred runtime success.
- If host/resource pressure affects verification, report it as environment evidence rather than a product success.
