import React, { useState, useEffect } from 'react';
import { 
  Package, 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  DollarSign, 
  Wrench, 
  TrendingUp, 
  ArrowUpRight, 
  Plus, 
  Sparkles,
  ExternalLink,
  Calendar,
  Layers
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { api } from '../api';
import { StatusBadge } from '../components/common/StatusBadge';

const CATEGORY_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

export function Dashboard({ onNavigate, onOpenAddProduct, onSelectProduct }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentProducts, setRecentProducts] = useState([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [analyticsRes, productsRes] = await Promise.all([
          api.get('/analytics/dashboard'),
          api.get('/products?sort_by=created_at')
        ]);

        if (analyticsRes.success && analyticsRes.data) {
          setData(analyticsRes.data);
        }
        if (productsRes.success && productsRes.data) {
          setRecentProducts(productsRes.data.slice(0, 5));
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading your warranty portfolio...</p>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    total_products: 0,
    active_warranties: 0,
    expiring_warranties: 0,
    expired_warranties: 0,
    total_repair_expenditure: 0,
    total_purchase_value: 0
  };

  const upcoming = data?.upcoming_expirations || [];
  const categoryDist = data?.category_distribution || [];
  const topRepairs = data?.top_repair_products || [];
  const monthlySpend = data?.monthly_repair_spending || [];

  return (
    <div className="p-8 space-y-8 animate-fadeIn max-w-7xl mx-auto">
      {/* 1. URGENT EXPIRING WARRANTIES ALERT BANNER (If any) */}
      {upcoming.length > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-sm flex-shrink-0 animate-bounce">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Action Required: {upcoming.length} Warranty {upcoming.length === 1 ? 'is' : 'are'} Expiring Soon!
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                Review covered assets before deadlines pass to schedule preventive servicing or file pending claims.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('warranties')}
              className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              Review Warranties
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. KPI METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Products */}
        <div 
          onClick={() => onNavigate('products')}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-300 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Products</span>
            <Package className="w-4 h-4 group-hover:text-indigo-600 transition-colors" />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{kpis.total_products}</p>
          <p className="text-[10px] text-slate-500 mt-1">Registered items</p>
        </div>

        {/* Active Warranties */}
        <div 
          onClick={() => onNavigate('warranties')}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-emerald-300 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Active</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 tracking-tight">{kpis.active_warranties}</p>
          <p className="text-[10px] text-slate-500 mt-1">Under coverage</p>
        </div>

        {/* Expiring Soon */}
        <div 
          onClick={() => onNavigate('warranties')}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-amber-300 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Expiring</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 tracking-tight">{kpis.expiring_warranties}</p>
          <p className="text-[10px] text-slate-500 mt-1">Next 30 days</p>
        </div>

        {/* Expired Warranties */}
        <div 
          onClick={() => onNavigate('warranties')}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-rose-300 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Expired</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 tracking-tight">{kpis.expired_warranties}</p>
          <p className="text-[10px] text-slate-500 mt-1">Coverage ended</p>
        </div>

        {/* Total Repair Expenditure */}
        <div 
          onClick={() => onNavigate('repairs')}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-300 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Repairs</span>
            <Wrench className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-600 tracking-tight">
            ${kpis.total_repair_expenditure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Cumulative spend</p>
        </div>

        {/* Total Asset Portfolio Value */}
        <div 
          onClick={() => onNavigate('products')}
          className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Asset Value</span>
            <TrendingUp className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">
            ${kpis.total_purchase_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Acquisition cost</p>
        </div>
      </div>

      {/* 3. CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown (Pie / Donut Chart) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Portfolio Distribution by Category</h3>
              <p className="text-xs text-slate-500">Asset volume across classifications</p>
            </div>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>

          <div className="h-64 w-full">
            {categoryDist.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDist}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {categoryDist.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(value, name, item) => [`${value} item(s) ($${item.payload.total_value.toFixed(2)})`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No category data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Monthly Repair Expenditures (Bar Chart) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Monthly Repair Spending</h3>
              <p className="text-xs text-slate-500">Service center maintenance costs over time</p>
            </div>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>

          <div className="h-64 w-full">
            {monthlySpend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySpend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val) => [`$${parseFloat(val).toFixed(2)}`, 'Repair Outlay']}
                  />
                  <Bar dataKey="cost" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No repair expenses recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. HIGH-MAINTENANCE ASSETS & UPCOMING EXPIRATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Expirations List */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upcoming Expirations</h3>
              <p className="text-xs text-slate-500">Warranties lapsing within 30 days</p>
            </div>
            <button 
              onClick={() => onNavigate('warranties')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              View All
            </button>
          </div>

          {upcoming.length > 0 ? (
            <div className="space-y-3">
              {upcoming.map((item, idx) => (
                <div 
                  key={idx}
                  onClick={() => onSelectProduct(item.product_id)}
                  className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/40 hover:bg-amber-50 hover:border-amber-300 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{item.product_name}</p>
                    <p className="text-[10px] text-slate-500">{item.provider_name} • Expires {item.end_date}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-200/80 text-amber-900">
                      {item.days_remaining} {item.days_remaining === 1 ? 'day' : 'days'} left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              All warranties are healthy. No expirations within the next 30 days.
            </div>
          )}
        </div>

        {/* Highest Repair Costs Leaderboard */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Highest Repair Costs</h3>
              <p className="text-xs text-slate-500">Products with highest cumulative maintenance spend</p>
            </div>
            <button 
              onClick={() => onNavigate('repairs')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              Full Ledger
            </button>
          </div>

          {topRepairs.length > 0 ? (
            <div className="space-y-3">
              {topRepairs.map((item, idx) => (
                <div 
                  key={idx}
                  onClick={() => onSelectProduct(item.product_id)}
                  className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-500">
                      Original Price: ${parseFloat(item.purchase_price).toFixed(2)} • {item.repair_ratio_pct}% repair ratio
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-extrabold text-indigo-600">
                      ${parseFloat(item.total_repair_cost).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              No repair costs logged yet.
            </div>
          )}
        </div>
      </div>

      {/* 5. RECENT PRODUCTS PREVIEW */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recently Registered Assets</h3>
            <p className="text-xs text-slate-500">Your latest electronics, appliances, and protected purchases</p>
          </div>
          <button 
            onClick={() => onNavigate('products')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            Browse All ({kpis.total_products})
          </button>
        </div>

        {recentProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3 font-bold">Product</th>
                  <th className="pb-3 font-bold">Category</th>
                  <th className="pb-3 font-bold">Purchased</th>
                  <th className="pb-3 font-bold">Price</th>
                  <th className="pb-3 font-bold">Warranty Status</th>
                  <th className="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 font-bold text-slate-900">
                      <div className="flex flex-col">
                        <span>{p.name}</span>
                        <span className="text-[10px] font-normal text-slate-500">{p.brand} {p.model_number && `• ${p.model_number}`}</span>
                      </div>
                    </td>
                    <td className="py-3 text-slate-600">{p.category_name}</td>
                    <td className="py-3 text-slate-600">{p.purchase_date}</td>
                    <td className="py-3 font-semibold text-slate-800">${parseFloat(p.purchase_price).toFixed(2)}</td>
                    <td className="py-3">
                      <StatusBadge status={p.warranty_status} />
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onSelectProduct(p.id)}
                        className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">No products registered yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click Register Product to add your first purchase</p>
            <button
              onClick={onOpenAddProduct}
              className="mt-3 px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl shadow-xs"
            >
              Add First Product
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

