import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { DeviceService, FileSystemService } from '../../services/MobileNativeModules';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface OfflineAction {
  id: string;
  uuid: string;
  type: 'create' | 'update' | 'delete';
  resource: 'project' | 'file' | 'generation' | 'user';
  data: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
}

export interface OfflineProject {
  id: string;
  name: string;
  description?: string;
  type: string;
  framework?: string;
  language?: string;
  files: OfflineFile[];
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'active' | 'completed';
  isOfflineOnly: boolean;
  lastSyncAt?: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
}

export interface OfflineFile {
  id: string;
  projectId: string;
  name: string;
  path: string;
  content: string;
  language: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  isModified: boolean;
  localPath?: string; // For large files stored in filesystem
}

export interface OfflineGeneration {
  id: string;
  projectId?: string;
  prompt: string;
  type: string;
  framework?: string;
  language?: string;
  generatedCode?: string;
  files?: any[];
  status: 'draft' | 'generating' | 'completed' | 'failed';
  createdAt: number;
  tokensUsed?: number;
  isOfflineGenerated: boolean;
}

export interface SyncConflict {
  id: string;
  resource: string;
  resourceId: string;
  localData: any;
  serverData: any;
  conflictType: 'modified' | 'deleted' | 'created';
  createdAt: number;
  resolved: boolean;
}

export interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: number | null;
  syncError: string | null;
  queue: OfflineAction[];
  projects: Record<string, OfflineProject>;
  files: Record<string, OfflineFile>;
  generations: Record<string, OfflineGeneration>;
  conflicts: Record<string, SyncConflict>;
  syncStats: {
    totalActions: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncDuration: number;
  };
  settings: {
    autoSync: boolean;
    syncInterval: number; // in milliseconds
    maxRetries: number;
    offlineStorageLimit: number; // in bytes
    compressFiles: boolean;
    syncOnWiFiOnly: boolean;
  };
  storageInfo: {
    usedSpace: number;
    availableSpace: number;
    projectCount: number;
    fileCount: number;
  };
}

const initialState: OfflineState = {
  isOnline: true,
  isSyncing: false,
  lastSyncAt: null,
  syncError: null,
  queue: [],
  projects: {},
  files: {},
  generations: {},
  conflicts: {},
  syncStats: {
    totalActions: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    lastSyncDuration: 0,
  },
  settings: {
    autoSync: true,
    syncInterval: 30000, // 30 seconds
    maxRetries: 3,
    offlineStorageLimit: 100 * 1024 * 1024, // 100MB
    compressFiles: true,
    syncOnWiFiOnly: false,
  },
  storageInfo: {
    usedSpace: 0,
    availableSpace: 0,
    projectCount: 0,
    fileCount: 0,
  },
};

