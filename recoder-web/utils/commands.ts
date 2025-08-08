/**
 * Command utilities for human relay operations
 */

export function getCommand(commandName: string): string {
  return `recoder.${commandName}`;
}