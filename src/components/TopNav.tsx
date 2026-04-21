import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import Link from 'next/link';

export default function TopNav({ user, children }: { user?: any; children?: React.ReactNode }) {
  // A generic TopNav if we want to include it in the layout.
  // For now, we can omit user-specific actions if we let pages handle them,
  // or we can render common navigation links.

  return (
    <AppBar position="sticky" color="default" elevation={0} sx={{ top: 0, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', zIndex: 1100 }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            noWrap
            component="a"
            href="/"
            sx={{
              mr: 2,
              display: 'flex',
              fontWeight: 700,
              color: 'primary.main',
              textDecoration: 'none',
            }}
          >
            Topshelf Stock
          </Typography>

          <Box sx={{ flexGrow: 1, display: 'flex' }}>
            {user && (
              <Button component={Link} href={user.role === 'admin' ? '/admin/dashboard' : '/inventory'} sx={{ my: 2, color: 'text.primary', display: 'block' }}>
                Dashboard
              </Button>
            )}
          </Box>
          
          {children && (
            <Box sx={{ flexGrow: 0 }}>
              {children}
            </Box>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
}
