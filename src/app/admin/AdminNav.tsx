'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import NotificationBell from '@/components/NotificationBell';

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuIcon from '@mui/icons-material/Menu';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

import DashboardIcon from '@mui/icons-material/Dashboard';
import AssessmentIcon from '@mui/icons-material/Assessment';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SearchIcon from '@mui/icons-material/Search';
import EventIcon from '@mui/icons-material/Event';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import StoreIcon from '@mui/icons-material/Store';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CategoryIcon from '@mui/icons-material/Category';
import GroupIcon from '@mui/icons-material/Group';
import PaymentIcon from '@mui/icons-material/Payment';
import HelpIcon from '@mui/icons-material/Help';

const drawerWidth = 260;

interface NavUser {
    role: string;
    permissions: string[];
    subscriptionPlan?: string;
    first_name?: string;
}

export default function AdminNav({ user, children }: { user: NavUser, children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const [mobileOpen, setMobileOpen] = useState(false);
    
    // Submenu states
    const [productOpen, setProductOpen] = useState(false);
    const [orderOpen, setOrderOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Locations and Top right menu state
    const [myLocations, setMyLocations] = useState<{ id: number, name: string }[]>([]);
    const [currentLocName, setCurrentLocName] = useState('');
    const [anchorElLoc, setAnchorElLoc] = useState<null | HTMLElement>(null);
    const [anchorElProfile, setAnchorElProfile] = useState<null | HTMLElement>(null);

    const isPro = user?.subscriptionPlan === 'pro' || user?.subscriptionPlan === 'free_trial' || user?.role === 'super_admin';
    const canAudit = user?.role === 'admin' || user?.permissions?.includes('audit') || user?.permissions?.includes('all');
    const canManageProducts = user?.role === 'admin' || user?.permissions?.includes('manage_products') || user?.permissions?.includes('all');

    useEffect(() => {
        fetch('/api/user/locations')
            .then(r => r.json())
            .then(data => {
                if (data.locations) {
                    setMyLocations(data.locations);
                    const match = document.cookie.match(new RegExp('(^| )current_location_id=([^;]+)'));
                    const cookieId = match ? parseInt(match[2]) : null;

                    if (data.locations.length > 0) {
                        let selected = data.locations[0];
                        if (cookieId) {
                            const found = data.locations.find((l: any) => l.id === cookieId);
                            if (found) selected = found;
                        } else {
                            document.cookie = `current_location_id=${selected.id}; path=/; max-age=31536000`;
                        }
                        setCurrentLocName(selected.name);
                    }
                }
            });
    }, []);

    const handleSelectLocation = (loc: { id: number, name: string }) => {
        document.cookie = `current_location_id=${loc.id}; path=/; max-age=31536000`;
        setCurrentLocName(loc.name);
        setAnchorElLoc(null);
        window.location.reload();
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
    };

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const DrawerItem = ({ text, icon, href, isSub = false }: any) => {
        const active = pathname === href;
        return (
            <ListItem disablePadding sx={{ display: 'block' }}>
                <ListItemButton 
                    component={Link} 
                    href={href} 
                    onClick={() => setMobileOpen(false)}
                    sx={{
                        minHeight: 48,
                        pl: isSub ? 4 : 2,
                        backgroundColor: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        borderRight: active ? '3px solid #fbbf24' : '3px solid transparent'
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'inherit' }}>
                        {icon}
                    </ListItemIcon>
                    <ListItemText primary={text} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 600 : 400, color: active ? 'primary.main' : 'text.primary' }} />
                </ListItemButton>
            </ListItem>
        );
    };

    const drawerContent = (
        <div>
            <Toolbar sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    Admin Panel
                </Typography>
            </Toolbar>
            <List sx={{ pt: 1 }}>
                <DrawerItem text="Dashboard" icon={<DashboardIcon />} href="/admin/dashboard" />
                
                {isPro && <DrawerItem text="Reporting" icon={<AssessmentIcon />} href="/admin/reports" />}

                {/* PRODUCT FOLDER */}
                <ListItem disablePadding sx={{ display: 'block' }}>
                    <ListItemButton onClick={() => setProductOpen(!productOpen)} sx={{ minHeight: 48, pl: 2 }}>
                        <ListItemIcon sx={{ minWidth: 40 }}><InventoryIcon /></ListItemIcon>
                        <ListItemText primary="Product" primaryTypographyProps={{ fontSize: '0.9rem' }} />
                        {productOpen ? <ExpandLess /> : <ExpandMore />}
                    </ListItemButton>
                </ListItem>
                <Collapse in={productOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <DrawerItem text="Prices" icon={<span />} href="/admin/prices" isSub />
                        {canManageProducts && <DrawerItem text="Product List" icon={<span />} href="/admin/products" isSub />}
                        {canAudit && <DrawerItem text="Audit" icon={<span />} href="/admin/audit" isSub />}
                    </List>
                </Collapse>

                <DrawerItem text="Activity Search" icon={<SearchIcon />} href="/admin/query" />
                <DrawerItem text="Stock View" icon={<StoreIcon />} href="/inventory" />

                {/* ORDER FOLDER */}
                <ListItem disablePadding sx={{ display: 'block' }}>
                    <ListItemButton onClick={() => setOrderOpen(!orderOpen)} sx={{ minHeight: 48, pl: 2 }}>
                        <ListItemIcon sx={{ minWidth: 40 }}><ShoppingCartIcon /></ListItemIcon>
                        <ListItemText primary="Order" primaryTypographyProps={{ fontSize: '0.9rem' }} />
                        {orderOpen ? <ExpandLess /> : <ExpandMore />}
                    </ListItemButton>
                </ListItem>
                <Collapse in={orderOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <DrawerItem text="Manual Order" icon={<span />} href="/admin/orders/manual" isSub />
                        {isPro && <DrawerItem text="Smart Order" icon={<span />} href="/admin/reports/smart-order" isSub />}
                    </List>
                </Collapse>

                <DrawerItem text="Scheduler" icon={<EventIcon />} href="/admin/schedule" />

                {/* SETTINGS FOLDER */}
                <ListItem disablePadding sx={{ display: 'block' }}>
                    <ListItemButton onClick={() => setSettingsOpen(!settingsOpen)} sx={{ minHeight: 48, pl: 2 }}>
                        <ListItemIcon sx={{ minWidth: 40 }}><SettingsIcon /></ListItemIcon>
                        <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: '0.9rem' }} />
                        {settingsOpen ? <ExpandLess /> : <ExpandMore />}
                    </ListItemButton>
                </ListItem>
                <Collapse in={settingsOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        <DrawerItem text="General" icon={<SettingsIcon fontSize="small"/>} href="/admin/settings" isSub />
                        <DrawerItem text="Categories" icon={<CategoryIcon fontSize="small"/>} href="/admin/categories" isSub />
                        <DrawerItem text="Reporting Config" icon={<AssessmentIcon fontSize="small"/>} href="/admin/settings/reporting" isSub />
                        <DrawerItem text="Ordering" icon={<LocalShippingIcon fontSize="small"/>} href="/admin/settings/ordering" isSub />
                        <DrawerItem text="Users" icon={<GroupIcon fontSize="small"/>} href="/admin/users" isSub />
                        <DrawerItem text="Billing" icon={<PaymentIcon fontSize="small"/>} href="/admin/billing" isSub />
                        <DrawerItem text="Help" icon={<HelpIcon fontSize="small"/>} href="/admin/help" isSub />
                        <DrawerItem text="Suppliers" icon={<LocalShippingIcon fontSize="small"/>} href="/admin/suppliers" isSub />
                        <DrawerItem text="Locations" icon={<LocationOnIcon fontSize="small"/>} href="/admin/settings/locations" isSub />
                    </List>
                </Collapse>

                <ListItem disablePadding sx={{ display: 'block', mt: 2 }}>
                    <ListItemButton onClick={handleLogout} sx={{ minHeight: 48, pl: 2, color: 'error.main' }}>
                        <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}><LogoutIcon /></ListItemIcon>
                        <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }} />
                    </ListItemButton>
                </ListItem>

            </List>
        </div>
    );

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar
                position="fixed"
                color="default"
                elevation={0}
                sx={{
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    ml: { sm: `${drawerWidth}px` },
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper'
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        edge="start"
                        onClick={handleDrawerToggle}
                        sx={{ mr: 2, display: { sm: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Box sx={{ flexGrow: 1 }} />
                    
                    {myLocations.length > 0 && (
                        <>
                            <Box 
                                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mr: 2, '&:hover': { color: 'primary.main' } }}
                                onClick={(e) => myLocations.length > 1 && setAnchorElLoc(e.currentTarget)}
                            >
                                <LocationOnIcon fontSize="small" sx={{ mr: 0.5, color: 'primary.main' }} />
                                <Typography variant="subtitle2" sx={{ mr: 0.5 }}>{currentLocName}</Typography>
                                {myLocations.length > 1 && <ExpandMore fontSize="small" />}
                            </Box>
                            <Menu
                                anchorEl={anchorElLoc}
                                open={Boolean(anchorElLoc)}
                                onClose={() => setAnchorElLoc(null)}
                            >
                                {myLocations.map(loc => (
                                    <MenuItem key={loc.id} onClick={() => handleSelectLocation(loc)}>
                                        {loc.name}
                                    </MenuItem>
                                ))}
                            </Menu>
                        </>
                    )}

                    <Box sx={{ mr: 2 }}>
                        <NotificationBell />
                    </Box>

                    <IconButton onClick={(e) => setAnchorElProfile(e.currentTarget)} sx={{ p: 0 }}>
                        <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32, fontSize: '0.9rem' }}>
                            {user.first_name ? user.first_name[0].toUpperCase() : 'U'}
                        </Avatar>
                    </IconButton>
                    <Menu
                        anchorEl={anchorElProfile}
                        open={Boolean(anchorElProfile)}
                        onClose={() => setAnchorElProfile(null)}
                    >
                        <MenuItem disabled sx={{ opacity: '1 !important', fontWeight: 'bold' }}>UI Theme</MenuItem>
                        <MenuItem onClick={() => { fetch('/api/user/theme', { method: 'POST', body: JSON.stringify({ theme: 'dark' })}).then(() => window.location.reload()) }}>Dark</MenuItem>
                        <MenuItem onClick={() => { fetch('/api/user/theme', { method: 'POST', body: JSON.stringify({ theme: 'light' })}).then(() => window.location.reload()) }}>Light</MenuItem>
                        <MenuItem onClick={() => { fetch('/api/user/theme', { method: 'POST', body: JSON.stringify({ theme: 'blue' })}).then(() => window.location.reload()) }}>Deep Blue</MenuItem>
                        <MenuItem onClick={() => { fetch('/api/user/theme', { method: 'POST', body: JSON.stringify({ theme: 'default' })}).then(() => window.location.reload()) }}>Org Default</MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>
            
            <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 }, zIndex: 1200 }}>
                {/* Mobile Drawer */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }} // Better open performance on mobile.
                    sx={{
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                    }}
                >
                    {drawerContent}
                </Drawer>
                {/* Desktop Drawer */}
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', sm: 'block' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                    }}
                    open
                >
                    {drawerContent}
                </Drawer>
            </Box>

            <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` }, mt: 8 }}>
                {children}
            </Box>
        </Box>
    );
}
