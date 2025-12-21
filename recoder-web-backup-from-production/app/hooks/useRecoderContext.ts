/**
 * Client-side hook for .recoder/ context
 */

import { useEffect, useState } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { integrateRecoderContext } from '~/lib/recoder-context/webcontainer-integration';

export function useRecoderContext(isFirstMessage: boolean) {
  const [context, setContext] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadContext();
  }, [isFirstMessage]);

  const loadContext = async () => {
    setIsLoading(true);
    try {
      const wc = await webcontainer;
      const contextPrompt = await integrateRecoderContext(
        {
          readFile: (path, encoding) => wc.fs.readFile(path, encoding || 'utf-8'),
          writeFile: (path, content) => wc.fs.writeFile(path, content),
          mkdir: (path, options) => wc.fs.mkdir(path, options),
          readdir: (path) => wc.fs.readdir(path),
        },
        isFirstMessage
      );
      setContext(contextPrompt);
    } catch (error) {
      console.error('Failed to load .recoder/ context:', error);
      setContext('');
    } finally {
      setIsLoading(false);
    }
  };

  return { context, isLoading, reload: loadContext };
}
