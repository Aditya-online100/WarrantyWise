import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';

// Pages
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { MyProducts } from './pages/MyProducts';
import { ProductDetails } from './pages/ProductDetails';
import { WarrantyTracker } from './pages/WarrantyTracker';
import { RepairHistory } from './pages/RepairHistory';
import { DocumentVault } from './pages/DocumentVault';
import { Analytics } from './pages/Analytics';
import { UserProfile } from './pages/UserProfile';
import { AdminDashboard } from './pages/AdminDashboard';

// Modals
import { AddProductModal } from './components/modals/AddProductModal';

function MainApp() {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedProductId, setSelectedProductId] = useState(null);

  // Global Add Product Modal
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Refresh trigger counter to signal product list reloads
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Initializing WarrantyWise Secure Session...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated Flow
  if (!isAuthenticated) {
    if (authView === 'register') {
      return <Register onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <Login onSwitchToRegister={() => setAuthView('register')} />;
  }

  // Navigation handlers
  const handleSelectProduct = (productId) => {
    setSelectedProductId(productId);
    setCurrentTab('product-detail');
  };

  const handleEditProduct = (prod) => {
    setEditingProduct(prod);
    setIsAddProductOpen(true);
  };

  const handleProductCreatedOrUpdated = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard': return { title: 'Warranty Portfolio Dashboard', subtitle: 'Real-time overview of assets, warranty statuses, and maintenance' };
      case 'products': return { title: 'My Registered Products', subtitle: 'Manage personal and business assets, serials, and invoices' };
      case 'product-detail': return { title: 'Asset Specification & Coverage', subtitle: 'Detailed warranty policies, repair ledger, and document vault' };
      case 'warranties': return { title: 'Active Warranty Tracker', subtitle: 'Lifecycle countdowns, provider contacts, and policy management' };
      case 'repairs': return { title: 'Repair & Service History', subtitle: 'Cumulative maintenance expenditure and work order records' };
      case 'documents': return { title: 'Document & Invoice Vault', subtitle: 'Encrypted storage for purchase invoices, cards, and receipts' };
      case 'analytics': return { title: 'Financial & Warranty Analytics', subtitle: 'Interactive charts, risk assessment, and Power BI datasets' };
      case 'profile': return { title: 'User Profile & Security', subtitle: 'Manage identity credentials, security settings, and personal details' };
      case 'admin': return { title: 'System Administration Console', subtitle: 'User role governance, platform metrics, and security audit logs' };
      default: return { title: 'WarrantyWise', subtitle: '' };
    }
  };

  const { title, subtitle } = getPageTitle();

  return (
    <div className="flex min-h-screen bg-slate-50 selection:bg-indigo-500 selection:text-white">
      {/* 1. SIDEBAR */}
      <Sidebar
        currentTab={currentTab}
        setTab={(tab) => {
          setSelectedProductId(null);
          setCurrentTab(tab);
        }}
        onOpenAddProduct={() => {
          setEditingProduct(null);
          setIsAddProductOpen(true);
        }}
      />

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          onOpenAddProduct={() => {
            setEditingProduct(null);
            setIsAddProductOpen(true);
          }}
        />

        <main className="flex-1 pb-16">
          {currentTab === 'dashboard' && (
            <Dashboard
              key={refreshTrigger}
              onNavigate={(tab) => setCurrentTab(tab)}
              onOpenAddProduct={() => {
                setEditingProduct(null);
                setIsAddProductOpen(true);
              }}
              onSelectProduct={handleSelectProduct}
            />
          )}

          {currentTab === 'products' && (
            <MyProducts
              key={refreshTrigger}
              onSelectProduct={handleSelectProduct}
              onOpenAddProduct={() => {
                setEditingProduct(null);
                setIsAddProductOpen(true);
              }}
              onEditProduct={handleEditProduct}
            />
          )}

          {currentTab === 'product-detail' && selectedProductId && (
            <ProductDetails
              productId={selectedProductId}
              onBack={() => setCurrentTab('products')}
              onEditProduct={handleEditProduct}
            />
          )}

          {currentTab === 'warranties' && (
            <WarrantyTracker
              key={refreshTrigger}
              onSelectProduct={handleSelectProduct}
            />
          )}

          {currentTab === 'repairs' && (
            <RepairHistory
              key={refreshTrigger}
              onSelectProduct={handleSelectProduct}
            />
          )}

          {currentTab === 'documents' && (
            <DocumentVault
              key={refreshTrigger}
              onSelectProduct={handleSelectProduct}
            />
          )}

          {currentTab === 'analytics' && (
            <Analytics key={refreshTrigger} />
          )}

          {currentTab === 'profile' && (
            <UserProfile />
          )}

          {currentTab === 'admin' && isAdmin && (
            <AdminDashboard />
          )}
        </main>
      </div>

      {/* 3. GLOBAL ADD / EDIT PRODUCT MODAL */}
      <AddProductModal
        isOpen={isAddProductOpen}
        initialData={editingProduct}
        onClose={() => {
          setIsAddProductOpen(false);
          setEditingProduct(null);
        }}
        onProductCreated={handleProductCreatedOrUpdated}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </AuthProvider>
  );
}

