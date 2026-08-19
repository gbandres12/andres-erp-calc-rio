import {
  Building2, Package, Warehouse, TruckIcon, Scale, Fuel,
  CreditCard, Users, ShoppingCart, ShieldCheck, Monitor,
  BarChart3, Settings, FileText, History, PackageCheck,
  ArrowDownToLine, ArrowUpFromLine, Bot, TrendingUp,
  ClipboardList, RepeatIcon, ArrowLeftRight, Receipt, Upload, Layers, Wheat
} from "lucide-react";

// Fonte única da navegação — usada pelo Layout (filtrar menu) e pela tela de
// Usuários (selecionar permissões granulares por módulo).
export const navigationGroups = [
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
      { title: "Extrato por CC", url: "CostCenterReport", icon: Layers },
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
      { title: "Saídas e Permutas", url: "ClientDeliveries", icon: Wheat },
      { title: "CRM", url: "CRM", icon: Users }
    ]
  },
  {
    title: "Fiscal",
    icon: Receipt,
    items: [
      { title: "Notas Fiscais", url: "FiscalInvoices", icon: Receipt },
      { title: "Importar Emissor Antigo", url: "FiscalImport", icon: Upload },
      { title: "Config. Fiscal", url: "FiscalSettings", icon: Settings }
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

// Lista plana de todos os módulos (url) disponíveis — usado para permissões.
export const allModuleUrls = navigationGroups.flatMap(g => g.items.map(i => i.url));