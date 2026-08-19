import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  Building2, LogOut, ChevronDown, ChevronUp,
  UserCircle, RefreshCw, ArrowLeftRight
} from "lucide-react";
import { navigationGroups } from "@/lib/navigationConfig";
import {
  Sidebar, SidebarContent, SidebarProvider, SidebarTrigger, useSidebar
} from "@/components/ui/sidebar";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Groups start collapsed and expand when selected.
const DEFAULT_OPEN = new Set();

// Fecha o menu lateral mobile ao trocar de página
function MobileNavCloser() {
  const { setOpenMobile } = useSidebar();
  const location = useLocation();
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);
  return null;
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  useEffect(() => {
    const intervalTime = parseInt(localStorage.getItem('refresh_interval') || '0');
    if (intervalTime > 0) {
      const interval = setInterval(() => handleRefreshData(), intervalTime);
      return () => clearInterval(interval);
    }
  }, []);

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const toggleGroup = (title) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const filteredNavigation = React.useMemo(() => { // eslint-disable-line
    if (!user) return navigationGroups;

    if (user.custom_role === 'operator') {
      return navigationGroups.map(group => {
        if (group.title === "Financeiro") {
          const items = group.items.filter(i => i.url === 'Contacts');
          return items.length ? { ...group, items } : null;
        }
        if (group.title === "Comercial") {
          const allowed = ['Sales', 'SaleWithdrawals', 'Quotes', 'Contacts'];
          const items = group.items.filter(i => allowed.includes(i.url));
          return items.length ? { ...group, items } : null;
        }
        const forbidden = ['ActivityLogs', 'Settings', 'Users', 'Dashboard', 'SupplierQuotes', 'SalesForecast', 'CRM'];
        const items = group.items.filter(i => !forbidden.includes(i.url));
        return items.length ? { ...group, items } : null;
      }).filter(Boolean);
    }

    if (user.custom_role === 'scale_operator') {
      const allowed = {
        "Gestão de Materiais": ['Products'],
        "Logística": ['Vehicles', 'Weighing'],
        "Comercial": ['Sales', 'SaleWithdrawals'],
      };
      return navigationGroups.map(group => {
        const allowedItems = allowed[group.title];
        if (!allowedItems) return null;
        const items = group.items.filter(i => allowedItems.includes(i.url));
        return items.length ? { ...group, items } : null;
      }).filter(Boolean);
    }

    // Perfil personalizado: mostra apenas os módulos marcados em custom_permissions
    if (user.custom_role === 'custom') {
      const allowed = new Set(user.custom_permissions || []);
      return navigationGroups.map(group => {
        const items = group.items.filter(i => allowed.has(i.url));
        return items.length ? { ...group, items } : null;
      }).filter(Boolean);
    }

    return navigationGroups;
  }, [user]);

  // Perfil personalizado: expandir automaticamente os grupos com módulos permitidos,
  // para que o usuário veja seus módulos sem precisar clicar em cada grupo.
  useEffect(() => {
    if (user?.custom_role === 'custom') {
      const allowed = new Set(user.custom_permissions || []);
      const groupsToOpen = navigationGroups
        .filter(g => g.items.some(i => allowed.has(i.url)))
        .map(g => g.title);
      setOpenGroups(new Set(groupsToOpen));
    }
  }, [user]);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const all = await base44.entities.Company.filter({ is_active: true });
      if (user.custom_role === 'operator' && user.allowed_companies?.length > 0) {
        return all.filter(c => user.allowed_companies.includes(c.id));
      }
      return all;
    },
    enabled: !!user,
    initialData: []
  });

  useEffect(() => {
    if (!user || companies.length === 0) return;
    const savedCompanyId = localStorage.getItem('selectedCompanyId');
    if (!savedCompanyId && currentPageName !== 'CompanySelector' && currentPageName !== 'Settings') {
      navigate(createPageUrl('CompanySelector'));
      return;
    }
    if (savedCompanyId) {
      const company = companies.find(c => c.id === savedCompanyId);
      if (company) {
        setSelectedCompany(company);
      } else {
        localStorage.removeItem('selectedCompanyId');
        localStorage.removeItem('selectedCompanyName');
        if (currentPageName !== 'CompanySelector') navigate(createPageUrl('CompanySelector'));
      }
    }
  }, [companies, currentPageName, user, navigate]);

  const handleCompanyChange = async (company) => {
    setSelectedCompany(company);
    setSelectedCompanyId(company.id);
    localStorage.setItem('selectedCompanyId', company.id);
    localStorage.setItem('selectedCompanyName', company.name);
    await queryClient.invalidateQueries();
    navigate(createPageUrl('Dashboard'));
    toast.success(`Filial alterada para ${company.name}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('selectedCompanyId');
    localStorage.removeItem('selectedCompanyName');
    base44.auth.logout();
  };

  if (currentPageName === 'CompanySelector') return <>{children}</>;
  if (!selectedCompanyId && currentPageName !== 'Settings') return null;

  const isActive = (url) => location.pathname === createPageUrl(url);

  return (
    <SidebarProvider>
      <MobileNavCloser />
      <div className="min-h-screen flex w-full bg-slate-50">
        {/* Sidebar */}
        <Sidebar>
          <div className="bg-white flex flex-col h-full w-full border-r border-slate-200">
          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base leading-tight">Andres Tech</h2>
                <p className="text-xs text-slate-600 font-medium">Sistema de Gestão</p>
              </div>
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-violet-500 text-violet-700 text-sm font-medium hover:bg-violet-50 transition-colors mb-4"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Atualizando...' : 'Atualizar Dados'}
            </button>

            {/* Company selector */}
            <div>
              <p className="text-xs text-slate-700 mb-1 font-bold uppercase tracking-wide">Filial</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <span className="truncate">{selectedCompany?.name || 'Selecione...'}</span>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {companies.map(company => (
                    <DropdownMenuItem key={company.id} onClick={() => handleCompanyChange(company)}>
                      <Building2 className="w-4 h-4 mr-2" />
                      {company.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl("CompanySelector")}>
                      <Building2 className="w-4 h-4 mr-2" />
                      Ver Todas as Filiais
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Trocar Filial link */}
            <Link
              to={createPageUrl("CompanySelector")}
              className="mt-2 flex items-center gap-2 px-1 py-1.5 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Trocar Filial
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            {filteredNavigation.map((group) => {
              const isOpen = openGroups.has(group.title);
              const GroupIcon = group.icon;
              const hasActiveItem = group.items.some(i => isActive(i.url));

              return (
                <div key={group.title} className="mb-1">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                      hasActiveItem || isOpen
                        ? 'bg-slate-100 text-slate-900 border-slate-300'
                        : 'text-slate-700 hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    <GroupIcon className="w-4 h-4 text-slate-700 flex-shrink-0" />
                    <span className="flex-1 text-left">{group.title}</span>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />
                    }
                  </button>

                  {/* Group items */}
                  {isOpen && (
                    <div className="mt-0.5 ml-2">
                      {group.items.map((item) => {
                        const active = isActive(item.url);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.title}
                            to={createPageUrl(item.url)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 border ${
                              active
                                ? 'bg-violet-50 text-violet-800 font-semibold border-l-[3px] border-violet-600'
                                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border-transparent'
                            }`}
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-violet-700' : 'text-slate-600'}`} />
                            <span>{item.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer - User */}
          {user && (
            <div className="border-t border-slate-100 p-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-violet-100 text-violet-700 text-sm font-semibold">
                        {user.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{user.full_name || user.email}</p>
                      <p className="text-xs text-slate-400 truncate">{user.role}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52" align="end">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl("Profile")}>
                      <UserCircle className="w-4 h-4 mr-2" />
                      Meu Perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          </div>
        </Sidebar>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile header */}
          <header className="bg-white border-b border-slate-200 px-4 py-3 md:hidden flex items-center gap-3 sticky top-0 z-10">
            <SidebarTrigger className="p-2 rounded-lg hover:bg-slate-100 transition-colors" />
            <h1 className="text-lg font-semibold text-slate-900">Andres Tech</h1>
          </header>

          <div className="flex-1 overflow-auto">
            {/* Banner de Filial Ativa - alto contraste */}
            {selectedCompany && (
              <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b-[3px] border-violet-500 sticky top-0 z-20">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Filial ativa:</span>
                  <span className="text-sm font-bold text-white">{selectedCompany.name}</span>
                  {selectedCompany.code && (
                    <span className="text-xs text-slate-400 hidden sm:inline">({selectedCompany.code})</span>
                  )}
                </div>
                <Link
                  to={createPageUrl("CompanySelector")}
                  className="text-xs font-semibold text-violet-300 hover:text-white transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Trocar filial</span>
                </Link>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}