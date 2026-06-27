/**
 * commandExists — truthful "is this binary present?" probe.
 *
 * Backed by `which`. A thin, named helper so availability checks read clearly.
 */
import { which } from './which.js';

export async function commandExists(bin: string): Promise<boolean> {
  return Boolean(await which(bin));
}
