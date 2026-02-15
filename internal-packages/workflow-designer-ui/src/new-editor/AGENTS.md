New Editor: State and Rendering Model (Zustand)

- Purpose: Document the rationale and patterns for the new editor under `internal-packages/workflow-designer-ui/src/new-editor`, replacing the previous provider/context approach in `src/editor/v2`.
- Goal: Prevent unnecessary re-renders so changing a single node’s title or position only re-renders the affected node.

Previous Implementation

- Context-based: Global React Provider/Context in `src/editor/v2`.
- Drawback: Any node update (e.g., title, position) caused all nodes to re-render.

New Architecture

- Store: Zustand store created per editor instance with `createEditorStore`.
- Shape: `EditorState` holds `workspaceId`, `nodesById`, `nodeOrder`, `ui`, and connection maps for quick lookup.
- Provider: `EditorStoreProvider` supplies the store instance scoped to the editor.
- Access: `useEditorStore(selector)` and `useEditorStoreWithEqualityFn(selector, equalityFn)` for selective subscriptions.

Rendering Strategy

- Selective subscriptions: Components subscribe only to minimal slices needed for their render.
- Equality: Use shallow equality for arrays/objects to avoid false-positive updates.
- Identity: Preserve object identity where possible (e.g., cache `ReactFlow` node objects) to prevent child re-renders.
- Memoization: Use `React.memo` for node renderers when props are stable.

Key Store APIs

- `updateNode(id, patch)`: Patches a single node in `nodesById` without touching other nodes.
- Connection maps: `inputConnectionsByNodeId` and `outputConnectionsByNodeId` enable O(1) access to connected ports.

Usage Patterns

- NodeCanvas: Subscribe only to UI slice needed by the canvas (position/selected and order). Keep a cache map to preserve `RFNode` identity for unchanged nodes.
- Node component: Select exactly the node data, derived connection ids, and UI flags needed. Provide a custom equality function that combines strict equality for references with `shallow` for arrays.
- Selectors: Avoid selecting full state. Select by id, e.g., `s.nodesById[id]`, and derive small, stable shapes in the selector.
- Equality helpers: Prefer `useEditorStoreWithEqualityFn(selector, shallow)` for arrays and small objects that can remain referentially stable.

Migration Notes (from `src/editor/v2`)

- Replace context-wide reads with fine-grained selectors against the Zustand store.
- Lift actions into the store (e.g., `updateNode`) and call them from components needing mutations.
- Avoid passing large props down multiple levels; prefer local selection from the store at the leaf.
- Wrap presentational components in `React.memo` only when their props are stable and derived via selectors.

Gotchas

- Avoid new object/array creation in selectors unless using an equality function that treats them as equal when unchanged (`shallow`).
- Keep derivations simple and stable; maintain ordering when mapping to arrays so equality checks can short-circuit.
- Do not subscribe to `ui` or `nodesById` wholesale; always pick the narrow fields by id that your component needs.

Where to Look

- Store: `src/new-editor/store/store.ts` and `src/new-editor/store/context.tsx`.
- Canvas: `src/new-editor/components/node-canvas.tsx`.
- Node: `src/new-editor/components/node/node.tsx`.

Outcome

- Changing a single node’s title or position re-renders only the impacted node and any directly dependent views, not the entire graph.

