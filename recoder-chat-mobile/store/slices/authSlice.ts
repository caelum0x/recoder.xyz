import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { SecureStorageService, DeviceService } from '../../services/MobileNativeModules';

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  subscription?: {
    tier: 'free' | 'pro' | 'enterprise';
    expiresAt?: string;
    features: string[];
  };
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
    biometricAuth: boolean;
    autoSync: boolean;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  error: string | null;
  deviceInfo: any;
  lastLoginAt: number | null;
  isOfflineMode: boolean;
  biometricEnabled: boolean;
  loginAttempts: number;
  lockoutUntil: number | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  token: null,
  refreshToken: null,
  expiresAt: null,
  error: null,
  deviceInfo: null,
  lastLoginAt: null,
  isOfflineMode: false,
  biometricEnabled: false,
  loginAttempts: 0,
  lockoutUntil: null,
};

// Async thunks
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      const [token, refreshToken, userData] = await Promise.all([
        SecureStorageService.retrieve('auth_token'),
        SecureStorageService.retrieve('refresh_token'),
        SecureStorageService.retrieve('user_data')
      ]);

      if (!token || !refreshToken) {
        throw new Error('No stored tokens');
      }

      const user = userData ? JSON.parse(userData) : null;
      const deviceInfo = DeviceService.getDeviceInfo();

      // Check if token is expired
      const expiresAt = parseInt(await SecureStorageService.retrieve('token_expires_at') || '0');
      if (expiresAt && Date.now() > expiresAt) {
        throw new Error('Token expired');
      }

      return {
        token,
        refreshToken,
        user,
        deviceInfo,
        expiresAt
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async (
    { email, password }: { email: string; password: string },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as { auth: AuthState };
      
      // Check lockout
      if (state.auth.lockoutUntil && Date.now() < state.auth.lockoutUntil) {
        throw new Error('Account temporarily locked due to multiple failed attempts');
      }

      const deviceInfo = DeviceService.getDeviceInfo();
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          deviceInfo
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();

      // Store tokens securely
      await Promise.all([
        SecureStorageService.store('auth_token', data.data.token),
        SecureStorageService.store('refresh_token', data.data.refreshToken),
        SecureStorageService.store('user_data', JSON.stringify(data.data.user)),
        SecureStorageService.store('token_expires_at', String(Date.now() + data.data.expiresIn))
      ]);

      return {
        token: data.data.token,
        refreshToken: data.data.refreshToken,
        user: data.data.user,
        deviceInfo,
        expiresAt: Date.now() + data.data.expiresIn
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const refreshTokenThunk = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      const refreshToken = state.auth.refreshToken;

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();

      // Update stored tokens
      await Promise.all([
        SecureStorageService.store('auth_token', data.data.token),
        SecureStorageService.store('refresh_token', data.data.refreshToken),
        SecureStorageService.store('token_expires_at', String(Date.now() + data.data.expiresIn))
      ]);

      return {
        token: data.data.token,
        refreshToken: data.data.refreshToken,
        expiresAt: Date.now() + data.data.expiresIn
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      // Clear secure storage
      await SecureStorageService.clear();
      
      // Optional: Call logout endpoint
      // await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/auth/logout`, { ... });

      return true;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (
    updates: Partial<User>,
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as { auth: AuthState };
      const token = state.auth.token;

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Profile update failed');
      }

      const data = await response.json();
      const updatedUser = data.data.user;

      // Update stored user data
      await SecureStorageService.store('user_data', JSON.stringify(updatedUser));

      return updatedUser;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const enableBiometric = createAsyncThunk(
  'auth/enableBiometric',
  async (enabled: boolean, { rejectWithValue }) => {
    try {
      await SecureStorageService.store('biometric_enabled', enabled.toString());
      return enabled;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setOfflineMode: (state, action: PayloadAction<boolean>) => {
      state.isOfflineMode = action.payload;
    },
    updateUserPreferences: (state, action: PayloadAction<Partial<User['preferences']>>) => {
      if (state.user) {
        state.user.preferences = {
          ...state.user.preferences,
          ...action.payload
        };
      }
    },
    incrementLoginAttempts: (state) => {
      state.loginAttempts += 1;
      if (state.loginAttempts >= 5) {
        state.lockoutUntil = Date.now() + (15 * 60 * 1000); // 15 minutes
      }
    },
    resetLoginAttempts: (state) => {
      state.loginAttempts = 0;
      state.lockoutUntil = null;
    },
    setTokenExpiration: (state, action: PayloadAction<number>) => {
      state.expiresAt = action.payload;
    },
    updateLastLoginAt: (state) => {
      state.lastLoginAt = Date.now();
    }
  },
  extraReducers: (builder) => {
    // Initialize auth
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.user = action.payload.user;
        state.deviceInfo = action.payload.deviceInfo;
        state.expiresAt = action.payload.expiresAt;
        state.error = null;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload as string;
        // Don't clear tokens on initialization failure
      });

    // Login
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.user = action.payload.user;
        state.deviceInfo = action.payload.deviceInfo;
        state.expiresAt = action.payload.expiresAt;
        state.lastLoginAt = Date.now();
        state.loginAttempts = 0;
        state.lockoutUntil = null;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload as string;
        state.loginAttempts += 1;
        if (state.loginAttempts >= 5) {
          state.lockoutUntil = Date.now() + (15 * 60 * 1000);
        }
      });

    // Refresh token
    builder
      .addCase(refreshTokenThunk.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.expiresAt = action.payload.expiresAt;
      })
      .addCase(refreshTokenThunk.rejected, (state) => {
        // Token refresh failed, logout user
        state.isAuthenticated = false;
        state.token = null;
        state.refreshToken = null;
        state.user = null;
        state.expiresAt = null;
      });

    // Logout
    builder
      .addCase(logout.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        return initialState; // Reset to initial state
      })
      .addCase(logout.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Update profile
    builder
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Enable biometric
    builder
      .addCase(enableBiometric.fulfilled, (state, action) => {
        state.biometricEnabled = action.payload;
      });
  },
});

// Actions
export const {
  clearError,
  setOfflineMode,
  updateUserPreferences,
  incrementLoginAttempts,
  resetLoginAttempts,
  setTokenExpiration,
  updateLastLoginAt
} = authSlice.actions;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
export const selectIsLoading = (state: { auth: AuthState }) => state.auth.isLoading;
export const selectToken = (state: { auth: AuthState }) => state.auth.token;
export const selectError = (state: { auth: AuthState }) => state.auth.error;
export const selectBiometricEnabled = (state: { auth: AuthState }) => state.auth.biometricEnabled;
export const selectIsLocked = (state: { auth: AuthState }) => {
  return state.auth.lockoutUntil && Date.now() < state.auth.lockoutUntil;
};

export default authSlice.reducer;