/**
 * Deployment Progress Component
 * Shows deployment progress with animated steps
 */

import { useEffect, useState } from 'react';
import type { DeploymentPlatform } from '~/lib/.server/deployment/types';

interface DeploymentProgressProps {
  platform: DeploymentPlatform;
}

const steps = [
  { id: 'prepare', label: 'Preparing files', iconClass: 'i-ph:package' },
  { id: 'upload', label: 'Uploading to cloud', iconClass: 'i-ph:cloud-arrow-up' },
  { id: 'build', label: 'Building application', iconClass: 'i-ph:hammer' },
  { id: 'deploy', label: 'Deploying', iconClass: 'i-ph:rocket-launch' },
];

export function DeploymentProgress({ platform }: DeploymentProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Simulate progress
    const intervals = [2000, 3000, 4000, 3000]; // Duration for each step
    let timeoutId: NodeJS.Timeout;

    const advanceStep = (step: number) => {
      if (step < steps.length) {
        timeoutId = setTimeout(() => {
          setCurrentStep(step + 1);
          advanceStep(step + 1);
        }, intervals[step] || 2000);
      }
    };

    advanceStep(0);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="py-8">
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className="flex items-center gap-4"
          >
            {/* Icon/Status */}
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center text-2xl
              transition-all duration-500
              ${index < currentStep 
                ? 'bg-green-500 scale-100' 
                : index === currentStep 
                ? 'bg-blue-500 scale-110 animate-pulse' 
                : 'bg-recoder-elements-background-depth-3 scale-90 opacity-50'
              }
            `}>
              {index < currentStep ? <div className="i-ph:check" /> : <div className={step.iconClass} />}
            </div>

            {/* Label */}
            <div className="flex-1">
              <div className={`
                font-medium transition-all
                ${index <= currentStep 
                  ? 'text-recoder-elements-textPrimary' 
                  : 'text-recoder-elements-textTertiary'
                }
              `}>
                {step.label}
              </div>
              {index === currentStep && (
                <div className="text-sm text-recoder-elements-textSecondary mt-1">
                  In progress...
                </div>
              )}
              {index < currentStep && (
                <div className="text-sm text-green-500 mt-1">
                  Complete
                </div>
              )}
            </div>

            {/* Progress Indicator */}
            {index === currentStep && (
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            )}
          </div>
        ))}
      </div>

      {/* Platform Info */}
      <div className="mt-8 p-4 bg-recoder-elements-background-depth-3 rounded-lg border border-recoder-elements-borderColor">
        <div className="text-sm text-recoder-elements-textSecondary">
          Deploying to <span className="font-semibold text-recoder-elements-textPrimary capitalize">{platform}</span>
        </div>
        <div className="text-xs text-recoder-elements-textTertiary mt-1">
          This usually takes 2-5 minutes
        </div>
      </div>
    </div>
  );
}
