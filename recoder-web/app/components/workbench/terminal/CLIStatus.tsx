/**
 * CLI Status component - DISABLED
 * 
 * The recoder-code CLI installation was blocking file creation
 * because it awaits WebContainer which is slow to boot.
 * 
 * Files are now created via Docker backend instead.
 */

export function CLIStatus() {
  // Disabled - was blocking file creation by awaiting WebContainer
  return null;
}
