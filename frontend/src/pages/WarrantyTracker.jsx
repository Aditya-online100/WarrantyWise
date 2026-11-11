import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Calendar, 
  ExternalLink,
  Shield,
  Phone,
  FileCheck
} from 'lucide-react';
import { api } from '../api';
import { StatusBadge } from '../components/common/StatusBadge';

export function WarrantyTracker({ onSelectProduct }) {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(''); // '', 'Active', 'Expiring Soon', 'Expired'
  const [searchQuery, setSearchQuery] = useState('');

  const loadWarranties = async () => {
    try {
      setLoading(true);
      let query = [];
      if (statusFilter) query.push(`status=${encodeURIComponent(statusFilter)}`);
      if (searchQuery.trim()) query.push(`q=${encodeURIComponent(searchQuery.trim())}`);
      const url = `/warranties${query.length > 0 ? `?${query.join('&')}` : ''}`;
      const res = await api.get(url);
      if (res.success && res.data) {
        setWarranties(res.data);
      }
    } catch (err) {
      console.error('Error loading warranties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWarranties();
    }, 200);
    return () => clearTimeout(timer);
  }, [statusFilter, searchQuery]);

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Banner / Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by product, provider, policy #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 focus:bg-white text-slate-800 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto text-xs font-semibold">
            {[
              { id: '', label: 'All Warranties' },
              { id: 'Active', label: 'Active' },
              { id: 'Expiring Soon', label: 'Expiring Soon' },
              { id: 'Expired', label: 'Expired' }
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

      {/* Warranties Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Loading warranty tracker...</p>
        </div>
      ) : warranties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No warranties match criteria</h3>
          <p className="text-xs text-slate-500 mt-1">Try changing status filter or clear the search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {warranties.map(w => {
            const isUrgent = w.days_remaining <= 30 && w.days_remaining >= 0;
            const isExpired = w.days_remaining < 0;

            return (
              <div
                key={w.id}
                className={`bg-white rounded-2xl border shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between ${
                  isUrgent 
                    ? 'border-amber-300 bg-gradient-to-b from-amber-50/20 to-white' 
                    : isExpired 
                    ? 'border-slate-200 bg-slate-50/30 opacity-90' 
                    : 'border-slate-200/80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {w.category_name}
                    </span>
                    <StatusBadge status={w.status} />
                  </div>

                  <div>
                    <h4 
                      onClick={() => onSelectProduct(w.product_id)}
                      className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors"
                    >
                      {w.product_name}
                    </h4>
                    <p className="text-xs text-slate-500">{w.brand} • {w.warranty_type} Plan</p>
                  </div>

                  {/* Provider & Policy # */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Provider</span>
                      <span className="font-bold text-slate-800">{w.provider_name}</span>
                    </div>
                    {w.policy_number && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Policy #</span>
                        <span className="font-mono text-[11px] text-slate-600">{w.policy_number}</span>
                      </div>
                    )}
                  </div>

                  {/* Dates & Countdown */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-50">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Coverage Start</span>
                      <span className="text-[11px] font-semibold text-slate-700">{w.start_date}</span>
                    </div>
                    <div className={`p-2 rounded-lg ${isUrgent ? 'bg-amber-100/70' : isExpired ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                      <span className={`text-[10px] uppercase font-bold block ${isUrgent ? 'text-amber-800' : isExpired ? 'text-rose-800' : 'text-emerald-800'}`}>
                        Expiration Date
                      </span>
                      <span className={`text-[11px] font-black ${isUrgent ? 'text-amber-900' : isExpired ? 'text-rose-900' : 'text-emerald-900'}`}>
                        {w.end_date}
                      </span>
                    </div>
                  </div>

                  {/* Days remaining badge */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 font-medium">Status Countdown:</span>
                    <span className={`font-black ${
                      isUrgent ? 'text-amber-600 animate-pulse' : isExpired ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {isExpired ? 'Coverage Lapsed' : `${w.days_remaining} Days Remaining`}
                    </span>
                  </div>

                  {w.support_contact && (
                    <div className="text-[11px] text-slate-500 pt-1 truncate">
                      <span className="font-bold text-slate-600">Support:</span> {w.support_contact}
                    </div>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-slate-400">{w.duration_months} Months Term</span>
                  <button
                    onClick={() => onSelectProduct(w.product_id)}
                    className="font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    Asset Record
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

