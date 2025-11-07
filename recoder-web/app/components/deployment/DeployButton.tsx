/**
 * Deploy Button Component
 * Main button to trigger deployment modal
 */

import { useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { DeploymentModal } from './DeploymentModal';

interface DeployButtonProps {
  className?: string;
}

export function DeployButton({ className }: DeployButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`
          flex items-center gap-2 px-4 py-2
          bg-gradient-to-r from-orange-500 to-orange-600
          hover:from-orange-600 hover:to-orange-700
          text-white rounded-lg font-medium
          transition-all shadow-lg hover:shadow-xl
          transform hover:scale-105
          ${className || ''}
        `}
        title="Deploy your project to the cloud"
      >
        <div className="i-ph:rocket-launch text-lg" />
        <span>Deploy</span>
      </button>

      <DeploymentModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
