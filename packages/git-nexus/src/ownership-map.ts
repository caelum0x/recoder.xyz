export type OwnershipEntry = {
  pathGlob: string;
  owners: string[];
  source: 'codeowners' | 'package' | 'manual' | 'unknown';
};

export type OwnershipMap = {
  entries: OwnershipEntry[];
};

export function ownersForPath(map: OwnershipMap, path: string): string[] {
  return map.entries
    .filter((entry) => path.startsWith(entry.pathGlob.replace('/**', '')))
    .flatMap((entry) => entry.owners);
}
