'use client';

import * as React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#fbbf24', // golden/amber accent used in current UI
      contrastText: '#111827',
    },
    secondary: {
      main: '#3b82f6', // blue
    },
    background: {
      default: '#111827', // Tailwind gray-900 equivalent
      paper: '#1f2937', // Tailwind gray-800 equivalent
    },
    text: {
      primary: '#f9fafb',
      secondary: '#9ca3af',
    },
  },
  typography: {
    fontFamily: 'inherit', // Let Next.js Inter font control it
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
        },
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#f59e0b',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1f2937',
          borderRadius: 12,
          border: '1px solid #374151',
          backgroundImage: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#374151',
            '& fieldset': {
              borderColor: '#4b5563',
            },
            '&:hover fieldset': {
              borderColor: '#6b7280',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#fbbf24',
            },
          },
        },
      },
    },
  },
});

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
