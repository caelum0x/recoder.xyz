/**
 * Project Context Settings Page
 * Edit .recoder/ files
 */

import { useEffect, useState } from 'react';
import { RecoderContext } from '~/components/settings/RecoderContext';
import { getWebContainer } from '~/lib/runtime';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SettingsContext');

export default function ContextSettings() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for runtime to be ready
    getWebContainer()
      .then(() => setIsReady(true))
      .catch(() => setIsReady(false));
  }, []);

  const handleSave = async (file: string, content: string) => {
    try {
      const wc = await getWebContainer();
      if (wc?.fs) {
        await wc.fs.writeFile(`.recoder/${file}`, content);
      }
    } catch (error) {
      logger.error('Failed to save file:', error);
    }
  };

  const handleLoad = async (file: string): Promise<string | null> => {
    try {
      const wc = await getWebContainer();
      if (wc?.fs) {
        return await wc.fs.readFile(`.recoder/${file}`, 'utf-8');
      }
      return null;
    } catch {
      return null;
    }
  };

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-bolt-elements-textSecondary">
          Loading runtime...
        </div>
      </div>
    );
  }

  return <RecoderContext onSave={handleSave} onLoad={handleLoad} />;
}
