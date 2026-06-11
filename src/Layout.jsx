import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  Building2, Package, Warehouse, TruckIcon, Scale, Fuel,
  CreditCard, Users, ShoppingCart, ShieldCheck, Monitor,
  BarChart3, Settings, LogOut, ChevronDown, ChevronUp,
  Home, FileText, History, UserCircle, PackageCheck,
  ArrowDownToLine, ArrowUpFromLine, Bot, TrendingUp,
  ClipboardList, RepeatIcon, RefreshCw, ArrowLeftRight
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const navigationGroups = [
  {
    title: "Gestão de Materiais",
    icon: Package,
    items: [
      { title: "Produtos", url: "Products", icon: Package },
      { title: "Almoxarifado", url: "Warehouse", icon: Warehouse },
      { title: "Transferências", url: "Transfers", icon: ArrowLeftRight },
      { title: "Requisições", url: "Requisitions", icon: FileText },
      { title: "Pedidos de Compra", url: "PurchaseOrders", icon: ClipboardList }
    ]
  },
  {
    title: "Logística",
    icon: TruckIcon,
    items: [
      { title: "Veículos", url: "Vehicles", icon: TruckIcon },
      { title: "Pesagens", url: "Weighing", icon: Scale },
      { title: "Combustível", url: "Fuel", icon: Fuel }
    ]
  },
  {
    title: "Financeiro",
    icon: CreditCard,
    items: [
      { title: "Contas", url: "FinancialAccounts", icon: CreditCard },
      { title: "Contas a Receber", url: "Receivables", icon: ArrowDownToLine },
      { title: "Contas a Pagar", url: "Payables", icon: ArrowUpFromLine },
      { title: "Lançamentos", url: "Transactions", icon: FileText },
      { title: "Recorrências", url: "RecurringTransactions", icon: RepeatIcon },
      { title: "Relatório Diário", url: "DailyFinancialReport", icon: BarChart3 },
      { title: "Clientes/Fornecedores", url: "Contacts", icon: Users }
    ]
  },
  {
    title: "Comercial",
    icon: ShoppingCart,
    items: [
      { title: "Cotações com IA", url: "SupplierQuotes", icon: Bot },
      { title: "Previsão de Vendas", url: "SalesForecast", icon: TrendingUp },
      { title: "Orçamentos", url: "Quotes", icon: FileText },
      { title: "Vendas", url: "Sales", icon: ShoppingCart },
      { title: "Retiradas", url: "SaleWithdrawals", icon: PackageCheck },
      { title: "CRM", url: "CRM", icon: Users }
    ]
  },
  {
    title: "Controles",
    icon: ShieldCheck,
    items: [
      { title: "EPIs", url: "EPIs", icon: ShieldCheck },
      { title: "Ativos de TI", url: "ITAssets", icon: Monitor }
    ]
  },
  {
    title: "Gestão",
    icon: BarChart3,
    items: [
      { title: "Relatórios", url: "Reports", icon: BarChart3 },
      { title: "Auditoria", url: "ActivityLogs", icon: History },
      { title: "Usuários", url: "Users", icon: Users },
      { title: "Configurações", url: "Settings", icon: Settings }
    ]
  }
];

// Groups open by default
const DEFAULT_OPEN = new Set(["Gestão de Materiais", "Logística", "Financeiro", "Comercial", "Controles", "Gestão"]);

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

    return navigationGroups;
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
      <div className="min-h-screen flex w-full bg-slate-50">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 min-h-screen flex-shrink-0">
          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base leading-tight">Andres Tech</h2>
                <p className="text-xs text-slate-400">Sistema de Gestão</p>
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
              <p className="text-xs text-slate-500 mb-1 font-medium">Filial</p>
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
              className="mt-2 flex items-center gap-2 px-1 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
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
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      hasActiveItem || isOpen
                        ? 'bg-slate-100 text-slate-800'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <GroupIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />
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
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                              active
                                ? 'bg-violet-50 text-violet-700 font-medium border-l-[3px] border-violet-600'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                            }`}
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-violet-600' : 'text-slate-400'}`} />
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
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile header */}
          <header className="bg-white border-b border-slate-200 px-4 py-3 md:hidden flex items-center gap-3 sticky top-0 z-10">
            <SidebarTrigger className="p-2 rounded-lg hover:bg-slate-100 transition-colors" />
            <h1 className="text-lg font-semibold text-slate-900">Andres Tech</h1>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}