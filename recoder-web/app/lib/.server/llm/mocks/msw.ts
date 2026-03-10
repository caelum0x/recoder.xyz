/**
 * MSW (Mock Service Worker) stub
 *
 * This file provides no-op stubs for the MSW server interface.
 * It exists solely to satisfy imports in test files (e.g. clearcut-logger.test.ts)
 * that reference MSW without the full msw package being installed.
 * It is NOT used in any production code path.
 */

// No-op server matching the subset of the MSW API consumed by tests
export const server = {
  listen: (_config?: unknown) => {},
  resetHandlers: (..._handlers: unknown[]) => {},
  close: () => {},
};
