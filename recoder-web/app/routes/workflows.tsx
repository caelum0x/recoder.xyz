import type { MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { StandaloneEditor } from '~/components/workflow-designer';

export const meta: MetaFunction = () => {
  return [
    { title: 'Workflow Designer - Recoder.xyz' },
    { name: 'description', content: 'Build AI workflows with a visual editor' },
  ];
};

export default function Workflows() {
  return (
    <div className="h-screen w-full flex flex-col bg-recoder-elements-background-depth-1">
      <ClientOnly
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <p className="text-recoder-elements-textSecondary">Loading workflow designer...</p>
          </div>
        }
      >
        {() => <StandaloneEditor />}
      </ClientOnly>
    </div>
  );
}
