import './App.css'
import { Toaster } from "@/components/ui/toaster"
// Add page imports here
import FiscalInvoices from './pages/FiscalInvoices';
import FiscalInvoiceDetail from './pages/FiscalInvoiceDetail';
import FiscalInvoiceForm from './pages/FiscalInvoiceForm';
import FiscalSettings from './pages/FiscalSettings';
import FiscalImport from './pages/FiscalImport';
import CostCenterReport from './pages/CostCenterReport';
import ClientDeliveries from './pages/ClientDeliveries';
import Cubage from './pages/Cubage';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ProtectedRoute from '@/components/ProtectedRoute';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingPublicSettings } = useAuth();

  // Show loading spinner while checking app public settings
  if (isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/FiscalInvoices" element={<LayoutWrapper currentPageName="FiscalInvoices"><FiscalInvoices /></LayoutWrapper>} />
      <Route path="/FiscalInvoiceDetail" element={<LayoutWrapper currentPageName="FiscalInvoiceDetail"><FiscalInvoiceDetail /></LayoutWrapper>} />
      <Route path="/FiscalInvoiceForm" element={<LayoutWrapper currentPageName="FiscalInvoiceForm"><FiscalInvoiceForm /></LayoutWrapper>} />
      <Route path="/FiscalSettings" element={<LayoutWrapper currentPageName="FiscalSettings"><FiscalSettings /></LayoutWrapper>} />
      <Route path="/FiscalImport" element={<LayoutWrapper currentPageName="FiscalImport"><FiscalImport /></LayoutWrapper>} />
      <Route path="/CostCenterReport" element={<LayoutWrapper currentPageName="CostCenterReport"><CostCenterReport /></LayoutWrapper>} />
      <Route path="/ClientDeliveries" element={<LayoutWrapper currentPageName="ClientDeliveries"><ClientDeliveries /></LayoutWrapper>} />
      <Route path="/Cubage" element={<LayoutWrapper currentPageName="Cubage"><Cubage /></LayoutWrapper>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App