// Async thunks
export const initializeOfflineStorage = createAsyncThunk(
  'offline/initialize',
  async (_, { rejectWithValue }) => {
    try {
      // Load offline data from AsyncStorage
      const [projects, files, generations, queue, conflicts] = await Promise.all([
        AsyncStorage.getItem('offline_projects'),
        AsyncStorage.getItem('offline_files'),
        AsyncStorage.getItem('offline_generations'),
        AsyncStorage.getItem('offline_queue'),
        AsyncStorage.getItem('offline_conflicts'),
      ]);

      return {
        projects: projects ? JSON.parse(projects) : {},
        files: files ? JSON.parse(files) : {},
        generations: generations ? JSON.parse(generations) : {},
        queue: queue ? JSON.parse(queue) : [],
        conflicts: conflicts ? JSON.parse(conflicts) : {},
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const createOfflineProject = createAsyncThunk(
  'offline/createProject',
  async (
    projectData: Omit<OfflineProject, 'id' | 'createdAt' | 'updatedAt' | 'files' | 'isOfflineOnly' | 'syncStatus'>,
    { getState, dispatch }
  ) => {
    try {
      const timestamp = Date.now();
      const project: OfflineProject = {
        ...projectData,
        id: `offline_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        files: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        isOfflineOnly: true,
        syncStatus: 'pending',
      };

      // Create offline action for sync
      const action: OfflineAction = {
        id: `action_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        uuid: project.id,
        type: 'create',
        resource: 'project',
        data: project,
        timestamp,
        retries: 0,
        maxRetries: 3,
        priority: 'normal',
        status: 'pending',
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem('offline_projects', JSON.stringify({
        ...((getState() as any).offline.projects),
        [project.id]: project,
      }));

      dispatch(addToSyncQueue(action));

      return project;
    } catch (error) {
      throw error;
    }
  }
);

export const createOfflineFile = createAsyncThunk(
  'offline/createFile',
  async (
    { projectId, fileData }: { projectId: string; fileData: Omit<OfflineFile, 'id' | 'createdAt' | 'updatedAt' | 'isModified'> },
    { getState, dispatch }
  ) => {
    try {
      const timestamp = Date.now();
      const file: OfflineFile = {
        ...fileData,
        id: `file_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        projectId,
        createdAt: timestamp,
        updatedAt: timestamp,
        isModified: true,
      };

      // Store large files in filesystem
      if (file.content.length > 10000) { // 10KB threshold
        const filePath = `projects/${projectId}/${file.name}`;
        await FileSystemService.createDirectory(`projects/${projectId}`);
        await FileSystemService.writeFile(filePath, file.content);
        file.localPath = filePath;
        file.content = ''; // Clear content as it's stored in file
      }

      // Create offline action for sync
      const action: OfflineAction = {
        id: `action_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        uuid: file.id,
        type: 'create',
        resource: 'file',
        data: file,
        timestamp,
        retries: 0,
        maxRetries: 3,
        priority: 'normal',
        status: 'pending',
      };

      dispatch(addToSyncQueue(action));

      return file;
    } catch (error) {
      throw error;
    }
  }
);

export const syncOfflineData = createAsyncThunk(
  'offline/sync',
  async (_, { getState, dispatch, rejectWithValue }) => {
    try {
      const state = getState() as { offline: OfflineState; auth: { token: string } };
      const { queue, settings } = state.offline;
      const token = state.auth.token;

      if (!token) {
        throw new Error('No authentication token available');
      }

      // Check network status
      const networkInfo = await DeviceService.getNetworkInfo();
      if (!networkInfo.isConnected) {
        throw new Error('No network connection');
      }

      if (settings.syncOnWiFiOnly && networkInfo.type !== 'wifi') {
        throw new Error('WiFi required for sync');
      }

      const startTime = Date.now();
      let successCount = 0;
      let failCount = 0;

      // Process pending actions
      const pendingActions = queue.filter(action => action.status === 'pending');
      
      for (const action of pendingActions) {
        try {
          dispatch(updateActionStatus({ id: action.id, status: 'syncing' }));

          const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              actions: [action],
              deviceId: DeviceService.getDeviceInfo().deviceId,
              lastSyncTime: state.offline.lastSyncAt || 0,
            }),
          });

          if (!response.ok) {
            throw new Error(`Sync failed: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success) {
            dispatch(updateActionStatus({ id: action.id, status: 'synced' }));
            successCount++;
          } else {
            throw new Error(result.error || 'Sync failed');
          }
        } catch (error) {
          dispatch(updateActionStatus({ 
            id: action.id, 
            status: 'failed', 
            error: error.message 
          }));
          failCount++;
        }
      }

      const syncDuration = Date.now() - startTime;

      return {
        successCount,
        failCount,
        syncDuration,
        timestamp: Date.now(),
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const resolveConflict = createAsyncThunk(
  'offline/resolveConflict',
  async (
    { conflictId, resolution }: { conflictId: string; resolution: 'local' | 'server' | 'merge' },
    { getState, dispatch }
  ) => {
    try {
      const state = getState() as { offline: OfflineState };
      const conflict = state.offline.conflicts[conflictId];

      if (!conflict) {
        throw new Error('Conflict not found');
      }

      let resolvedData;
      switch (resolution) {
        case 'local':
          resolvedData = conflict.localData;
          break;
        case 'server':
          resolvedData = conflict.serverData;
          break;
        case 'merge':
          // Simple merge strategy - in production, use more sophisticated merging
          resolvedData = { ...conflict.serverData, ...conflict.localData };
          break;
      }

      // Update the resource with resolved data
      switch (conflict.resource) {
        case 'project':
          dispatch(updateOfflineProject({ id: conflict.resourceId, data: resolvedData }));
          break;
        case 'file':
          dispatch(updateOfflineFile({ id: conflict.resourceId, data: resolvedData }));
          break;
      }

      return { conflictId, resolvedData };
    } catch (error) {
      throw error;
    }
  }
);

export const calculateStorageInfo = createAsyncThunk(
  'offline/calculateStorage',
  async (_, { getState }) => {
    try {
      const state = getState() as { offline: OfflineState };
      const { projects, files } = state.offline;

      let usedSpace = 0;
      let fileCount = 0;

      // Calculate storage usage
      Object.values(files).forEach(file => {
        usedSpace += file.size;
        fileCount++;
      });

      // Add project metadata size
      usedSpace += JSON.stringify(projects).length;

      // Get available device storage (mock implementation)
      const availableSpace = 1024 * 1024 * 1024; // 1GB mock

      return {
        usedSpace,
        availableSpace,
        projectCount: Object.keys(projects).length,
        fileCount,
      };
    } catch (error) {
      throw error;
    }
  }
);

// Offline slice
const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    addToSyncQueue: (state, action: PayloadAction<OfflineAction>) => {
      state.queue.push(action.payload);
      state.syncStats.totalActions++;
    },
    removeFromSyncQueue: (state, action: PayloadAction<string>) => {
      state.queue = state.queue.filter(item => item.id !== action.payload);
    },
    updateActionStatus: (state, action: PayloadAction<{ id: string; status: OfflineAction['status']; error?: string }>) => {
      const actionIndex = state.queue.findIndex(item => item.id === action.payload.id);
      if (actionIndex !== -1) {
        state.queue[actionIndex].status = action.payload.status;
        if (action.payload.error) {
          state.queue[actionIndex].error = action.payload.error;
        }
        if (action.payload.status === 'failed') {
          state.queue[actionIndex].retries++;
        }
      }
    },
    updateOfflineProject: (state, action: PayloadAction<{ id: string; data: Partial<OfflineProject> }>) => {
      if (state.projects[action.payload.id]) {
        state.projects[action.payload.id] = {
          ...state.projects[action.payload.id],
          ...action.payload.data,
          updatedAt: Date.now(),
        };
      }
    },
    removeOfflineProject: (state, action: PayloadAction<string>) => {
      delete state.projects[action.payload];
      // Remove associated files
      Object.keys(state.files).forEach(fileId => {
        if (state.files[fileId].projectId === action.payload) {
          delete state.files[fileId];
        }
      });
    },
    addOfflineFile: (state, action: PayloadAction<OfflineFile>) => {
      state.files[action.payload.id] = action.payload;
      // Add to project's files array
      if (state.projects[action.payload.projectId]) {
        const project = state.projects[action.payload.projectId];
        if (!project.files.find(f => f.id === action.payload.id)) {
          project.files.push(action.payload);
        }
      }
    },
    updateOfflineFile: (state, action: PayloadAction<{ id: string; data: Partial<OfflineFile> }>) => {
      if (state.files[action.payload.id]) {
        state.files[action.payload.id] = {
          ...state.files[action.payload.id],
          ...action.payload.data,
          updatedAt: Date.now(),
          isModified: true,
        };
      }
    },
    removeOfflineFile: (state, action: PayloadAction<string>) => {
      const file = state.files[action.payload];
      if (file) {
        // Remove from project's files array
        if (state.projects[file.projectId]) {
          state.projects[file.projectId].files = state.projects[file.projectId].files.filter(
            f => f.id !== action.payload
          );
        }
        delete state.files[action.payload];
      }
    },
    addConflict: (state, action: PayloadAction<SyncConflict>) => {
      state.conflicts[action.payload.id] = action.payload;
    },
    removeConflict: (state, action: PayloadAction<string>) => {
      delete state.conflicts[action.payload];
    },
    updateSettings: (state, action: PayloadAction<Partial<OfflineState['settings']>>) => {
      state.settings = { ...state.settings, ...action.payload };
    },
    clearSyncError: (state) => {
      state.syncError = null;
    },
    cleanupExpiredActions: (state) => {
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      const now = Date.now();
      state.queue = state.queue.filter(action => 
        action.status !== 'synced' || (now - action.timestamp) < maxAge
      );
    },
  },
  extraReducers: (builder) => {
    // Initialize offline storage
    builder
      .addCase(initializeOfflineStorage.fulfilled, (state, action) => {
        state.projects = action.payload.projects;
        state.files = action.payload.files;
        state.generations = action.payload.generations;
        state.queue = action.payload.queue;
        state.conflicts = action.payload.conflicts;
      });

    // Create offline project
    builder
      .addCase(createOfflineProject.fulfilled, (state, action) => {
        state.projects[action.payload.id] = action.payload;
      });

    // Create offline file
    builder
      .addCase(createOfflineFile.fulfilled, (state, action) => {
        state.files[action.payload.id] = action.payload;
        // Add to project's files array
        if (state.projects[action.payload.projectId]) {
          state.projects[action.payload.projectId].files.push(action.payload);
        }
      });

    // Sync offline data
    builder
      .addCase(syncOfflineData.pending, (state) => {
        state.isSyncing = true;
        state.syncError = null;
      })
      .addCase(syncOfflineData.fulfilled, (state, action) => {
        state.isSyncing = false;
        state.lastSyncAt = action.payload.timestamp;
        state.syncStats.successfulSyncs += action.payload.successCount;
        state.syncStats.failedSyncs += action.payload.failCount;
        state.syncStats.lastSyncDuration = action.payload.syncDuration;
        
        // Remove successfully synced actions
        state.queue = state.queue.filter(action => action.status !== 'synced');
      })
      .addCase(syncOfflineData.rejected, (state, action) => {
        state.isSyncing = false;
        state.syncError = action.payload as string;
      });

    // Resolve conflict
    builder
      .addCase(resolveConflict.fulfilled, (state, action) => {
        state.conflicts[action.payload.conflictId].resolved = true;
      });

    // Calculate storage info
    builder
      .addCase(calculateStorageInfo.fulfilled, (state, action) => {
        state.storageInfo = action.payload;
      });
  },
});

// Actions
export const {
  setOnlineStatus,
  addToSyncQueue,
  removeFromSyncQueue,
  updateActionStatus,
  updateOfflineProject,
  removeOfflineProject,
  addOfflineFile,
  updateOfflineFile,
  removeOfflineFile,
  addConflict,
  removeConflict,
  updateSettings,
  clearSyncError,
  cleanupExpiredActions,
} = offlineSlice.actions;

// Selectors
export const selectOffline = (state: { offline: OfflineState }) => state.offline;
export const selectIsOnline = (state: { offline: OfflineState }) => state.offline.isOnline;
export const selectOfflineProjects = (state: { offline: OfflineState }) => state.offline.projects;
export const selectOfflineFiles = (state: { offline: OfflineState }) => state.offline.files;
export const selectSyncQueue = (state: { offline: OfflineState }) => state.offline.queue;
export const selectConflicts = (state: { offline: OfflineState }) => state.offline.conflicts;
export const selectSyncStats = (state: { offline: OfflineState }) => state.offline.syncStats;
export const selectPendingActions = (state: { offline: OfflineState }) => 
  state.offline.queue.filter(action => action.status === 'pending');
export const selectStorageInfo = (state: { offline: OfflineState }) => state.offline.storageInfo;

export default offlineSlice.reducer;