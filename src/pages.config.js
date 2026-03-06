/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import ActivityLogs from './pages/ActivityLogs';
import CRM from './pages/CRM';
import CompanySelector from './pages/CompanySelector';
import Contacts from './pages/Contacts';
import Dashboard from './pages/Dashboard';
import EPIs from './pages/EPIs';
import FinancialAccounts from './pages/FinancialAccounts';
import Fuel from './pages/Fuel';
import Home from './pages/Home';
import ITAssets from './pages/ITAssets';
import Payables from './pages/Payables';
import Products from './pages/Products';
import Profile from './pages/Profile';
import Quotes from './pages/Quotes';
import Receivables from './pages/Receivables';
import Reports from './pages/Reports';
import Requisitions from './pages/Requisitions';
import SaleWithdrawals from './pages/SaleWithdrawals';
import Sales from './pages/Sales';
import SalesForecast from './pages/SalesForecast';
import Settings from './pages/Settings';
import SupplierQuotes from './pages/SupplierQuotes';
import Transactions from './pages/Transactions';
import Transfers from './pages/Transfers';
import Users from './pages/Users';
import Vehicles from './pages/Vehicles';
import Warehouse from './pages/Warehouse';
import Weighing from './pages/Weighing';
import DailyFinancialReport from './pages/DailyFinancialReport';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLogs": ActivityLogs,
    "CRM": CRM,
    "CompanySelector": CompanySelector,
    "Contacts": Contacts,
    "Dashboard": Dashboard,
    "EPIs": EPIs,
    "FinancialAccounts": FinancialAccounts,
    "Fuel": Fuel,
    "Home": Home,
    "ITAssets": ITAssets,
    "Payables": Payables,
    "Products": Products,
    "Profile": Profile,
    "Quotes": Quotes,
    "Receivables": Receivables,
    "Reports": Reports,
    "Requisitions": Requisitions,
    "SaleWithdrawals": SaleWithdrawals,
    "Sales": Sales,
    "SalesForecast": SalesForecast,
    "Settings": Settings,
    "SupplierQuotes": SupplierQuotes,
    "Transactions": Transactions,
    "Transfers": Transfers,
    "Users": Users,
    "Vehicles": Vehicles,
    "Warehouse": Warehouse,
    "Weighing": Weighing,
    "DailyFinancialReport": DailyFinancialReport,
}

export const pagesConfig = {
    mainPage: "CompanySelector",
    Pages: PAGES,
    Layout: __Layout,
};