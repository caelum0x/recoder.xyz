import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  colors: {
    primary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
    error: string;
    warning: string;
    success: string;
  };
}

const lightColors = {
  primary: '#326DF5', // Recoder primary blue
  background: '#FFFFFF',
  surface: '#F8FAFC', // Recoder gray-50
  text: '#0F172A', // Recoder gray-900
  textSecondary: '#64748B', // Recoder gray-500
  border: '#E2E8F0', // Recoder gray-200
  accent: '#7C3AED', // Recoder secondary purple
  error: '#DC2626', // Recoder accent red
  warning: '#EA580C', // Recoder accent orange
  success: '#059669', // Recoder accent green
};

const darkColors = {
  primary: '#4785FF', // Lighter Recoder blue for dark mode
  background: '#0F172A', // Recoder gray-900
  surface: '#1E293B', // Recoder gray-800
  text: '#F8FAFC', // Recoder gray-50
  textSecondary: '#94A3B8', // Recoder gray-400
  border: '#334155', // Recoder gray-700
  accent: '#8B5CF6', // Lighter Recoder purple for dark mode
  error: '#EF4444', // Lighter red for dark mode
  warning: '#F59E0B', // Lighter orange for dark mode
  success: '#10B981', // Lighter green for dark mode
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    loadStoredTheme();
  }, []);

  const loadStoredTheme = async () => {
    try {
      const storedTheme = await AsyncStorage.getItem('app_theme');
      if (storedTheme) {
        setThemeState(storedTheme as Theme);
      }
    } catch (error) {
      console.error('Error loading stored theme:', error);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem('app_theme', newTheme);
    } catch (error) {
      console.error('Error storing theme:', error);
    }
  };

  const actualTheme: 'light' | 'dark' = 
    theme === 'system' 
      ? (systemTheme ?? 'light')
      : theme === 'light' 
        ? 'light' 
        : 'dark';

  const colors = actualTheme === 'light' ? lightColors : darkColors;

  const value: ThemeContextType = {
    theme,
    actualTheme,
    setTheme,
    colors,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}