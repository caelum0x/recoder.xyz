/**
 * Client-side hook for .recoder/ context
 */

import { useEffect, useState } from 'react';
import { getWebContainer } from '~/lib/runtime';
import { integrateRecoderContext } from '~/lib/recoder-context/webcontainer-integration';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('RecoderContext');

export function useRecoderContext(isFirstMessage: boolean) {
  const [context, setContext] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadContext();
  }, [isFirstMessage]);

  const loadContext = async () => {
    setIsLoading(true);
    try {
      const wc = await getWebContainer();
      const contextPrompt = await integrateRecoderContext(
        {
          readFile: async (path: string, _encoding?: string) => {
            const result = await wc.fs.readFile(path, 'utf-8');
            return result as string;
          },
          writeFile: async (path: string, content: string) => { await wc.fs.writeFile(path, content); },
          mkdir: async (path: string, options?: { recursive?: boolean }) => { await wc.fs.mkdir(path, options as any); },
          readdir: async (path: string) => wc.fs.readdir(path) as unknown as string[],
        },
        isFirstMessage
      );
      setContext(contextPrompt);
    } catch (error) {
      logger.error('Failed to load .recoder/ context:', error);
      setContext('');
    } finally {
      setIsLoading(false);
    }
  };

  return { context, isLoading, reload: loadContext };
}
