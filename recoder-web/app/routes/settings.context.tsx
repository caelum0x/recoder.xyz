/**
 * Project Context Settings Page
 * Edit .recoder/ files
 */

import { useEffect, useState } from 'react';
import { RecoderContext } from '~/components/settings/RecoderContext';
import { webcontainer } from '~/lib/webcontainer';

export default function ContextSettings() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for WebContainer to be ready
    webcontainer.then(() => setIsReady(true));
  }, []);

  const handleSave = async (file: string, content: string) => {
    const wc = await webcontainer;
    await wc.fs.writeFile(`.recoder/${file}`, content);
  };

  const handleLoad = async (file: string): Promise<string | null> => {
    try {
      const wc = await webcontainer;
      return await wc.fs.readFile(`.recoder/${file}`, 'utf-8');
    } catch {
      return null;
    }
  };

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-bolt-elements-textSecondary">
          Loading WebContainer...
        </div>
      </div>
    );
  }

  return <RecoderContext onSave={handleSave} onLoad={handleLoad} />;
}
