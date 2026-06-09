export * from './queues/outbox-queue';
export * from './activities/publish-outbox';
export * from './workflows/run-task-workflow';
export * from './schedulers/outbox-drain-scheduler';

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('agent-worker ready: mount queues/workflows from the backend service container.');
}
