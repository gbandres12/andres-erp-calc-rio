import ActivityLogs from './pages/ActivityLogs';
import CompanySelector from './pages/CompanySelector';
import Contacts from './pages/Contacts';
import Dashboard from './pages/Dashboard';
import EPIs from './pages/EPIs';
import FinancialAccounts from './pages/FinancialAccounts';
import Fuel from './pages/Fuel';
import Home from './pages/Home';
import ITAssets from './pages/ITAssets';
import Products from './pages/Products';
import Profile from './pages/Profile';
import Quotes from './pages/Quotes';
import Receivables from './pages/Receivables';
import Reports from './pages/Reports';
import Requisitions from './pages/Requisitions';
import SaleWithdrawals from './pages/SaleWithdrawals';
import Sales from './pages/Sales';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Transfers from './pages/Transfers';
import Users from './pages/Users';
import Vehicles from './pages/Vehicles';
import Warehouse from './pages/Warehouse';
import Weighing from './pages/Weighing';
import Payables from './pages/Payables';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLogs": ActivityLogs,
    "CompanySelector": CompanySelector,
    "Contacts": Contacts,
    "Dashboard": Dashboard,
    "EPIs": EPIs,
    "FinancialAccounts": FinancialAccounts,
    "Fuel": Fuel,
    "Home": Home,
    "ITAssets": ITAssets,
    "Products": Products,
    "Profile": Profile,
    "Quotes": Quotes,
    "Receivables": Receivables,
    "Reports": Reports,
    "Requisitions": Requisitions,
    "SaleWithdrawals": SaleWithdrawals,
    "Sales": Sales,
    "Settings": Settings,
    "Transactions": Transactions,
    "Transfers": Transfers,
    "Users": Users,
    "Vehicles": Vehicles,
    "Warehouse": Warehouse,
    "Weighing": Weighing,
    "Payables": Payables,
}

export const pagesConfig = {
    mainPage: "CompanySelector",
    Pages: PAGES,
    Layout: __Layout,
};