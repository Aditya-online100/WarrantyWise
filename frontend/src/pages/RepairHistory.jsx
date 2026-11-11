import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  DollarSign, 
  Calendar, 
  Building2, 
  CheckCircle2, 
  Clock, 
  ExternalLink 
} from 'lucide-react';
import { api } from '../api';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { LogRepairModal } from '../components/modals/LogRepairModal';
import { useToast } from '../components/common/Toast';

export function RepairHistory({ onSelectProduct }) {
  const toast = useToast();
  const [repairs, setRepairs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalSpend, setTotalSpend] = useState(0);

  // Modals
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      let query = [];
      if (statusFilter) query.push(`status=${encodeURIComponent(statusFilter)}`);
      if (searchQuery.trim()) query.push(`q=${encodeURIComponent(searchQuery.trim())}`);
      const url = `/repairs${query.length > 0 ? `?${query.join('&')}` : ''}`;

      const [repairRes, prodRes] = await Promise.all([
        api.get(url),
        api.get('/products')
      ]);

      if (repairRes.success && repairRes.data) {
        setRepairs(repairRes.data);
        setTotalSpend(repairRes.total_expenditure || 0);
      }
      if (prodRes.success && prodRes.data) {
        setProducts(prodRes.data);
      }
    } catch (err) {
      toast.error('Failed to load repair records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [statusFilter, searchQuery]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/repairs/${deleteId}`);
      toast.success('Repair record deleted.');
      setDeleteId(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete repair record.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* 1. TOP SPENDING BANNER */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-bold tracking-wider text-indigo-300">Maintenance Ledger</span>
          <h2 className="text-2xl font-black tracking-tight mt-0.5">Cumulative Service Expenditures</h2>
          <p className="text-xs text-indigo-200 mt-1">Track parts, labor, deductibles, and repair histories across all items</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[11px] uppercase font-bold text-indigo-300 block">Total Expenditure</span>
            <span className="text-3xl font-black text-white">${totalSpend.toFixed(2)}</span>
          </div>

          <button
            onClick={() => {
              if (products.length === 0) {
                toast.error('Please register at least one product before logging a repair.');
                return;
              }
              setEditingRepair(null);
              setIsLogModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 text-xs font-bold shadow-md transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Log Repair
          </button>
        </div>
      </div>

      {/* 2. CONTROLS BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by service center, issue, or asset..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 focus:bg-white text-slate-800 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto text-xs font-semibold">
            {[
              { id: '', label: 'All Repairs' },
              { id: 'Completed', label: 'Completed' },
              { id: 'In Progress', label: 'In Progress' },
              { id: 'Pending', label: 'Pending' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-indigo-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. REPAIRS TABLE */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Loading repair ledger...</p>
        </div>
      ) : repairs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No repair records found</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">You have zero recorded service incidents matching this view.</p>
          {products.length > 0 && (
            <button
              onClick={() => {
                setEditingRepair(null);
                setIsLogModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs"
            >
              Log New Repair
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Associated Asset</th>
                  <th className="py-3.5 px-4">Service Center</th>
                  <th className="py-3.5 px-4">Issue Description</th>
                  <th className="py-3.5 px-4">Expense</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repairs.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">{r.repair_date}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 cursor-pointer" onClick={() => onSelectProduct(r.product_id)}>
                      <div className="hover:text-indigo-600 transition-colors">{r.product_name}</div>
                      <div className="text-[10px] font-normal text-slate-500">{r.product_brand}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">{r.service_center}</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-sm">
                      <div className="line-clamp-2">{r.issue_description}</div>
                      {r.technician_notes && (
                        <div className="text-[10px] text-slate-400 mt-0.5">Notes: {r.technician_notes}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">${parseFloat(r.cost).toFixed(2)}</td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={r.status} type="repair" />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingRepair(r);
                            setIsLogModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Delete"
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

      {/* Log Repair Modal */}
      {isLogModalOpen && (
        <LogRepairModal
          isOpen={isLogModalOpen}
          productId={editingRepair?.product_id || (products.length > 0 ? products[0].id : '')}
          productName={editingRepair?.product_name || (products.length > 0 ? products[0].name : '')}
          initialData={editingRepair}
          onRepairLogged={loadData}
          onClose={() => {
            setIsLogModalOpen(false);
            setEditingRepair(null);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={Boolean(deleteId)}
        title="Delete Repair Record?"
        message="This will remove this repair entry from your records and adjust the cumulative maintenance expenditure calculation."
        confirmText="Delete Record"
        isLoading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}

