# Workflow Designer

A visual workflow editor component for building AI workflows, based on React Flow.

## Features

- **Drag-and-drop editor**: Create and connect nodes visually with @xyflow/react
- **Node types**: Support for various node types including:
  - Trigger nodes
  - Text/File/Prompt nodes
  - AI Text Generation nodes
  - AI Image Generation nodes
  - Code Execution nodes
  - API Call nodes
  - Conditional and Loop nodes
  - Output nodes
- **Properties panel**: Configure node settings with a side panel
- **Debug viewer**: Inspect and edit nodes in a table view
- **Model picker**: Select AI models from multiple providers
- **Generation view**: Display AI generation results with markdown support
- **Query result view**: Display vector store query results

## Usage

### Basic Usage

```tsx
import { Editor } from '~/components/workflow-designer';

function MyPage() {
  return (
    <div className="h-screen">
      <Editor />
    </div>
  );
}
```

### With Custom Workflow

```tsx
import { Editor, createEmptyWorkflow } from '~/components/workflow-designer';

const myWorkflow = createEmptyWorkflow('my-workflow');

function MyPage() {
  const handleWorkflowChange = (workflow) => {
    console.log('Workflow updated:', workflow);
  };

  return (
    <Editor
      workflow={myWorkflow}
      onWorkflowChange={handleWorkflowChange}
      showDebugger={true}
    />
  );
}
```

### Individual Components

```tsx
import {
  NodeCanvas,
  PropertiesPanel,
  DebuggerPanel,
  EditorStoreProvider,
  createSampleWorkflow,
} from '~/components/workflow-designer';

function CustomEditor() {
  const workflow = createSampleWorkflow();

  return (
    <EditorStoreProvider workflow={workflow}>
      <div className="flex h-screen">
        <div className="flex-1">
          <NodeCanvas />
        </div>
        <PropertiesPanel />
      </div>
      <DebuggerPanel />
    </EditorStoreProvider>
  );
}
```

### Model Picker

```tsx
import { ModelPicker } from '~/components/workflow-designer';

function Settings() {
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4');

  return (
    <ModelPicker
      currentProvider={provider}
      currentModelId={model}
      onSelect={(p, m) => {
        setProvider(p);
        setModel(m);
      }}
    />
  );
}
```

### Generation View

```tsx
import { GenerationView } from '~/components/workflow-designer';

function Results({ generation }) {
  return <GenerationView generation={generation} />;
}
```

## Components

| Component | Description |
|-----------|-------------|
| `Editor` | Main editor with canvas, toolbar, and properties panel |
| `StandaloneEditor` | Self-contained editor with built-in state |
| `NodeCanvas` | React Flow canvas with nodes and edges |
| `NodeToolbar` | Left sidebar with node creation buttons |
| `PropertiesPanel` | Right sidebar for editing selected node |
| `DebuggerPanel` | Bottom panel for debugging nodes |
| `ModelPicker` | Dropdown for selecting AI models |
| `GenerationView` | Display component for AI generation results |
| `QueryResultView` | Display component for vector query results |
| `Background` | Custom canvas background with dot grid |

## Store

The editor uses Zustand for state management:

```tsx
import { useEditorStore } from '~/components/workflow-designer';

function MyComponent() {
  const nodes = useEditorStore((s) => s.nodes);
  const addNode = useEditorStore((s) => s.addNode);
  const updateNode = useEditorStore((s) => s.updateNode);

  // ...
}
```

## Types

Key types exported from the module:

- `Workflow` - Complete workflow definition
- `WorkflowNode` - Node in the workflow
- `Connection` - Edge between nodes
- `NodeId`, `InputId`, `OutputId` - Branded ID types
- `NodeContentType` - Union of node content types
- `Generation` - AI generation result
- `ModelPickerGroup` - Model picker configuration

## Dependencies

- `@xyflow/react` - React Flow for the visual editor
- `classnames` - Utility for conditional CSS classes
- `zustand` - State management
