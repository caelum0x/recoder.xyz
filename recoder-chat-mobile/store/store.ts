import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupListeners } from '@reduxjs/toolkit/query';

// Import reducers
import authReducer from './slices/authSlice';
import projectsReducer from './slices/projectsSlice';
import codeGenerationReducer from './slices/codeGenerationSlice';
import offlineReducer from './slices/offlineSlice';
import settingsReducer from './slices/settingsSlice';
import notificationsReducer from './slices/notificationsSlice';
import themeReducer from './slices/themeSlice';
import analyticsReducer from './slices/analyticsSlice';
import collaborationReducer from './slices/collaborationSlice';
import templatesReducer from './slices/templatesSlice';

// Import API slices
import { mobileApiSlice } from './api/mobileApiSlice';
import { syncApiSlice } from './api/syncApiSlice';

// Persist configuration
const persistConfig = {
  key: 'recoder-mobile',
  version: 1,
  storage: AsyncStorage,
  whitelist: [
    'auth',
    'settings',
    'theme',
    'offline',
    'projects', // Persist projects for offline access
  ],
  blacklist: [
    'codeGeneration', // Don't persist ongoing generation state
    'notifications', // Don't persist notification state
    'analytics', // Don't persist analytics state
  ],
};

// Offline-specific persist config
const offlinePersistConfig = {
  key: 'offline',
  storage: AsyncStorage,
  whitelist: ['queue', 'syncedData', 'lastSyncTime'],
};

// Root reducer
const rootReducer = combineReducers({
  auth: authReducer,
  projects: projectsReducer,
  codeGeneration: codeGenerationReducer,
  offline: persistReducer(offlinePersistConfig, offlineReducer),
  settings: settingsReducer,
  notifications: notificationsReducer,
  theme: themeReducer,
  analytics: analyticsReducer,
  collaboration: collaborationReducer,
  templates: templatesReducer,
  
  // API slices
  [mobileApiSlice.reducerPath]: mobileApiSlice.reducer,
  [syncApiSlice.reducerPath]: syncApiSlice.reducer,
});

// Persisted root reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        ignoredPaths: ['offline.queue'], // Allow non-serializable data in offline queue
      },
      immutableCheck: {
        warnAfter: 128,
      },
    })
    .concat(mobileApiSlice.middleware)
    .concat(syncApiSlice.middleware),
  devTools: __DEV__,
});

// Setup listeners for refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

// Create persistor
export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Store configuration
export const storeConfig = {
  // Performance monitoring
  enableDevTools: __DEV__,
  enablePersistence: true,
  enableOfflineSupport: true,
  
  // Cache settings
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 50 * 1024 * 1024, // 50MB
  
  // Sync settings
  syncInterval: 30 * 1000, // 30 seconds
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds
  
  // Analytics
  trackActions: !__DEV__,
  trackPerformance: !__DEV__,
};

// Action tracking middleware for analytics
const actionTrackingMiddleware = (store: any) => (next: any) => (action: any) => {
  if (storeConfig.trackActions && !action.type.startsWith('persist/')) {
    // Track significant user actions
    if (action.type.includes('auth/') || 
        action.type.includes('projects/') || 
        action.type.includes('codeGeneration/')) {
      console.log('Action tracked:', action.type);
      // Send to analytics service
    }
  }
  
  return next(action);
};

// Performance monitoring middleware
const performanceMiddleware = (store: any) => (next: any) => (action: any) => {
  if (storeConfig.trackPerformance) {
    const start = performance.now();
    const result = next(action);
    const end = performance.now();
    
    if (end - start > 10) { // Log slow actions (>10ms)
      console.warn(`Slow action: ${action.type} took ${end - start}ms`);
    }
  }
  
  return next(action);
};

// Batch actions middleware for performance
const batchMiddleware = (store: any) => (next: any) => (action: any) => {
  if (action.type === 'BATCH_ACTIONS') {
    action.payload.forEach((batchedAction: any) => {
      store.dispatch(batchedAction);
    });
    return;
  }
  
  return next(action);
};

// Add middleware to store if needed
if (__DEV__) {
  store.dispatch = performanceMiddleware(store)(store.dispatch);
}

// Store utilities
export const storeUtils = {
  // Clear all persisted data
  clearPersistedData: async () => {
    await persistor.purge();
    await AsyncStorage.multiRemove([
      'persist:recoder-mobile',
      'persist:offline',
      'auth_token',
      'refresh_token'
    ]);
  },
  
  // Get store state size (for debugging)
  getStateSize: () => {
    const state = store.getState();
    return JSON.stringify(state).length;
  },
  
  // Batch multiple actions
  batchActions: (actions: any[]) => {
    store.dispatch({
      type: 'BATCH_ACTIONS',
      payload: actions
    });
  },
  
  // Subscribe to store changes with throttling
  subscribeWithThrottle: (callback: Function, delay: number = 100) => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return store.subscribe(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        callback(store.getState());
      }, delay);
    });
  },
  
  // Get specific slice state
  getSliceState: <K extends keyof RootState>(slice: K): RootState[K] => {
    return store.getState()[slice];
  },
  
  // Check if store is ready (rehydrated)
  isReady: () => {
    const state = store.getState();
    return !(state as any)._persist?.rehydrated === false;
  }
};

// Export store hooks (to be used in hooks/index.ts)
export * from './hooks';

// Store health monitoring
export const storeMonitoring = {
  // Monitor store performance
  startMonitoring: () => {
    if (__DEV__) {
      setInterval(() => {
        const state = store.getState();
        const stateSize = JSON.stringify(state).length;
        const maxSize = 1024 * 1024; // 1MB
        
        if (stateSize > maxSize) {
          console.warn(`Store size is large: ${(stateSize / 1024 / 1024).toFixed(2)}MB`);
        }
      }, 60000); // Check every minute
    }
  },
  
  // Get performance metrics
  getMetrics: () => ({
    stateSize: storeUtils.getStateSize(),
    isRehydrated: storeUtils.isReady(),
    actionCount: (store.getState() as any)._actionCount || 0,
    timestamp: Date.now()
  }),
  
  // Reset store to initial state (for testing)
  reset: () => {
    store.dispatch({ type: 'RESET_STORE' });
  }
};

// Initialize monitoring in development
if (__DEV__) {
  storeMonitoring.startMonitoring();
}

export default store;