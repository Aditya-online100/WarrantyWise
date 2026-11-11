import React from 'react';
import { Plus, Bell, Search, Sparkles } from 'lucide-react';

export function Header({ title, subtitle, onOpenAddProduct, onSearch, searchQuery }) {
  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-200/80 px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {onSearch && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products, brands, serials..."
              value={searchQuery || ''}
              onChange={(e) => onSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-xs bg-slate-100 hover:bg-slate-200/60 focus:bg-white text-slate-800 placeholder-slate-400 rounded-xl border border-transparent focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all w-64"
            />
          </div>
        )}

        {onOpenAddProduct && (
          <button
            onClick={onOpenAddProduct}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        )}
      </div>
    </header>
  );
}

