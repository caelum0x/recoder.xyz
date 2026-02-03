# Task Execution System

A complete task lifecycle management system for managing asynchronous task execution with sequences and steps.

## Features

- **Task Lifecycle Management**: Create, start, run, and complete tasks
- **Sequence Execution**: Execute steps in parallel within sequences, sequences run serially
- **Patch-based Updates**: Immutable state updates with batching and retry logic
- **Generation Management**: Track and manage individual generation/step lifecycles
- **Real-time Streaming**: Stream task status updates via SSE or async generators
- **Type Safety**: Full TypeScript support with branded ID types

## Quick Start

```typescript
import {
  createTask,
  startTask,
  createMemoryContext,
  WorkspaceIdUtils,
} from '~/lib/services/task-execution';

// Create a context (use your own storage in production)
const context = createMemoryContext();

// Create a task
const { task } = await createTask({
  context,
  workspaceId: WorkspaceIdUtils.generate(),
  name: 'My Task',
  steps: [
    { name: 'Step 1', operationType: 'textGeneration' },
    { name: 'Step 2', operationType: 'action' },
  ],
});

// Start the task
await startTask({
  context,
  taskId: task.id,
  runInBackground: false,
});
```

## API Reference

### Task Operations

#### `createTask(args)`
Create a new task with optional steps.

```typescript
const { task, generations } = await createTask({
  context,
  workspaceId,
  name: 'Task Name',
  steps: [{ name: 'Step 1' }],
});
```

#### `startTask(args)`
Start a task that is in the 'created' state.

```typescript
await startTask({
  context,
  taskId,
  runInBackground: true, // default: true
  onGenerationComplete: (gen) => console.log('Complete:', gen),
  onGenerationError: (gen) => console.log('Error:', gen),
});
```

#### `createAndStartTask(args)`
Create and immediately start a task.

```typescript
const { task } = await createAndStartTask({
  context,
  workspaceId,
  name: 'Quick Task',
  steps: [{ name: 'Step 1' }],
});
```

### Streaming

#### `streamTask(options)`
Create a ReadableStream of task updates.

```typescript
const stream = streamTask({
  taskId,
  context,
  pollInterval: 500,
  timeout: 20 * 60 * 1000,
});

// Use with Response for SSE
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

#### `streamTaskUpdates(options)`
Async generator for consuming task updates.

```typescript
for await (const event of streamTaskUpdates({ taskId, context })) {
  if (event.type === 'data') {
    console.log('Task update:', event.data.task);
  }
}
```

### Patch System

#### `patchTask(task, ...patches)`
Apply patches to a task object immutably.

```typescript
import { patchTask } from '~/lib/services/task-execution';

const updated = patchTask(task,
  { path: 'status', set: 'completed' },
  { path: 'steps.completed', increment: 1 }
);
```

#### `patches` - Type-safe patch creators

```typescript
import { patches } from '~/lib/services/task-execution';

const statusPatch = patches.status.set('inProgress');
const durationPatch = patches.duration.wallClock.increment(100);
const sequencePatch = patches.sequences(0).status.set('running');
const stepPatch = patches.sequences(0).steps(0).status.set('completed');
```

### Storage & Context

#### Custom Storage Implementation

```typescript
import type { TaskStorage } from '~/lib/services/task-execution';

const storage: TaskStorage = {
  async getJson<T>({ path }) { /* ... */ },
  async setJson<T>({ path, data }) { /* ... */ },
  async deleteJson({ path }) { /* ... */ },
  async exists({ path }) { /* ... */ },
};
```

#### Creating a Context

```typescript
import { createTaskContext } from '~/lib/services/task-execution';

const context = createTaskContext({
  storage: myStorage,
  logger: myLogger, // optional
});
```

## Type System

### ID Types

The system uses branded types for type-safe IDs:

```typescript
import { TaskIdUtils, GenerationIdUtils } from '~/lib/services/task-execution';

const taskId = TaskIdUtils.generate();    // TaskId
const genId = GenerationIdUtils.generate(); // GenerationId
```

### Task Status Transitions

```
created -> inProgress -> completed | failed | cancelled
```

### Generation Status Transitions

```
created -> queued -> running -> completed | failed | cancelled
```

## Architecture

```
Task
├── sequences[]
│   ├── steps[]
│   │   └── generationId -> Generation
│   └── status, duration, usage
└── status, steps counts, annotations
```

- **Task**: Top-level container with overall status and metrics
- **Sequence**: Group of steps that run in parallel
- **Step**: Individual work unit linked to a Generation
- **Generation**: The actual execution context and result
