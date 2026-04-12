"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type MountedOnlyProps = {
  readonly children: ReactNode;
};

export const MountedOnly = ({ children }: MountedOnlyProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
};
