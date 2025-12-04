/**
 * Hook to setup and manage recoder-code CLI - DISABLED
 * 
 * The CLI installation was blocking file creation by awaiting WebContainer.
 * Files are now created via Docker backend instead.
 */

export function useRecoderCLI(_userToken?: string) {
  // Disabled - was blocking file creation
  return {
    isInstalled: false,
    isInstalling: false,
    error: null,
    retry: () => {},
  };
}
