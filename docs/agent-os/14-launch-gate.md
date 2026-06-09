# Launch Gate

The paid-user proof is narrow:

```text
signup -> plan -> Space -> connect agent -> connect repo -> task -> artifact -> PR -> preview -> approval -> upgrade/retain
```

Do not expand the first-cycle launch gate into a marketplace, hosted compute platform, edge platform, or broad agency OS. Prove the shared task room first.

Use `AgentOsWorkflowRunner` for the first in-process workflow path. It topologically orders nodes, dispatches agent nodes through `RuntimeAdapterPort.sendTask`, pauses on approval waits, and requires injected handlers for tool, verification, deploy, browser, memory, and artifact nodes. Durable drivers such as Temporal or Trigger.dev can wrap this later; they should not own Recoder's canonical task/run/instruction contract.
