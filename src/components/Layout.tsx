import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { 
  LayoutDashboard, 
  FilePlus, 
  Search, 
  Settings, 
  LogOut, 
  CheckCircle, 
  Shield, 
  MessageCircle, 
  ShieldAlert,
  Banknote,
  Store,
  ShoppingCart,
  Receipt,
  Target,
  Users,
  ClipboardList,
  ChevronDown,
  Package,
  Home,
  ArrowLeftRight,
  Bell,
  Clock,
  ShieldCheck,
  Trash2,
  FileSpreadsheet
} from 'lucide-react';
import UpdatesNotification from './UpdatesNotification';
import PWAPrompt from './PWAPrompt';
import { db } from '../firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { CURRENT_VERSION } from '../lib/changelog';
import { isSuperAdminEmail, cn } from '../lib/utils';
 

interface DockItemProps {
  item: any;
  index: number;
  hoveredIndex: number | null;
  setHoveredIndex: (idx: number | null) => void;
  settings: any;
  isVertical: boolean;
  pos: string;
  location: any;
  openMenus: any;
  toggleMenu: (name: string) => void;
  setOpenMenus: any;
  isMobile?: boolean;
}

const DockItem: React.FC<DockItemProps> = ({
  item,
  index,
  hoveredIndex,
  setHoveredIndex,
  settings,
  isVertical,
  pos,
  location,
  openMenus,
  toggleMenu,
  setOpenMenus,
  isMobile = false
}) => {
  const hasSubItems = item.subItems && item.subItems.length > 0;
  const isActive = item.isAvatar 
    ? location.pathname === '/settings'
    : item.href 
    ? location.pathname === item.href || location.pathname.startsWith(item.href) 
    : (item.subItems ? item.subItems.some((sub: any) => location.pathname === sub.href || location.pathname.startsWith(sub.href)) : false);

  const isClassicStyle = settings.uiStyle === 'classic' || !settings.uiStyle;
  const isGlassStyle = settings.uiStyle === 'glass';
  const isLiquidGlassStyle = settings.uiStyle === 'liquid-glass';

  // Hover Proximity Scale Calculation
  let scale = 1.0;
  if (settings.dockMagnification !== false && hoveredIndex !== null) {
    if (hoveredIndex === index) {
      scale = 1.30;
    } else if (settings.dockProximity !== false && (hoveredIndex === index - 1 || hoveredIndex === index + 1)) {
      scale = 1.15;
    }
  }

  const isSizeMagnification = settings.dockMagnificationType === 'size';
  
  const baseSize = isMobile ? 44 : 52;
  const currentSize = isSizeMagnification ? baseSize * scale : baseSize;

  const itemStyle: React.CSSProperties = {
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    ...(isSizeMagnification 
      ? { width: `${currentSize}px`, height: `${currentSize}px` } 
      : { transform: `scale(${scale})`, transformOrigin: isVertical ? (pos === 'right' ? 'center right' : 'center left') : 'bottom center' }
    ),
  };

  const IconComponent = item.icon;

  const buttonStyleClass = isActive 
    ? (isClassicStyle
        ? "bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-700 dark:border-indigo-400 shadow-md shadow-indigo-100/10"
        : "bg-indigo-100/50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800"
      )
    : (isClassicStyle
        ? "bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border-neutral-200 dark:border-neutral-700 shadow-sm"
        : isGlassStyle
        ? "bg-white/60 dark:bg-neutral-800/50 hover:bg-white/80 dark:hover:bg-neutral-700/80 border-white/40 dark:border-white/5"
        : "bg-white/40 dark:bg-neutral-800/40 hover:bg-white/75 dark:hover:bg-neutral-700/60 border-white/30 dark:border-white/5"
      );

  const content = (
    <div className="relative h-full w-full flex items-center justify-center">
      {item.isAvatar ? (
        <div className="w-10 h-10 overflow-hidden rounded-full">
          <IconComponent />
        </div>
      ) : (
        <IconComponent className={cn("w-6 h-6 transition-transform duration-300", isActive ? (isClassicStyle ? "text-white scale-110" : "text-indigo-600 dark:text-indigo-400 scale-110") : "text-neutral-600 dark:text-neutral-300")} />
      )}
      
      {/* Indicator for active state (small dot like macOS) */}
      {isActive && (
        <span className={cn(
          "absolute rounded-full transition-all duration-300",
          isClassicStyle ? "bg-white w-1.5 h-1.5" : "bg-indigo-600 dark:bg-indigo-400 w-1.5 h-1.5",
          isVertical
            ? (pos === 'right' ? "right-1.5 top-1/2 -translate-y-1/2" : "left-1.5 top-1/2 -translate-y-1/2")
            : "bottom-1.5 left-1/2 -translate-x-1/2"
        )} />
      )}
    </div>
  );

  return (
    <div
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      className="relative group flex items-center justify-center cursor-pointer select-none"
      style={itemStyle}
    >
      {/* Tooltip */}
      <div 
        className={cn(
          "absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 px-2.5 py-1.5 text-[11px] font-bold text-white bg-neutral-900/85 dark:bg-black/90 backdrop-blur-md rounded-lg shadow-xl border border-white/10 whitespace-nowrap",
          isVertical
            ? (pos === 'right' ? "right-full mr-4 top-1/2 -translate-y-1/2 group-hover:-translate-x-1" : "left-full ml-4 top-1/2 -translate-y-1/2 group-hover:translate-x-1")
            : (pos === 'top' ? "top-full mt-4 left-1/2 -translate-x-1/2 group-hover:translate-y-1" : "bottom-full mb-4 left-1/2 -translate-x-1/2 group-hover:-translate-y-1")
        )}
      >
        {item.name}
      </div>

      {/* Button / Link wrapper */}
      {item.isLogout ? (
        <button
          onClick={(e) => {
            setOpenMenus({});
            item.onClick?.(e);
          }}
          className={cn(
            "h-full w-full flex items-center justify-center rounded-2xl border transition-all duration-300",
            buttonStyleClass
          )}
        >
          {content}
        </button>
      ) : hasSubItems ? (
        <div className="h-full w-full relative">
          <button
            onClick={(e) => { e.stopPropagation(); toggleMenu(item.name); }}
            className={cn(
              "h-full w-full flex items-center justify-center rounded-2xl border transition-all duration-300",
              buttonStyleClass
            )}
          >
            {content}
          </button>

          {/* Subitems Floating Glass Balloon with Elegant Expansion/Contraction */}
          <AnimatePresence>
            {openMenus[item.name] && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "absolute bg-white/95 dark:bg-neutral-900/95 backdrop-blur-2xl border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl p-2.5 z-[100] space-y-1 w-48",
                  isVertical
                    ? (pos === 'right' ? "right-20 top-1/2 -translate-y-1/2 mr-2 origin-right" : "left-20 top-1/2 -translate-y-1/2 ml-2 origin-left")
                    : (pos === 'top' ? "top-20 left-1/2 -translate-x-1/2 mt-2 origin-top" : "bottom-20 left-1/2 -translate-x-1/2 mb-2 origin-bottom")
                )}
              >
                {item.subItems.map((subItem: any) => {
                  const isSubActive = location.pathname === subItem.href || location.pathname.startsWith(subItem.href);
                  return (
                    <Link
                      key={subItem.name}
                      to={subItem.href}
                      onClick={() => {
                        setOpenMenus({});
                      }}
                      className={cn(
                        "flex items-center px-3 py-2 text-xs font-bold rounded-lg transition-all",
                        isSubActive
                          ? "bg-indigo-600 dark:bg-indigo-500 text-white"
                          : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                      )}
                    >
                      <subItem.icon className="w-3.5 h-3.5 mr-2.5" />
                      {subItem.name}
                    </Link>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <Link
          to={item.href!}
          onClick={() => setOpenMenus({})}
          className={cn(
            "h-full w-full flex items-center justify-center rounded-2xl border transition-all duration-300",
            buttonStyleClass
          )}
        >
          {content}
        </Link>
      )}
    </div>
  );
};

export default function Layout() {
  const { settings } = useSettings();
  const { user, profile, loading, logout, isAdmin, isSuperAdmin, impersonatedUser, impersonateUser, originalUser } = useAuth();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    'Finanzas': false,
    'Comercio': false,
    'Inventario': false,
    'Admin': false
  });
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsSidebarCollapsed(true);
        // Also close all menus when collapsing
        setOpenMenus({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMenu = (menuName: string) => {
    setIsSidebarCollapsed(false);
    setOpenMenus(prev => {
      const isCurrentlyOpen = !!prev[menuName];
      return { [menuName]: !isCurrentlyOpen };
    });
  };

  const handleSidebarClick = () => {
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
  };

  // Silent automatic migration of unassigned checks and employees to Almacenes Derick on startup
  useEffect(() => {
    let active = true;
    if (!isSuperAdmin) return;
    const runSilentMigration = async () => {
      try {
        const checksQ = query(collection(db, 'checks'));
        const checksSnap = await getDocs(checksQ);
        const unassignedChecks = checksSnap.docs.filter(d => !d.data().enterpriseId);
        
        if (unassignedChecks.length === 0) return;

        const usersQ = query(collection(db, 'users'), where('role', '==', 'enterprise'));
        const usersSnap = await getDocs(usersQ);
        const enterprises = usersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
        const derickUser = enterprises.find(u => 
           u.name?.toLowerCase().includes('derick') || 
           u.name?.toLowerCase().includes('deric') ||
          u.email?.toLowerCase().includes('derick') ||
          u.email?.toLowerCase().includes('deric')
        );
        
        let targetId = '';
        if (derickUser) {
          targetId = derickUser.id;
        } else if (enterprises.length > 0) {
          targetId = enterprises[0].id;
        }

        if (!targetId || !active) return;

        for (const checkDoc of unassignedChecks) {
          if (!active) break;
          await updateDoc(doc(db, 'checks', checkDoc.id), {
            enterpriseId: targetId
          });
        }
        
        const invoicesSnap = await getDocs(collection(db, 'invoices'));
        for (const invoiceDoc of invoicesSnap.docs) {
          if (!active) break;
          if (!invoiceDoc.data().enterpriseId) {
            await updateDoc(doc(db, 'invoices', invoiceDoc.id), {
              enterpriseId: targetId
            });
          }
        }

        const benSnap = await getDocs(collection(db, 'beneficiaries'));
        for (const benDoc of benSnap.docs) {
          if (!active) break;
          if (!benDoc.data().enterpriseId) {
            await updateDoc(doc(db, 'beneficiaries', benDoc.id), {
              enterpriseId: targetId
            });
          }
        }
      } catch (e) {
        console.error("Error in automatic background checks migration:", e);
      }
    };

    if (user && profile && isSuperAdminEmail(originalUser?.email)) {
      runSilentMigration();
    }
    return () => { active = false; };
  }, [user, profile]);

  const isClassicStyle = !settings.uiStyle || settings.uiStyle === 'classic';
  const isGlassStyle = settings.uiStyle === 'glass';
  const isLiquidGlassStyle = settings.uiStyle === 'liquid-glass';
  const isGlass = isGlassStyle || isLiquidGlassStyle;
  const pos = settings.menuPosition || 'left';
  const isHorizontal = pos === 'top' || pos === 'bottom';
  useEffect(() => {
    if (isGlass) {
      document.documentElement.classList.add('theme-glass');
      if (settings.uiStyle === 'liquid-glass') {
        document.documentElement.classList.add('theme-liquid-glass');
      } else {
        document.documentElement.classList.remove('theme-liquid-glass');
      }
    } else {
      document.documentElement.classList.remove('theme-glass', 'theme-liquid-glass');
    }
    return () => document.documentElement.classList.remove('theme-glass', 'theme-liquid-glass');
  }, [isGlass, settings.uiStyle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold text-white tracking-widest uppercase">Verificando Credenciales</h2>
        <p className="text-neutral-500 text-sm mt-2 font-medium">Control 360°</p>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!profile.hasCompletedOnboarding && profile.role !== 'SUPERADMIN') {
    return <Navigate to="/onboarding" replace />;
  }

  const navigation = profile?.role === 'BODEGUERO' 
    ? [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { 
          name: 'Inventario', 
          icon: ClipboardList,
          subItems: [
            { name: 'Artículos', href: '/inventory/articles', icon: Package },
            { name: 'Bodegas', href: '/inventory/warehouses', icon: Home },
            { name: 'Transferencias', href: '/inventory/transfers', icon: ArrowLeftRight },
            { name: 'Préstamos', href: '/inventory/loans-returns', icon: Package },
            { name: 'Ventas', href: '/inventory/sales', icon: ShoppingCart },
          ]
        },
        { name: 'Configuración', href: '/settings', icon: Settings },
      ]
    : [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        {
          name: 'Finanzas',
          icon: Banknote,
          subItems: [
            { name: 'Ingreso Cheques', href: '/entry', icon: FilePlus },
            { name: 'Consultas', href: '/search', icon: Search },
            { name: 'Buró de Crédito', href: '/buro', icon: FileSpreadsheet },
          ]
        },
        {
          name: 'Comercio',
          icon: Store,
          subItems: [
            { name: 'Ventas', href: '/sales', icon: ShoppingCart },
            { name: 'Cobranza', href: '/collections', icon: Receipt },
            { name: 'Empleados', href: '/employees', icon: Users },
            
          ]
        },
        { 
          name: 'Inventario', 
          icon: ClipboardList,
          subItems: [
            { name: 'Artículos', href: '/inventory/articles', icon: Package },
            { name: 'Bodegas', href: '/inventory/warehouses', icon: Home },
            { name: 'Transferencias', href: '/inventory/transfers', icon: ArrowLeftRight },
            { name: 'Préstamos', href: '/inventory/loans-returns', icon: Package },
            { name: 'Ventas', href: '/inventory/sales', icon: ShoppingCart },
          ]
        },
        { name: 'Configuración', href: '/settings', icon: Settings },
      ];

  const canAccessAdmin = isSuperAdminEmail(originalUser?.email);
  if (canAccessAdmin && profile?.role !== 'BODEGUERO') {
    navigation.push({ 
      name: 'Admin', 
      icon: Shield,
      subItems: [
        { name: 'Usuarios', href: '/admin/users', icon: Users },
        { name: 'Asignación / Migración', href: '/admin/migration', icon: ArrowLeftRight },
        { name: 'Versiones', href: '/admin/versions', icon: Clock },
        { name: 'Auditoría', href: '/admin/audit', icon: ShieldCheck },
        { name: 'Papelera', href: '/admin/trash', icon: Trash2 },
        { name: 'Notificaciones', href: '/admin/notifications', icon: Bell },
      ]
    });
  }

  const isSubItemActive = (subItems?: {href: string}[]) => {
    return subItems?.some(item => location.pathname === item.href || location.pathname.startsWith(item.href)) || false;
  };

  const isLiquidGlass = settings.uiStyle === 'liquid-glass';

  // Base layout styles depending on glass/classic
  const containerClass = cn(
    "h-screen overflow-hidden flex flex-col transition-colors duration-300", 
    pos === 'right' ? "md:flex-row-reverse" : 
    pos === 'top' ? "md:flex-col" : 
    pos === 'bottom' ? "md:flex-col-reverse" : 
    "md:flex-row",
    isGlass
      ? "bg-[#f0f4f8] dark:bg-[#0a0a0a] relative overflow-hidden" 
      : "bg-neutral-50 dark:bg-neutral-950"
  );

  const sidebarClass = cn(
    "hidden md:flex transition-all duration-300",
    pos === 'bottom'
      ? "fixed bottom-6 left-1/2 -translate-x-1/2 w-auto h-20 px-6 rounded-[2rem] border flex-row items-center justify-center z-50 gap-4"
      : pos === 'top'
      ? "fixed top-6 left-1/2 -translate-x-1/2 w-auto h-20 px-6 rounded-[2rem] border flex-row items-center justify-center z-50 gap-4"
      : pos === 'left'
      ? "fixed left-6 top-1/2 -translate-y-1/2 w-20 h-auto py-6 rounded-[2rem] border flex-col items-center justify-center z-50 gap-4"
      : "fixed right-6 top-1/2 -translate-y-1/2 w-20 h-auto py-6 rounded-[2rem] border flex-col items-center justify-center z-50 gap-4",
    isClassicStyle
      ? "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-[0_15px_35px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.4)]"
      : isGlassStyle
      ? "bg-white/60 dark:bg-neutral-900/40 backdrop-blur-[20px] border-white/40 dark:border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.15)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.4)]"
      : "bg-white/20 dark:bg-neutral-900/25 backdrop-blur-[20px] border-white/30 dark:border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.15)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.4)]"
  );

  return (
    <div className={containerClass}>
      <UpdatesNotification />
      <PWAPrompt />
      {isGlassStyle && (
        <div 
          className="fixed inset-0 overflow-hidden pointer-events-none z-0"
          style={{ contain: 'paint', transform: 'translate3d(0, 0, 0)' }}
        >
          <div className="absolute inset-0 dark:hidden bg-gradient-to-br from-[#e0e7ff] via-[#fae8ff] to-[#f3e8ff] opacity-60" />
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-r from-blue-500/40 to-cyan-400/40 dark:from-orange-500/20 dark:to-amber-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse duration-1000" />
          <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-bl from-pink-500/40 to-purple-500/40 dark:from-red-600/20 dark:to-orange-500/20 blur-[150px] mix-blend-multiply dark:mix-blend-screen" />
          <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-yellow-400/40 to-pink-500/40 dark:from-indigo-600/20 dark:to-purple-900/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
        </div>
      )}
      {isLiquidGlassStyle && (
        <div 
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden transition-opacity duration-1000"
          style={{ contain: 'paint', transform: 'translate3d(0, 0, 0)' }}
        >
          {((settings.liquidBackgroundType || 'gradient') === 'gradient' || settings.liquidBackgroundType === 'animated') && (
            <>
              {/* Base background */}
              <div className="absolute inset-0 dark:hidden bg-gradient-to-br from-[#e0e7ff] via-[#fae8ff] to-[#f3e8ff] opacity-80" />
              <div className="absolute inset-0 hidden dark:block bg-gradient-to-br from-[#0a0a0c] via-[#111115] to-[#09090b] opacity-100" />

              {/* Sub-bg color wash for saturating colors under dark mode */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-950/20 dark:via-purple-950/20 dark:to-pink-950/20 blur-3xl saturate-200 opacity-60" />
              
              {/* Floating vibrant liquid-glass blobs with exact deep colors as Glassmorphism */}
              <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-r from-blue-500/45 to-cyan-400/45 dark:from-orange-500/25 dark:to-amber-500/25 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob-one" />
              <div className="absolute top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-bl from-pink-500/45 to-purple-500/45 dark:from-red-600/25 dark:to-orange-500/25 blur-[150px] mix-blend-multiply dark:mix-blend-screen animate-blob-two" />
              <div className="absolute -bottom-[10%] left-[20%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-yellow-400/45 to-pink-500/45 dark:from-indigo-600/25 dark:to-purple-900/25 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob-three" />
            </>
          )}
          {settings.liquidBackgroundType === 'custom' && settings.liquidBackgroundValue && (
            <div 
              className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-md opacity-60 dark:opacity-40 scale-105"
              style={{ backgroundImage: `url(${settings.liquidBackgroundValue})` }}
            />
          )}
          {/* Base Noise overlay for all liquid glass */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-30 mix-blend-overlay pointer-events-none" />
        </div>
      )}

      {/* Floating Unified Desktop Dock */}
      <div 
        ref={sidebarRef}
        className={sidebarClass}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Logo item in dock */}
        <div className={cn(
          "relative group flex items-center justify-center h-12 w-12 rounded-2xl border transition-all duration-300",
          isClassicStyle
            ? "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 shadow-sm"
            : "bg-white/20 dark:bg-black/20 border border-white/20 backdrop-blur-sm shadow-sm"
        )}>
          <img src="/logo.svg" alt="Control 360°" className="h-7 w-7 select-none" referrerPolicy="no-referrer" />
          <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-2.5 py-1 text-[11px] font-bold text-white bg-neutral-900/85 dark:bg-black/90 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-white/10">
            Control 360°
          </div>
        </div>

        {/* Separator */}
        <div className={cn(
          isClassicStyle ? "bg-neutral-200 dark:bg-neutral-700" : "bg-white/20 dark:bg-white/10", 
          isHorizontal ? "w-[1px] h-8 mx-1" : "w-8 h-[1px] my-1"
        )} />

        {/* Navigation Items with Magnification */}
        <div className={cn("flex items-center justify-center gap-3", isHorizontal ? "flex-row" : "flex-col")}>
          {[
            ...navigation,
            {
              name: 'Cerrar Sesión',
              icon: LogOut,
              isLogout: true,
              onClick: logout,
            }
          ].map((item, index) => (
            <DockItem
              key={item.name}
              item={item}
              index={index}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
              settings={settings}
              isVertical={!isHorizontal}
              pos={pos}
              location={location}
              openMenus={openMenus}
              toggleMenu={toggleMenu}
              setOpenMenus={setOpenMenus}
            />
          ))}
        </div>
      </div>

      {/* Mobile top bar */}
      <div className={cn(
        "md:hidden flex items-center justify-between p-4 border-b sticky top-0 z-50 transition-all duration-300",
        isClassicStyle
          ? "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
          : isGlassStyle
          ? "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-neutral-200/50 dark:border-neutral-800/50"
          : "bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md border-white/20 dark:border-white/10"
      )}>
        <div className="flex items-center">
          <div className="h-8 w-8 bg-indigo-600 dark:bg-indigo-500 rounded-lg flex items-center justify-center mr-2">
            <CheckCircle className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-neutral-900 dark:text-neutral-50 truncate max-w-[150px]">
            {profile?.name || 'Control 360°'}
          </span>
        </div>
        <button onClick={logout} className="p-2 text-red-600 dark:text-red-400">
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <div className={cn(
        "flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden overscroll-y-none transform-gpu relative z-10 transition-all duration-300 pb-24 md:pb-0",
        pos === 'left' && "md:pl-32",
        pos === 'right' && "md:pr-32",
        pos === 'top' && "pt-32",
        pos === 'bottom' && "pb-32"
      )}>
        {impersonatedUser && (
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 text-white font-semibold py-3.5 px-6 md:px-8 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-md animate-in slide-in-from-top duration-500 sticky top-0 z-[100] border-b border-indigo-500/30">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
              </span>
              <p className="text-xs md:text-sm tracking-wide">
                <span className="font-black uppercase bg-indigo-950/50 px-2 py-0.5 rounded text-[9px] mr-2">Simulación Activa</span>
                Interactuando como <span className="font-bold underline">{profile?.name || impersonatedUser.displayName || 'Control 360°'}</span> (<span className="font-mono text-xs text-indigo-200">{impersonatedUser.email}</span>)
              </p>
            </div>
            <button
              onClick={() => impersonateUser(null)}
              className="flex items-center gap-2 px-4 py-1.5 bg-white hover:bg-neutral-100 text-indigo-700 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-95 shadow cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
              Salir de Simulación
            </button>
          </div>
        )}
        
        <main className={cn(
          "relative z-10 flex-1 p-4 md:p-8 transition-colors duration-300",
          !isGlassStyle && !isLiquidGlassStyle && "bg-neutral-50 dark:bg-neutral-950"
        )}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Unified Mobile Bottom Navigation */}
      <div 
        className={cn(
          "md:hidden fixed bottom-4 left-4 right-4 h-16 rounded-[1.5rem] border flex justify-around items-center px-4 z-50 gap-2 shadow-lg transition-all duration-300",
          isClassicStyle
            ? "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
            : isGlassStyle
            ? "bg-white/70 dark:bg-neutral-900/60 backdrop-blur-[15px] border-white/30 dark:border-white/10"
            : "bg-white/20 dark:bg-neutral-900/25 backdrop-blur-[20px] border-white/20 dark:border-white/10"
        )}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {navigation.map((item, index) => (
          <DockItem
            key={item.name}
            item={item}
            index={index}
            hoveredIndex={hoveredIndex}
            setHoveredIndex={setHoveredIndex}
            settings={settings}
            isVertical={false}
            pos="bottom"
            location={location}
            openMenus={openMenus}
            toggleMenu={toggleMenu}
            setOpenMenus={setOpenMenus}
            isMobile={true}
          />
        ))}
      </div>

      <a
        href="https://wa.me/593985441487?text=Hola,%20necesito%20soporte%20con%20la%20App%20Control%20Cheques"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-[100] flex items-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white p-3 md:px-5 md:py-3 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 font-bold group"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="hidden md:inline max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap">
          Soporte / Ventas
        </span>
      </a>
    </div>
  );
}
