export interface ServerVersion {
  version: string;
  releaseDate: string;
  changelog: string[];
  breaking: boolean;
  deprecated?: boolean;
}

export interface VersionedServer {
  serverId: string;
  currentVersion: string;
  latestVersion: string;
  versions: ServerVersion[];
  updateAvailable: boolean;
}

// Mock version data - in production, fetch from registry/API
const SERVER_VERSIONS: Record<string, ServerVersion[]> = {
  memory: [
    {
      version: '1.2.0',
      releaseDate: '2025-12-01',
      changelog: ['Added graph visualization', 'Improved query performance', 'Bug fixes'],
      breaking: false,
    },
    {
      version: '1.1.0',
      releaseDate: '2025-11-15',
      changelog: ['Added batch operations', 'Enhanced error handling'],
      breaking: false,
    },
    {
      version: '1.0.0',
      releaseDate: '2025-11-01',
      changelog: ['Initial release'],
      breaking: false,
    },
  ],
  filesystem: [
    {
      version: '2.0.0',
      releaseDate: '2025-12-01',
      changelog: ['New permission system', 'Async file operations', 'Breaking: Changed API'],
      breaking: true,
    },
    {
      version: '1.5.0',
      releaseDate: '2025-11-20',
      changelog: ['Added file watching', 'Performance improvements'],
      breaking: false,
    },
  ],
};

export function getServerVersions(serverId: string): ServerVersion[] {
  return SERVER_VERSIONS[serverId] || [];
}

export function getLatestVersion(serverId: string): string {
  const versions = getServerVersions(serverId);
  return versions[0]?.version || '1.0.0';
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export function hasUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  return compareVersions(latestVersion, currentVersion) > 0;
}

export function getVersionInfo(serverId: string, currentVersion: string): VersionedServer {
  const versions = getServerVersions(serverId);
  const latestVersion = getLatestVersion(serverId);
  
  return {
    serverId,
    currentVersion,
    latestVersion,
    versions,
    updateAvailable: hasUpdateAvailable(currentVersion, latestVersion),
  };
}

export function getChangelog(serverId: string, fromVersion: string, toVersion: string): string[] {
  const versions = getServerVersions(serverId);
  const changelog: string[] = [];

  for (const version of versions) {
    if (compareVersions(version.version, fromVersion) > 0 &&
        compareVersions(version.version, toVersion) <= 0) {
      changelog.push(`v${version.version}:`);
      changelog.push(...version.changelog.map(c => `  - ${c}`));
    }
  }

  return changelog;
}
