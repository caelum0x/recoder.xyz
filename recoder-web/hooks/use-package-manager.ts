import { useState, useEffect, useCallback } from 'react';

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface Dependency {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency';
  description?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  size?: string;
  lastUpdate?: string;
}

interface PackageManagerOperation {
  type: 'install' | 'uninstall' | 'update' | 'audit';
  package?: string;
  version?: string;
  dev?: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string[];
  error?: string;
}

export const usePackageManager = (projectId: string) => {
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [operations, setOperations] = useState<PackageManagerOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [packageManager, setPackageManager] = useState<'npm' | 'yarn' | 'pnpm'>('npm');

  const loadPackageInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/package`);
      const data = await response.json();
      
      if (data.success) {
        setPackageInfo(data.data.packageInfo);
        setDependencies(data.data.dependencies || []);
        setPackageManager(data.data.packageManager || 'npm');
      }
    } catch (error) {
      console.error('Error loading package info:', error);
    }
  }, [projectId]);

  const installPackage = useCallback(async (packageName: string, version?: string, dev = false) => {
    const operation: PackageManagerOperation = {
      type: 'install',
      package: packageName,
      version,
      dev,
      status: 'pending',
      output: []
    };

    setOperations(prev => [...prev, operation]);
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/package/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: packageName,
          version,
          dev,
          packageManager
        })
      });

      const data = await response.json();
      
      if (data.success) {
        operation.status = 'completed';
        operation.output = data.data.output;
        await loadPackageInfo();
      } else {
        operation.status = 'failed';
        operation.error = data.error;
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Installation failed';
    } finally {
      setLoading(false);
      setOperations(prev => prev.map(op => op === operation ? operation : op));
    }
  }, [projectId, packageManager, loadPackageInfo]);

  const uninstallPackage = useCallback(async (packageName: string) => {
    const operation: PackageManagerOperation = {
      type: 'uninstall',
      package: packageName,
      status: 'pending',
      output: []
    };

    setOperations(prev => [...prev, operation]);
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/package/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: packageName,
          packageManager
        })
      });

      const data = await response.json();
      
      if (data.success) {
        operation.status = 'completed';
        operation.output = data.data.output;
        await loadPackageInfo();
      } else {
        operation.status = 'failed';
        operation.error = data.error;
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Uninstallation failed';
    } finally {
      setLoading(false);
      setOperations(prev => prev.map(op => op === operation ? operation : op));
    }
  }, [projectId, packageManager, loadPackageInfo]);

  const updatePackage = useCallback(async (packageName?: string) => {
    const operation: PackageManagerOperation = {
      type: 'update',
      package: packageName,
      status: 'pending',
      output: []
    };

    setOperations(prev => [...prev, operation]);
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/package/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: packageName,
          packageManager
        })
      });

      const data = await response.json();
      
      if (data.success) {
        operation.status = 'completed';
        operation.output = data.data.output;
        await loadPackageInfo();
      } else {
        operation.status = 'failed';
        operation.error = data.error;
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Update failed';
    } finally {
      setLoading(false);
      setOperations(prev => prev.map(op => op === operation ? operation : op));
    }
  }, [projectId, packageManager, loadPackageInfo]);

  const auditPackages = useCallback(async () => {
    const operation: PackageManagerOperation = {
      type: 'audit',
      status: 'pending',
      output: []
    };

    setOperations(prev => [...prev, operation]);

    try {
      const response = await fetch(`/api/projects/${projectId}/package/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageManager })
      });

      const data = await response.json();
      
      if (data.success) {
        operation.status = 'completed';
        operation.output = data.data.output;
      } else {
        operation.status = 'failed';
        operation.error = data.error;
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Audit failed';
    } finally {
      setOperations(prev => prev.map(op => op === operation ? operation : op));
    }
  }, [projectId, packageManager]);

  const runScript = useCallback(async (scriptName: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/package/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: scriptName,
          packageManager
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Script execution failed'
      };
    }
  }, [projectId, packageManager]);

  const searchPackages = useCallback(async (query: string) => {
    try {
      const response = await fetch(`/api/packages/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      return data.success ? data.data.packages : [];
    } catch (error) {
      console.error('Error searching packages:', error);
      return [];
    }
  }, []);

  const getPackageInfo = useCallback(async (packageName: string) => {
    try {
      const response = await fetch(`/api/packages/info/${encodeURIComponent(packageName)}`);
      const data = await response.json();
      return data.success ? data.data.package : null;
    } catch (error) {
      console.error('Error getting package info:', error);
      return null;
    }
  }, []);

  const changePackageManager = useCallback((newPackageManager: 'npm' | 'yarn' | 'pnpm') => {
    setPackageManager(newPackageManager);
  }, []);

  const clearOperations = useCallback(() => {
    setOperations([]);
  }, []);

  useEffect(() => {
    loadPackageInfo();
  }, [loadPackageInfo]);

  return {
    packageInfo,
    dependencies,
    operations,
    loading,
    packageManager,
    loadPackageInfo,
    installPackage,
    uninstallPackage,
    updatePackage,
    auditPackages,
    runScript,
    searchPackages,
    getPackageInfo,
    changePackageManager,
    clearOperations,
    hasOperations: operations.length > 0,
    runningOperations: operations.filter(op => op.status === 'running' || op.status === 'pending').length
  };
};
