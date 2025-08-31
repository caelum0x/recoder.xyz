import { useState, useEffect, useCallback } from 'react';

interface GitRepository {
  name: string;
  url: string;
  branch: string;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
  status: 'clean' | 'dirty' | 'syncing';
}

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  branch: string;
  ahead: number;
  behind: number;
}

export const useGit = (projectId: string) => {
  const [repository, setRepository] = useState<GitRepository | null>(null);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initRepository = useCallback(async (repoUrl?: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl })
      });

      const data = await response.json();
      if (data.success) {
        setRepository(data.data.repository);
        await getStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to initialize git repository');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const getStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/git/status`);
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data.status);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to get git status:', err);
    }
  }, [projectId]);

  const addFiles = useCallback(async (files: string[]) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });

      const data = await response.json();
      if (data.success) {
        await getStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add files');
    } finally {
      setLoading(false);
    }
  }, [projectId, getStatus]);

  const commit = useCallback(async (message: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      const data = await response.json();
      if (data.success) {
        await getStatus();
        setRepository(prev => prev ? {
          ...prev,
          lastCommit: data.data.commit
        } : null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to commit changes');
    } finally {
      setLoading(false);
    }
  }, [projectId, getStatus]);

  const push = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/push`, {
        method: 'POST'
      });

      const data = await response.json();
      if (data.success) {
        await getStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to push changes');
    } finally {
      setLoading(false);
    }
  }, [projectId, getStatus]);

  const pull = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/pull`, {
        method: 'POST'
      });

      const data = await response.json();
      if (data.success) {
        await getStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to pull changes');
    } finally {
      setLoading(false);
    }
  }, [projectId, getStatus]);

  const createBranch = useCallback(async (branchName: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchName })
      });

      const data = await response.json();
      if (data.success) {
        await getStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to create branch');
    } finally {
      setLoading(false);
    }
  }, [projectId, getStatus]);

  const switchBranch = useCallback(async (branchName: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchName })
      });

      const data = await response.json();
      if (data.success) {
        await getStatus();
        setRepository(prev => prev ? { ...prev, branch: branchName } : null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to switch branch');
    } finally {
      setLoading(false);
    }
  }, [projectId, getStatus]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    getStatus();
  }, [getStatus]);

  return {
    repository,
    status,
    loading,
    error,
    initRepository,
    getStatus,
    addFiles,
    commit,
    push,
    pull,
    createBranch,
    switchBranch,
    clearError,
    hasChanges: status ? (
      status.modified.length > 0 || 
      status.added.length > 0 || 
      status.deleted.length > 0 || 
      status.untracked.length > 0
    ) : false,
    isClean: status ? (
      status.modified.length === 0 && 
      status.added.length === 0 && 
      status.deleted.length === 0 && 
      status.untracked.length === 0
    ) : true
  };
};
