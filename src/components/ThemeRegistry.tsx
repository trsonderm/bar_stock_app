'use client';

import * as React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';

const getThemePreset = (mode: string) => {
  const isLight = mode === 'light';
  const isBlue = mode === 'blue';

  const backgroundDefault = isBlue ? '#0f172a' : (isLight ? '#f3f4f6' : '#111827');
  const backgroundPaper = isBlue ? '#1e293b' : (isLight ? '#ffffff' : '#1f2937');
  const primaryMain = isBlue ? '#38bdf8' : (isLight ? '#f59e0b' : '#fbbf24');
  const textPrimary = isLight ? '#111827' : '#f9fafb';
  const textSecondary = isLight ? '#4b5563' : '#9ca3af';

  return createTheme({
    palette: {
      mode: isLight ? 'light' : 'dark',
      primary: {
        main: primaryMain,
        contrastText: isLight ? '#ffffff' : '#111827',
      },
      secondary: {
        main: '#3b82f6',
      },
      background: {
        default: backgroundDefault,
        paper: backgroundPaper,
      },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
      },
    },
    typography: {
      fontFamily: 'inherit',
      h1: { fontSize: '2.5rem', fontWeight: 700 },
      h2: { fontSize: '2rem', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 8, padding: '8px 16px' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: backgroundPaper,
            borderRadius: 12,
            border: `1px solid ${isLight ? '#e5e7eb' : (isBlue ? '#334155' : '#374151')}`,
            backgroundImage: 'none',
            boxShadow: isLight ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none',
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              backgroundColor: isLight ? '#ffffff' : (isBlue ? '#1e293b' : '#374151'),
              '& fieldset': { borderColor: isLight ? '#d1d5db' : '#4b5563' },
              '&:hover fieldset': { borderColor: isLight ? '#9ca3af' : '#6b7280' },
              '&.Mui-focused fieldset': { borderColor: primaryMain },
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: backgroundPaper,
            borderRight: `1px solid ${isLight ? '#e5e7eb' : (isBlue ? '#334155' : '#374151')}`,
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: backgroundPaper,
            borderBottom: `1px solid ${isLight ? '#e5e7eb' : (isBlue ? '#334155' : '#374151')}`,
            color: textPrimary,
          }
        }
      }
    },
  });
};

export default function ThemeRegistry({ children, themeMode = 'dark' }: { children: React.ReactNode, themeMode?: string }) {
  // Use React.useMemo to avoid recreating theme on every render
  const theme = React.useMemo(() => getThemePreset(themeMode), [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{
        ':root': {
          '--mui-bg-default': theme.palette.background.default,
          '--mui-bg-paper': theme.palette.background.paper,
          '--mui-border': theme.palette.mode === 'light' ? '#e5e7eb' : (themeMode === 'blue' ? '#334155' : '#374151'),
          '--mui-text-primary': theme.palette.text.primary,
          '--mui-text-secondary': theme.palette.text.secondary,
        }
      }} />
      <div data-theme={themeMode} style={{ display: 'contents' }}>
        {children}
      </div>
    </ThemeProvider>
  );
}
