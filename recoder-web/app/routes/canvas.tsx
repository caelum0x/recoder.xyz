import { ClientOnly } from 'remix-utils/client-only';
import { CanvasEditor } from '~/components/canvas/CanvasEditor';

export default function CanvasRoute() {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-recoder-elements-borderColor p-4">
        <h1 className="text-2xl font-bold text-recoder-elements-textPrimary">Visual Canvas Editor</h1>
        <p className="text-sm text-recoder-elements-textSecondary">Drag and drop elements to build your UI</p>
      </div>
      <div className="flex-1">
        <ClientOnly>
          {() => <CanvasEditor />}
        </ClientOnly>
      </div>
    </div>
  );
}
