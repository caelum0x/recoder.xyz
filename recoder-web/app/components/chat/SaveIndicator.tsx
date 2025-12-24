import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface SaveIndicatorProps {
  isSaving: boolean;
  lastSaved?: Date;
}

export function SaveIndicator({ isSaving, lastSaved }: SaveIndicatorProps) {
  // Disabled - no notification shown
  return null;
}
