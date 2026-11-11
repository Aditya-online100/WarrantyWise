import React, { useState } from 'react';
import { X, Wrench, Calendar, DollarSign, Building2 } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../common/Toast';

export function LogRepairModal({ isOpen, onClose, productId, productName, onRepairLogged, initialData = null }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    repair_date: initialData?.repair_date || new Date().toISOString().split('T')[0],
    service_center: initialData?.service_center || '',
    issue_description: initialData?.issue_description || '',
    cost: initialData?.cost !== undefined && initialData?.cost !== null ? initialData.cost : '',
    status: initialData?.status || 'Completed',
    technician_notes: initialData?.technician_notes || '',
    completion_date: initialData?.completion_date || ''
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_center.trim() || !formData.issue_description.trim() || !formData.repair_date) {
      toast.error('Please complete all required fields.');
      return;
    }

    const normalizedCost =
      formData.cost === '' || formData.cost === null || formData.cost === undefined || String(formData.cost).trim() === ''
        ? 0
        : Number(formData.cost);

    if (!Number.isFinite(normalizedCost) || normalizedCost < 0) {
      toast.error('Repair cost must be a non-negative number.');
      return;
    }

    const payload = {
      ...formData,
      cost: normalizedCost
    };

    setLoading(true);
    try {
      if (initialData?.id) {
        await api.put(`/repairs/${initialData.id}`, payload);
        toast.success('Repair record updated successfully.');
      } else {
        await api.post('/repairs', {
          product_id: productId,
          ...payload
        });
        toast.success('Repair service record logged.');
      }
      onRepairLogged();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save repair record.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {initialData ? 'Edit Repair Record' : 'Log Repair / Maintenance'}
              </h2>
              <p className="text-xs text-slate-500">Asset: <span className="font-semibold text-slate-700">{productName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Service Center / Technician *
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                name="service_center"
                placeholder="e.g. Official Service Hub, Geek Squad"
                value={formData.service_center}
                onChange={handleChange}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Issue Description *
            </label>
            <textarea
              required
              rows="2"
              name="issue_description"
              placeholder="e.g. Broken screen glass, faulty battery not holding charge"
              value={formData.issue_description}
              onChange={handleChange}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Repair Date *
              </label>
              <input
                type="date"
                required
                name="repair_date"
                value={formData.repair_date}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cost ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                name="cost"
                placeholder="0.00 (or 0 if under warranty)"
                value={formData.cost}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Repair Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              >
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending Diagnostic</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Completion Date
              </label>
              <input
                type="date"
                name="completion_date"
                value={formData.completion_date}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Technician Notes / Work Order #
            </label>
            <input
              type="text"
              name="technician_notes"
              placeholder="e.g. Work order #WO-9912. Replaced motor coil."
              value={formData.technician_notes}
              onChange={handleChange}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (initialData ? 'Save Changes' : 'Log Repair')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

