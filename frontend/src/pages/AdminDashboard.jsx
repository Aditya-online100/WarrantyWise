import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Users, 
  Package, 
  ShieldCheck, 
  Wrench, 
  FileText, 
  Activity, 
  Database,
  UserCheck,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/common/Toast';

export function AdminDashboard() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleUpdatingId, setRoleUpdatingId] = useState(null);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes, logsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/activity-logs?limit=30')
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (usersRes.success) setUsers(usersRes.data);
      if (logsRes.success) setActivityLogs(logsRes.data);
    } catch (err) {
      toast.error('Failed to load administrative console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleRoleToggle = async (userId, currentRole) => {
    const newRole = currentRole === 'Admin' ? 'User' : 'Admin';
    setRoleUpdatingId(userId);
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      toast.success(`User #${userId} role changed to ${newRole}.`);
      loadAdminData();
    } catch (err) {
      toast.error(err.message || 'Failed to update user role.');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">Loading system management metrics...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* 1. ADMIN HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
            RBAC Protected Tier
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            System Administration Center
          </h2>
          <p className="text-xs text-slate-500">Platform telemetry, user access control, and security audit logs</p>
        </div>

        <button
          onClick={loadAdminData}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Metrics
        </button>
      </div>

      {/* 2. PLATFORM-WIDE TELEMETRY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Users</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{stats?.total_users || 0}</span>
          <span className="text-[10px] text-slate-500">Accounts</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Products</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{stats?.total_products || 0}</span>
          <span className="text-[10px] text-slate-500">System items</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Warranties</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats?.total_warranties || 0}</span>
          <span className="text-[10px] text-slate-500">Registered</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Repairs</span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">{stats?.total_repairs || 0}</span>
          <span className="text-[10px] text-slate-500">Service logs</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Repair Spend</span>
          <span className="text-2xl font-black text-indigo-700 mt-1 block">
            ${parseFloat(stats?.total_repair_spend || 0).toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-500">Platform-wide</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active DB Engine</span>
          <span className="text-xs font-black text-emerald-700 mt-2 block truncate">
            {stats?.database_engine || 'Azure SQL'}
          </span>
          <span className="text-[10px] text-slate-500">Dual-Mode Adapter</span>
        </div>
      </div>

      {/* 3. USER MANAGEMENT TABLE */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            Registered User Directory & RBAC Roles
          </h3>
          <p className="text-xs text-slate-500">Manage user access tiers and platform permissions</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Current Role</th>
                <th className="py-3 px-4">Products Owned</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4 text-right">RBAC Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase">
                        {u.full_name?.charAt(0) || 'U'}
                      </div>
                      <span>{u.full_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-medium">{u.email}</td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      u.role === 'Admin' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{u.total_products} item(s)</td>
                  <td className="py-3.5 px-4 text-slate-500">{u.created_at?.substring(0, 10)}</td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleRoleToggle(u.id, u.role)}
                      disabled={roleUpdatingId === u.id}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        u.role === 'Admin'
                          ? 'text-amber-700 hover:bg-amber-50 border border-amber-200'
                          : 'text-indigo-600 hover:bg-indigo-50 border border-indigo-200'
                      }`}
                    >
                      {roleUpdatingId === u.id 
                        ? 'Updating...' 
                        : (u.role === 'Admin' ? 'Demote to User' : 'Promote to Admin')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. ACTIVITY AUDIT TRAIL */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            Security & System Audit Trail (`ActivityLogs`)
          </h3>
          <p className="text-xs text-slate-500">Real-time log of security events, CRUD transactions, and logins</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">
              <tr>
                <th className="py-3 px-3">Timestamp (UTC)</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Target Entity</th>
                <th className="py-3 px-3">Triggered By</th>
                <th className="py-3 px-3">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {activityLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{log.created_at}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{log.entity_type} {log.entity_id && `#${log.entity_id}`}</td>
                  <td className="py-2.5 px-3 text-slate-800 font-sans font-semibold">{log.user_name || 'System'}</td>
                  <td className="py-2.5 px-3 text-slate-600 font-sans max-w-md truncate" title={log.details}>
                    {log.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

