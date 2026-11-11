import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  Layers, 
  DollarSign, 
  ShieldCheck, 
  PieChart as PieIcon,
  HelpCircle,
  Database,
  ExternalLink
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { api } from '../api';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

export function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/dashboard')
      .then(res => {
        if (res.success && res.data) {
          setData(res.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">Calculating analytical metrics...</p>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const categoryDist = data?.category_distribution || [];
  const topRepairs = data?.top_repair_products || [];
  const monthlySpend = data?.monthly_repair_spending || [];

  // Comparison dataset: Purchase price vs Repair cost per category
  const categoryComparison = categoryDist.map(c => ({
    name: c.name.length > 15 ? `${c.name.substring(0, 15)}...` : c.name,
    "Purchase Value": parseFloat(c.total_value.toFixed(2)),
    "Repair Cost": parseFloat(c.repair_cost.toFixed(2))
  }));

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* 1. HEADER */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Warranty & Financial Analytics</h2>
        <p className="text-xs text-slate-500 mt-0.5">Statistical insights, risk analysis, and maintenance spending patterns</p>
      </div>

      {/* 2. OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">Total Portfolio Value</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            ${(kpis.total_purchase_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Original asset acquisition cost</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">Total Repair Outlay</span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">
            ${(kpis.total_repair_expenditure || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">
            {kpis.total_purchase_value > 0 
              ? `${((kpis.total_repair_expenditure / kpis.total_purchase_value) * 100).toFixed(1)}% of total purchase value`
              : '0% ratio'}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">Coverage Ratio</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {kpis.total_products > 0
              ? `${Math.round(((kpis.active_warranties + kpis.expiring_warranties) / kpis.total_products) * 100)}%`
              : '0%'}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Assets under valid warranty</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-slate-400 block">High-Risk Assets</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {topRepairs.filter(r => r.repair_ratio_pct > 30).length}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Repairs exceed 30% of purchase price</span>
        </div>
      </div>

      {/* 3. CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Investment vs Repair Cost (Grouped Bar Chart) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Purchase Value vs Repair Spending by Category</h3>
            <p className="text-xs text-slate-500">Compare asset purchase investment against cumulative maintenance costs</p>
          </div>

          <div className="h-72 w-full">
            {categoryComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryComparison} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val) => [`$${val.toFixed(2)}`]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '15px' }} />
                  <Bar dataKey="Purchase Value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Repair Cost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No comparative data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Monthly Trend Chart */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Monthly Maintenance Expense Timeline</h3>
            <p className="text-xs text-slate-500">Historical trend of out-of-pocket repair costs</p>
          </div>

          <div className="h-72 w-full">
            {monthlySpend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySpend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(val) => [`$${parseFloat(val).toFixed(2)}`, 'Repair Expense']}
                  />
                  <Bar dataKey="cost" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No monthly spending data logged yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. HIGH-MAINTENANCE ASSET RISK AUDIT */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Asset Maintenance Risk Assessment
          </h3>
          <p className="text-xs text-slate-500">
            Identifies items where maintenance expenditures are disproportional to original acquisition value
          </p>
        </div>

        {topRepairs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Asset</th>
                  <th className="py-3 px-3">Purchase Price</th>
                  <th className="py-3 px-3">Total Repairs</th>
                  <th className="py-3 px-3">Maintenance Ratio</th>
                  <th className="py-3 px-3">Advisory Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topRepairs.map((item, idx) => {
                  const isHighRisk = item.repair_ratio_pct >= 30;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3 font-bold text-slate-900">{item.name}</td>
                      <td className="py-3 px-3 text-slate-700">${parseFloat(item.purchase_price).toFixed(2)}</td>
                      <td className="py-3 px-3 font-black text-rose-600">${parseFloat(item.total_repair_cost).toFixed(2)}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${
                          isHighRisk ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.repair_ratio_pct}% of Cost
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[11px] font-semibold ${
                          isHighRisk ? 'text-amber-700' : 'text-emerald-700'
                        }`}>
                          {isHighRisk ? '⚠️ High repair ratio. Consider replacement if issue recurs.' : '✅ Normal maintenance threshold.'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            No assets have incurred repair costs yet.
          </div>
        )}
      </div>

      {/* 5. POWER BI DATASET INTEGRATION CARD */}
      <div className="p-6 rounded-3xl bg-slate-900 text-white shadow-lg space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 font-black">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Power BI & Azure SQL Reporting Views</h3>
            <p className="text-xs text-slate-300">Ready-made SQL Views for enterprise business intelligence reports</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          WarrantyWise exposes pre-aggregated SQL views (<code className="text-amber-300">vw_ProductWarrantyRepairSummary</code> and <code className="text-amber-300">vw_CategoryExpenditureAnalytics</code>) that connect natively to Microsoft Power BI Desktop via Azure SQL Database connector.
        </p>

        <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1.5 font-mono text-slate-200">
          <p className="text-amber-400 font-bold">-- Sample Power BI Import Query:</p>
          <p>SELECT * FROM dbo.vw_ProductWarrantyRepairSummary;</p>
          <p>SELECT * FROM dbo.vw_CategoryExpenditureAnalytics;</p>
        </div>
      </div>
    </div>
  );
}

