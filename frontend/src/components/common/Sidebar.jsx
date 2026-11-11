import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ShieldCheck, 
  Wrench, 
  FileText, 
  BarChart3, 
  User, 
  ShieldAlert, 
  LogOut, 
  PlusCircle,
  Shield
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function Sidebar({ currentTab, setTab, onOpenAddProduct }) {
  const { user, isAdmin, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'My Products', icon: Package },
    { id: 'warranties', label: 'Warranty Tracker', icon: ShieldCheck },
    { id: 'repairs', label: 'Repair History', icon: Wrench },
    { id: 'documents', label: 'Document Vault', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'profile', label: 'My Profile', icon: User }
  ];

  if (isAdmin) {
    navItems.push({ id: 'admin', label: 'Admin Center', icon: ShieldAlert, badge: 'Admin' });
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col h-screen sticky top-0 select-none shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setTab('dashboard')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-extrabold text-slate-900 tracking-tight">Warranty<span className="text-indigo-600">Wise</span></span>
            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Asset & Warranty OS</span>
          </div>
        </div>
      </div>

      {/* Quick Add Product Trigger */}
      <div className="px-4 py-3">
        <button
          onClick={onOpenAddProduct}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold tracking-wide shadow-sm transition-all duration-200 hover:shadow-indigo-200 hover:shadow-md"
        >
          <PlusCircle className="w-4 h-4" />
          Register Product
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Management
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info & Logout Footer */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/60 shadow-xs mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
              {user?.full_name ? user.full_name.charAt(0) : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">{user?.full_name || 'User'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
            isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {user?.role || 'User'}
          </span>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

