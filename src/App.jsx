import './App.css'
import { Toaster } from "@/components/ui/toaster"
// Add page imports here
import FiscalInvoices from './pages/FiscalInvoices';
import FiscalInvoiceDetail from './pages/FiscalInvoiceDetail';
import FiscalInvoiceForm from './pages/FiscalInvoiceForm';
import FiscalSettings from './pages/FiscalSettings';
import FiscalImport from './pages/FiscalImport';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
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