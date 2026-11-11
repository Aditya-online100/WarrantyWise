import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../common/Toast';

export function UploadDocumentModal({ isOpen, onClose, productId, productName, onDocumentUploaded, products = [] }) {
  const toast = useToast();
  const [selectedProductId, setSelectedProductId] = useState(productId || '');
  const [documentType, setDocumentType] = useState('Invoice');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  React.useEffect(() => {
    if (productId) setSelectedProductId(productId);
    else if (products.length > 0 && !selectedProductId) setSelectedProductId(products[0].id);
  }, [productId, products]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.size > 10 * 1024 * 1024) {
        toast.error('File size exceeds the 10 MB maximum limit.');
        return;
      }
      setFile(selected);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (selected.size > 10 * 1024 * 1024) {
        toast.error('File size exceeds the 10 MB maximum limit.');
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please choose a file to upload.');
      return;
    }
    if (!selectedProductId) {
      toast.error('Please select an associated product.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('product_id', selectedProductId);
      formData.append('document_type', documentType);

      await api.post('/documents/upload', formData);
      toast.success(`Document "${file.name}" uploaded successfully.`);
      onDocumentUploaded();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to upload document.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Upload Document</h2>
              <p className="text-xs text-slate-500">Securely archive invoices and warranties</p>
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
          {/* Associated Product Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Associated Product *
            </label>
            {productName ? (
              <div className="px-3 py-2 text-xs bg-slate-100 text-slate-800 rounded-xl font-medium border border-slate-200">
                {productName}
              </div>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.brand})</option>
                ))}
              </select>
            )}
          </div>

          {/* Document Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Document Classification *
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
            >
              <option value="Invoice">Purchase Invoice / Tax Receipt</option>
              <option value="Warranty Card">Warranty Card / Policy Certificate</option>
              <option value="Repair Receipt">Repair Service Receipt / Work Order</option>
              <option value="User Manual">User Manual / Spec Sheet</option>
              <option value="Other">Other Supporting Document</option>
            </select>
          </div>

          {/* Drag & Drop File Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Choose File (PDF, PNG, JPG, WebP — Max 10MB) *
            </label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50/50'
                  : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="file"
                id="file-upload"
                onChange={handleFileChange}
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                {file ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 truncate max-w-xs mx-auto">{file.name}</p>
                    <p className="text-[10px] text-emerald-600 font-semibold">{(file.size / 1024).toFixed(1)} KB Ready to Upload</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-slate-700">Click to browse or drag & drop</p>
                    <p className="text-[10px] text-slate-400 mt-1">Supported: PDF, JPG, PNG up to 10MB</p>
                  </>
                )}
              </label>
            </div>
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
              disabled={loading || !file}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

