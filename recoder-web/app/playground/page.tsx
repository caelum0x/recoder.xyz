import { CodePlayground } from '@/components/code-generator';

export default function PlaygroundPage() {
  return (
    <div className="h-screen">
      <CodePlayground 
        initialLanguage="javascript"
        collaborationEnabled={true}
      />
    </div>
  );
}
