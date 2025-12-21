/**
 * Platform Selector Component
 * Allows users to choose deployment platform
 */

import type { DeploymentPlatform } from '~/lib/.server/deployment/types';
import { classNames } from '~/utils/classNames';

interface PlatformSelectorProps {
  selected: DeploymentPlatform;
  recommended?: DeploymentPlatform;
  onSelect: (platform: DeploymentPlatform) => void;
}

const platforms = [
  {
    id: 'vercel' as DeploymentPlatform,
    name: 'Vercel',
    description: 'Perfect for Next.js, React, Vue, and Svelte',
    icon: '▲',
    color: 'from-black to-gray-800',
    supported: true,
  },
  {
    id: 'netlify' as DeploymentPlatform,
    name: 'Netlify',
    description: 'Great for static sites and JAMstack apps',
    icon: '◆',
    color: 'from-teal-500 to-cyan-600',
    supported: true,
  },
  {
    id: 'railway' as DeploymentPlatform,
    name: 'Railway',
    description: 'Full-stack apps with Docker and databases',
    icon: '🚂',
    color: 'from-purple-500 to-pink-600',
    supported: false,
  },
];

export function PlatformSelector({ selected, recommended, onSelect }: PlatformSelectorProps) {
  return (
    <div className="space-y-3">
      {platforms.map((platform) => (
        <button
          key={platform.id}
          onClick={() => platform.supported && onSelect(platform.id)}
          disabled={!platform.supported}
          className={classNames(
            'w-full p-4 rounded-lg border-2 transition-all text-left',
            'hover:shadow-lg transform hover:scale-[1.02]',
            selected === platform.id
              ? 'border-green-500 bg-green-500/10'
              : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
            !platform.supported && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="flex items-start gap-3">
            <div className={classNames(
              'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl',
              'bg-gradient-to-br',
              platform.color
            )}>
              {platform.icon}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-bolt-elements-textPrimary">
                  {platform.name}
                </h3>
                {recommended === platform.id && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs rounded-full font-medium">
                    Recommended
                  </span>
                )}
                {!platform.supported && (
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-xs rounded-full font-medium">
                    Coming Soon
                  </span>
                )}
              </div>
              <p className="text-sm text-bolt-elements-textSecondary">
                {platform.description}
              </p>
            </div>

            {selected === platform.id && (
              <div className="flex-shrink-0">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="i-ph:check text-white text-sm" />
                </div>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
