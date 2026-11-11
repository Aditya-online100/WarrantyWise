import React, { useState, useEffect } from 'react';
import { X, Sparkles, Shield, Tag, Calendar, DollarSign, FileText } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../common/Toast';

export function AddProductModal({ isOpen, onClose, onProductCreated, initialData = null }) {
  const toast = useToast();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category_id: '',
    model_number: '',
    serial_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_price: '',
    currency: 'USD',
    retailer: '',
    notes: '',
    // Warranty Details
    provider_name: '',
    policy_number: '',
    warranty_type: 'Manufacturer',
    duration_months: 12,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    coverage_details: '',
    support_contact: ''
  });

  // Calculate default end date based on duration
  useEffect(() => {
    if (formData.start_date && formData.duration_months) {
      const d = new Date(formData.start_date);
      d.setMonth(d.getMonth() + parseInt(formData.duration_months, 10));
      setFormData(prev => ({ ...prev, end_date: d.toISOString().split('T')[0] }));
    }
  }, [formData.start_date, formData.duration_months]);

  useEffect(() => {
    if (isOpen) {
      // Fetch categories
      api.get('/categories')
        .then(res => {
          if (res.success && res.data) {
            setCategories(res.data);
            if (!formData.category_id && res.data.length > 0) {
              setFormData(prev => ({ ...prev, category_id: res.data[0].id }));
            }
          }
        })
        .catch(err => console.error('Error fetching categories:', err));

      if (initialData) {
        setFormData({
          name: initialData.name || '',
          brand: initialData.brand || '',
          category_id: initialData.category_id || '',
          model_number: initialData.model_number || '',
          serial_number: initialData.serial_number || '',
          purchase_date: initialData.purchase_date || '',
          purchase_price:
            initialData.purchase_price !== undefined && initialData.purchase_price !== null
              ? initialData.purchase_price
              : '',
          currency: initialData.currency || 'USD',
          retailer: initialData.retailer || '',
          notes: initialData.notes || '',
          provider_name: initialData.warranty?.provider_name || initialData.warranty_provider || '',
          policy_number: initialData.warranty?.policy_number || initialData.policy_number || '',
          warranty_type: initialData.warranty?.warranty_type || initialData.warranty_type || 'Manufacturer',
          duration_months: initialData.warranty?.duration_months || initialData.duration_months || 12,
          start_date: initialData.warranty?.start_date || initialData.warranty_start || initialData.purchase_date,
          end_date: initialData.warranty?.end_date || initialData.warranty_end || '',
          coverage_details: initialData.warranty?.coverage_details || '',
          support_contact: initialData.warranty?.support_contact || ''
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.brand.trim() || !formData.purchase_date) {
      toast.error('Please fill in all required fields (Product Name, Brand, Purchase Date).');
      return;
    }

    const normalizedPrice =
      formData.purchase_price === '' ||
      formData.purchase_price === null ||
      formData.purchase_price === undefined ||
      String(formData.purchase_price).trim() === ''
        ? 0
        : Number(formData.purchase_price);

    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      toast.error('Purchase price must be a valid non-negative number.');
      return;
    }

    const payload = {
      ...formData,
      purchase_price: normalizedPrice
    };

    setLoading(true);
    try {
      if (initialData?.id) {
        await api.put(`/products/${initialData.id}`, payload);
        toast.success(`Product "${formData.name}" updated successfully.`);
      } else {
        await api.post('/products', payload);
        toast.success(`Product "${formData.name}" registered with warranty.`);
      }
      onProductCreated();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save product.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {initialData ? 'Edit Product & Warranty' : 'Register New Product'}
              </h2>
              <p className="text-xs text-slate-500">Record asset specifications, purchase details, and warranty terms</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECTION 1: Product Information */}
          <div>
            <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <Tag className="w-3.5 h-3.5" />
              Product Details
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. MacBook Pro 16'' M3 Max"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Brand / Manufacturer *
                </label>
                <input
                  type="text"
                  name="brand"
                  required
                  placeholder="e.g. Apple, Sony, Samsung"
                  value={formData.brand}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category *
                </label>
                <select
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Number
                </label>
                <input
                  type="text"
                  name="model_number"
                  placeholder="e.g. A2991"
                  value={formData.model_number}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Serial Number
                </label>
                <input
                  type="text"
                  name="serial_number"
                  placeholder="e.g. C02G8990MD6R"
                  value={formData.serial_number}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Retailer / Store
                </label>
                <input
                  type="text"
                  name="retailer"
                  placeholder="e.g. Best Buy, Amazon, Apple Store"
                  value={formData.retailer}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Purchase Date *
                </label>
                <input
                  type="date"
                  name="purchase_date"
                  required
                  value={formData.purchase_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Purchase Price ($ USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="purchase_price"
                  placeholder="0.00"
                  value={formData.purchase_price}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Warranty Information */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-emerald-700">
              <Shield className="w-3.5 h-3.5" />
              Warranty Coverage Terms
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Warranty Provider / Plan Name
                </label>
                <input
                  type="text"
                  name="provider_name"
                  placeholder="e.g. AppleCare+, Sony Direct Care"
                  value={formData.provider_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Policy / Agreement Number
                </label>
                <input
                  type="text"
                  name="policy_number"
                  placeholder="e.g. AC-992144-X"
                  value={formData.policy_number}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Warranty Type
                </label>
                <select
                  name="warranty_type"
                  value={formData.warranty_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                >
                  <option value="Manufacturer">Manufacturer Standard</option>
                  <option value="Extended">Extended Warranty</option>
                  <option value="Retailer">Retailer Protection Plan</option>
                  <option value="Third-Party">Third-Party Underwriter</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Duration (Months)
                </label>
                <input
                  type="number"
                  name="duration_months"
                  min="1"
                  max="120"
                  value={formData.duration_months}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Coverage Start Date
                </label>
                <input
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expiration Date
                </label>
                <input
                  type="date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Support Contact / URL
                </label>
                <input
                  type="text"
                  name="support_contact"
                  placeholder="e.g. support.apple.com / 1-800-APL-CARE"
                  value={formData.support_contact}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Coverage Notes & Exclusions
                </label>
                <textarea
                  rows="2"
                  name="coverage_details"
                  placeholder="e.g. Covers accidental drops with $29 copay; water damage requires $99 replacement fee."
                  value={formData.coverage_details}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              initialData ? 'Save Changes' : 'Register Product & Warranty'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

