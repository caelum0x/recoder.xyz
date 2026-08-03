/**
 * Resolution stub for the "vscode" module in vitest.
 *
 * The real `vscode` API only exists inside a VS Code extension host, and the
 * npm `vscode` package has no resolvable entry point. Specs that touch vscode
 * mock it with `vi.mock("vscode", factory)`; this stub exists solely so vitest
 * can resolve the module id. Importing it without a mock fails loudly.
 */

throw new Error("The 'vscode' module is only available inside VS Code. Mock it with vi.mock(\"vscode\", factory).")

export {}
