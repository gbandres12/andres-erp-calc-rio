import CompanySelector from './pages/CompanySelector';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Warehouse from './pages/Warehouse';
import Transfers from './pages/Transfers';
import Vehicles from './pages/Vehicles';
import Contacts from './pages/Contacts';
import Profile from './pages/Profile';
import ActivityLogs from './pages/ActivityLogs';
import Settings from './pages/Settings';
import Requisitions from './pages/Requisitions';
import Weighing from './pages/Weighing';
import Fuel from './pages/Fuel';
import FinancialAccounts from './pages/FinancialAccounts';
import Transactions from './pages/Transactions';
import Sales from './pages/Sales';
import EPIs from './pages/EPIs';
import ITAssets from './pages/ITAssets';
import Reports from './pages/Reports';
import SaleWithdrawals from './pages/SaleWithdrawals';
import Quotes from './pages/Quotes';
import Users from './pages/Users';
import Receivables from './pages/Receivables';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CompanySelector": CompanySelector,
    "Dashboard": Dashboard,
    "Products": Products,
    "Warehouse": Warehouse,
    "Transfers": Transfers,
    "Vehicles": Vehicles,
    "Contacts": Contacts,
    "Profile": Profile,
    "ActivityLogs": ActivityLogs,
    "Settings": Settings,
    "Requisitions": Requisitions,
    "Weighing": Weighing,
    "Fuel": Fuel,
    "FinancialAccounts": FinancialAccounts,
    "Transactions": Transactions,
    "Sales": Sales,
    "EPIs": EPIs,
    "ITAssets": ITAssets,
    "Reports": Reports,
    "SaleWithdrawals": SaleWithdrawals,
    "Quotes": Quotes,
    "Users": Users,
    "Receivables": Receivables,
}

export const pagesConfig = {
    mainPage: "CompanySelector",
    Pages: PAGES,
    Layout: __Layout,
};