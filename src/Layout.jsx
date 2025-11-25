import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  Building2, Package, Warehouse, TruckIcon, Scale, Fuel,
  CreditCard, Users, ShoppingCart, ShieldCheck, Monitor,
  BarChart3, Settings, LogOut, Menu, X, ChevronDown,
  Home, FileText, History, UserCircle, PackageCheck
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";

const navigationGroups = [
  {
    title: "Principal",
    items: [
      { title: "Dashboard", url: "Dashboard", icon: Home },
      { title: "Trocar Filial", url: "CompanySelector", icon: Building2 }
    ]
  },
  {
    title: "Gestão de Materiais",
    items: [
      { title: "Produtos", url: "Products", icon: Package },
      { title: "Almoxarifado", url: "Warehouse", icon: Warehouse },
      { title: "Transferências", url: "Transfers", icon: TruckIcon },
      { title: "Requisições", url: "Requisitions", icon: FileText }
    ]
  },
  {
    title: "Logística",
    items: [
      { title: "Veículos", url: "Vehicles", icon: TruckIcon },
      { title: "Pesagens", url: "Weighing", icon: Scale },
      { title: "Combustível", url: "Fuel", icon: Fuel }
    ]
  },
  {
    title: "Financeiro",
    items: [
      { title: "Contas", url: "FinancialAccounts", icon: CreditCard },
      { title: "Lançamentos", url: "Transactions", icon: FileText },
      { title: "Clientes/Fornecedores", url: "Contacts", icon: Users }
    ]
  },
  {
    title: "Comercial",
    items: [
      { title: "Orçamentos", url: "Quotes", icon: FileText }, // Added new item
      { title: "Vendas", url: "Sales", icon: ShoppingCart },
      { title: "Retiradas", url: "SaleWithdrawals", icon: PackageCheck }
    ]
  },
  {
    title: "Controles",
    items: [
      { title: "EPIs", url: "EPIs", icon: ShieldCheck },
      { title: "Ativos de TI", url: "ITAssets", icon: Monitor }
    ]
  },
  {
    title: "Gestão",
    items: [
      { title: "Relatórios", url: "Reports", icon: BarChart3 },
      { title: "Auditoria", url: "ActivityLogs", icon: History },
      { title: "Usuários", url: "Users", icon: Users },
      { title: "Configurações", url: "Settings", icon: Settings }
    ]
  }
  ];

  // Filtrar menu baseado no papel do usuário
  const filteredNavigation = useMemo(() => {
  if (!user) return [];

  if (user.custom_role === 'operator') {
    return navigationGroups.map(group => {
      // Remover grupos proibidos
      if (group.title === "Financeiro" || group.title === "Comercial" || group.title === "Principal") {
         if (group.title === "Principal") {
            // Manter apenas "Trocar Filial" no principal, remover Dashboard
            return {
              ...group,
              items: group.items.filter(item => item.url === 'CompanySelector')
            };
         }
         return null; 
      }

      // Filtrar itens específicos em outros grupos
      const filteredItems = group.items.filter(item => {
        const forbidden = ['Reports', 'ActivityLogs', 'Settings', 'Users', 'Dashboard'];
        return !forbidden.includes(item.url);
      });

      if (filteredItems.length === 0) return null;

      return { ...group, items: filteredItems };
    }).filter(Boolean);
  }

  return navigationGroups;
  }, [user]);

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const navigate = useNavigate();

  // Fetch user first to know permissions
  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const all = await base44.entities.Company.filter({ is_active: true });
      // Filtrar empresas permitidas para operador
      if (user.custom_role === 'operator' && user.allowed_companies?.length > 0) {
        return all.filter(c => user.allowed_companies.includes(c.id));
      }
      return all;
    },
    enabled: !!user,
    initialData: []
  });

  useEffect(() => {
    const checkCompany = async () => {
      if (!user || companies.length === 0) return;

      const savedCompanyId = localStorage.getItem('selectedCompanyId');
      
      // Se não tiver filial selecionada E não estiver na página de seleção, redirecionar
      if (!savedCompanyId && currentPageName !== 'CompanySelector') {
        // Use navigate instead of window.location to avoid refresh loops if configured correctly
        navigate(createPageUrl('CompanySelector'));
        return;
      }
      
      // Carregar filial selecionada
      if (savedCompanyId) {
        const company = companies.find(c => c.id === savedCompanyId);
        if (company) {
          setSelectedCompany(company);
        } else {
          // Se a filial salva não é permitida ou não existe, limpar e redirecionar
          localStorage.removeItem('selectedCompanyId');
          localStorage.removeItem('selectedCompanyName');
          if (currentPageName !== 'CompanySelector') {
             navigate(createPageUrl('CompanySelector'));
          }
        }
      }
    };
    checkCompany();
  }, [companies, currentPageName, user, navigate]);

  const handleCompanyChange = (company) => {
    setSelectedCompany(company);
    setSelectedCompanyId(company.id);
    localStorage.setItem('selectedCompanyId', company.id);
    localStorage.setItem('selectedCompanyName', company.name);
    window.location.reload();
  };

  const handleLogout = () => {
    localStorage.removeItem('selectedCompanyId');
    localStorage.removeItem('selectedCompanyName');
    base44.auth.logout();
  };

  // Se estiver na página de seleção de filial, não mostrar o layout
  if (currentPageName === 'CompanySelector') {
    return <>{children}</>;
  }

  // Se não tiver filial selecionada, não renderizar nada (vai redirecionar)
  if (!selectedCompanyId) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-slate-100">
        <Sidebar className="border-r border-slate-200 bg-white">
          <SidebarHeader className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-slate-900 text-lg">Andres Tech</h2>
                <p className="text-xs text-slate-500 truncate">Sistema de Gestão</p>
              </div>
            </div>

            {selectedCompany && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full mt-3 justify-between">
                    <span className="truncate">{selectedCompany.name}</span>
                    <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {companies.map((company) => (
                    <DropdownMenuItem
                      key={company.id}
                      onClick={() => handleCompanyChange(company)}
                      className={selectedCompanyId === company.id ? "bg-purple-50" : ""}
                    >
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
            )}
          </SidebarHeader>

          <SidebarContent className="p-2">
            {filteredNavigation.map((group) => (
              <SidebarGroup key={group.title}>
                <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-purple-50 hover:text-purple-700 transition-colors duration-200 rounded-lg mb-1 ${
                            location.pathname === createPageUrl(item.url)
                              ? 'bg-purple-50 text-purple-700'
                              : ''
                          }`}
                        >
                          <Link to={createPageUrl(item.url)} className="flex items-center gap-3 px-3 py-2">
                            <item.icon className="w-4 h-4" />
                            <span className="font-medium text-sm">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-200 p-4">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start px-2 h-auto py-2">
                    <Avatar className="h-8 w-8 mr-3">
                      <AvatarFallback className="bg-purple-100 text-purple-700 font-semibold">
                        {user.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">
                        {user.full_name || user.email}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user.role}</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl("Profile")} className="cursor-pointer">
                      <UserCircle className="w-4 h-4 mr-2" />
                      Meu Perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white border-b border-slate-200 px-6 py-4 md:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-semibold text-slate-900">Andres Tech</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}