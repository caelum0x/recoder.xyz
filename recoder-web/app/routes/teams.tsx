import type { MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';
import { TeamsManagement } from '~/components/teams/teams-management';

export const meta: MetaFunction = () => {
  return [
    { title: 'Teams - Recoder.xyz' },
    { name: 'description', content: 'Manage your team members and invitations' },
  ];
};

export default function Teams() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <Header />
      <ClientOnly
        fallback={
          <div className="flex-1 p-8">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-8">Teams</h1>
              <div className="text-bolt-elements-textSecondary">Loading team management...</div>
            </div>
          </div>
        }
      >
        {() => (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <TeamsManagement />
            </div>
          </div>
        )}
      </ClientOnly>
    </div>
  );
}
