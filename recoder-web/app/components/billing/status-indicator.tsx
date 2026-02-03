'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { classNames } from '~/utils/classNames';

export type UsageStatus = 'normal' | 'warning' | 'danger';

interface StatusIndicatorProps {
  status: UsageStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function StatusIndicator({
  status,
  size = 'md',
  showIcon = true,
  className
}: StatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'danger':
        return {
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          icon: AlertTriangle,
          label: 'Critical'
        };
      case 'warning':
        return {
          color: 'text-accent-500',
          bgColor: 'bg-accent-500/10',
          icon: AlertTriangle,
          label: 'Warning'
        };
      default:
        return {
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          icon: CheckCircle,
          label: 'Normal'
        };
    }
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'sm':
        return {
          iconSize: 'h-3 w-3',
          padding: 'p-1'
        };
      case 'lg':
        return {
          iconSize: 'h-5 w-5',
          padding: 'p-2'
        };
      default:
        return {
          iconSize: 'h-4 w-4',
          padding: 'p-1.5'
        };
    }
  };

  const statusConfig = getStatusConfig();
  const sizeConfig = getSizeConfig();
  const Icon = statusConfig.icon;

  if (!showIcon) {
    return (
      <div
        className={classNames(
          'inline-flex items-center justify-center rounded-full',
          statusConfig.bgColor,
          sizeConfig.padding,
          className
        )}
        aria-label={statusConfig.label}
      >
        <div
          className={classNames(
            'rounded-full',
            status === 'danger' ? 'bg-red-500' : status === 'warning' ? 'bg-accent-500' : 'bg-green-500',
            size === 'sm' ? 'h-1.5 w-1.5' : size === 'lg' ? 'h-3 w-3' : 'h-2 w-2'
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'inline-flex items-center justify-center rounded-lg',
        statusConfig.bgColor,
        sizeConfig.padding,
        className
      )}
      aria-label={statusConfig.label}
    >
      <Icon className={classNames(statusConfig.color, sizeConfig.iconSize)} />
    </div>
  );
}

// Utility function to determine status based on usage
export function getUsageStatus(used: number, total: number): UsageStatus {
  if (total <= 0) return 'normal';

  const percentage = (used / total) * 100;

  if (percentage >= 90) return 'danger';
  if (percentage >= 70) return 'warning';
  return 'normal';
}
