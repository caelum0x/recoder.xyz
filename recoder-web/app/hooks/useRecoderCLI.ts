/**
 * Hook to setup and manage recoder-code CLI in WebContainer
 */

import { useEffect, useState } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { setupRecoderCLI, isCLIInstalled, getCLIStatus } from '~/lib/webcontainer/cli-installer';

export function useRecoderCLI(userToken?: string) {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupCLI();
  }, [userToken]);

  const setupCLI = async () => {
    try {
      setIsInstalling(true);
      setError(null);

      const wc = await webcontainer;

      // Check if already installed
      if (isCLIInstalled()) {
        const status = await getCLIStatus(wc);
        if (status.working) {
          setIsInstalled(true);
          setIsInstalling(false);
          return;
        }
      }

      // Install and setup
      const success = await setupRecoderCLI(wc, userToken);
      setIsInstalled(success);

      if (!success) {
        setError('Failed to install recoder-code CLI');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      setIsInstalled(false);
    } finally {
      setIsInstalling(false);
    }
  };

  return {
    isInstalled,
    isInstalling,
    error,
    retry: setupCLI,
  };
}
