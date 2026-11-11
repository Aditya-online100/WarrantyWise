import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Filter, 
  Grid, 
  List, 
  Plus, 
  ExternalLink, 
  Trash2, 
  Edit3, 
  Shield, 
  Wrench, 
  Calendar, 
  Tag, 
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { api } from '../api';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { useToast } from '../components/common/Toast';

export function MyProducts({ onSelectProduct, onOpenAddProduct, onEditProduct }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, product: null, loading: false });

  const loadProducts = async () => {
    try {
      setLoading(true);
      let queryParams = [];
      if (searchQuery.trim()) queryParams.push(`q=${encodeURIComponent(searchQuery.trim())}`);
      if (selectedCategory) queryParams.push(`category_id=${selectedCategory}`);
      if (selectedStatus) queryParams.push(`status=${selectedStatus}`);
      if (sortBy) queryParams.push(`sort_by=${sortBy}`);

      const url = `/products${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`;
      const res = await api.get(url);
      if (res.success && res.data) {
        setProducts(res.data);
      }
    } catch (err) {
      toast.error('Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load categories once
    api.get('/categories')
      .then(res => res.success && setCategories(res.data))
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, selectedStatus, sortBy]);

  const confirmDelete = async () => {
    if (!deleteModal.product) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    try {
      await api.delete(`/products/${deleteModal.product.id}`);
      toast.success(`Product "${deleteModal.product.name}" deleted.`);
      setDeleteModal({ isOpen: false, product: null, loading: false });
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete product.');
      setDeleteModal(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* 1. TOP CONTROLS & FILTER BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, brand, model, serial #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 focus:bg-white text-slate-800 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
            />
          </div>

          {/* Action buttons & view toggle */}
          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Grid Cards View"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onOpenAddProduct}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register Product
            </button>
          </div>
        </div>

        {/* Filter Pills and Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 font-medium"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Warranty Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 font-medium"
          >
            <option value="">All Warranty Statuses</option>
            <option value="Active">Active Coverage</option>
            <option value="Expiring Soon">Expiring Soon (Within 30 Days)</option>
            <option value="Expired">Expired</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 font-medium ml-auto"
          >
            <option value="created_at">Recently Registered</option>
            <option value="warranty_expiring">Expiring Soonest</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="name_asc">Name: A to Z</option>
          </select>
        </div>
      </div>

      {/* 2. PRODUCTS DISPLAY: GRID OR TABLE */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Loading products...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No matching products found</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Try adjusting your search terms or filters, or register a new purchased product.
          </p>
          <button
            onClick={onOpenAddProduct}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs"
          >
            Register New Product
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map(p => (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-300 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group"
            >
              {/* Card Header */}
              <div className="p-5 flex-1 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    {p.category_name}
                  </span>
                  <StatusBadge status={p.warranty_status} />
                </div>

                <div>
                  <h4 
                    onClick={() => onSelectProduct(p.id)}
                    className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors line-clamp-1"
                  >
                    {p.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{p.brand} {p.model_number && `• ${p.model_number}`}</p>
                </div>

                {/* Details Pills */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{p.purchase_date}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 justify-end">
                    <span>${parseFloat(p.purchase_price).toFixed(2)}</span>
                  </div>
                </div>

                {/* Warranty Summary Bar */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700 truncate">{p.warranty_provider || 'Manufacturer Warranty'}</span>
                    {p.days_remaining !== null && (
                      <span className={`font-black ${
                        p.days_remaining <= 30 && p.days_remaining >= 0 ? 'text-amber-600' : p.days_remaining < 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {p.days_remaining < 0 ? 'Expired' : `${p.days_remaining}d left`}
                      </span>
                    )}
                  </div>

                  {p.warranty_end && (
                    <p className="text-[10px] text-slate-400">Coverage ends: {p.warranty_end}</p>
                  )}
                </div>

                {/* Maintenance Count & Expense if any */}
                {p.total_repairs > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-indigo-700 bg-indigo-50/60 px-3 py-1.5 rounded-lg border border-indigo-100">
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      {p.total_repairs} repair(s) logged
                    </span>
                    <span className="font-bold">${parseFloat(p.total_repair_expenditure).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
                <button
                  onClick={() => onSelectProduct(p.id)}
                  className="font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  View Details
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditProduct(p)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors"
                    title="Edit Product"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setDeleteModal({ isOpen: true, product: p, loading: false })}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors"
                    title="Delete Product"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-bold">Product Name</th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Purchased</th>
                  <th className="py-3 px-4 font-bold">Price</th>
                  <th className="py-3 px-4 font-bold">Warranty Status</th>
                  <th className="py-3 px-4 font-bold">Expires</th>
                  <th className="py-3 px-4 font-bold">Repairs</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 cursor-pointer" onClick={() => onSelectProduct(p.id)}>
                      <div>{p.name}</div>
                      <div className="text-[10px] font-normal text-slate-500">{p.brand} {p.serial_number && `• SN: ${p.serial_number}`}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{p.category_name}</td>
                    <td className="py-3.5 px-4 text-slate-600">{p.purchase_date}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">${parseFloat(p.purchase_price).toFixed(2)}</td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={p.warranty_status} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {p.warranty_end || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.total_repairs > 0 ? (
                        <span className="font-semibold text-indigo-600">${parseFloat(p.total_repair_expenditure).toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onSelectProduct(p.id)}
                          className="px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() => onEditProduct(p)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteModal({ isOpen: true, product: p, loading: false })}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        title={`Delete "${deleteModal.product?.name}"?`}
        message="This action will permanently delete this registered asset, its attached warranty, all historical repair service logs, and all uploaded invoice/receipt documents. This cannot be undone."
        confirmText="Permanently Delete"
        confirmVariant="danger"
        isLoading={deleteModal.loading}
        onConfirm={confirmDelete}
        onClose={() => setDeleteModal({ isOpen: false, product: null, loading: false })}
      />
    </div>
  );
}
