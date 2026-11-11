import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Package, 
  ShieldCheck, 
  Wrench, 
  FileText, 
  Download, 
  Trash2, 
  Edit3, 
  Plus, 
  ExternalLink, 
  Calendar, 
  DollarSign, 
  Clock, 
  Tag, 
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { api } from '../api';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { LogRepairModal } from '../components/modals/LogRepairModal';
import { UploadDocumentModal } from '../components/modals/UploadDocumentModal';
import { useToast } from '../components/common/Toast';

export function ProductDetails({ productId, onBack, onEditProduct }) {
  const toast = useToast();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal Triggers
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  // Delete Confirmations
  const [deleteProductModal, setDeleteProductModal] = useState(false);
  const [deleteRepairId, setDeleteRepairId] = useState(null);
  const [deleteDocId, setDeleteDocId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/products/${productId}`);
      if (res.success && res.data) {
        setProduct(res.data);
      }
    } catch (err) {
      toast.error('Failed to load product details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const handleDeleteProduct = async () => {
    setDeleting(true);
    try {
      await api.delete(`/products/${productId}`);
      toast.success('Product deleted successfully.');
      onBack();
    } catch (err) {
      toast.error(err.message || 'Failed to delete product.');
    } finally {
      setDeleting(false);
      setDeleteProductModal(false);
    }
  };

  const handleDeleteRepair = async () => {
    if (!deleteRepairId) return;
    setDeleting(true);
    try {
      await api.delete(`/repairs/${deleteRepairId}`);
      toast.success('Repair record deleted.');
      setDeleteRepairId(null);
      loadProduct();
    } catch (err) {
      toast.error(err.message || 'Failed to delete repair.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocId) return;
    setDeleting(true);
    try {
      await api.delete(`/documents/${deleteDocId}`);
      toast.success('Document deleted.');
      setDeleteDocId(null);
      loadProduct();
    } catch (err) {
      toast.error(err.message || 'Failed to delete document.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (docId, originalName) => {
    try {
      toast.info(`Downloading "${originalName}"...`);
      await api.downloadDocument(docId, originalName);
    } catch (err) {
      toast.error('Failed to download document.');
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">Retrieving asset data...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-600 mb-4">Product not found.</p>
        <button onClick={onBack} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
          Back to Products
        </button>
      </div>
    );
  }

  const warranty = product.warranty;
  const repairs = product.repairs || [];
  const documents = product.documents || [];

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto animate-fadeIn">
      {/* 1. TOP BAR */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to All Products
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEditProduct(product)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 text-xs font-bold transition-all shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Product
          </button>

          <button
            onClick={() => setDeleteProductModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Asset
          </button>
        </div>
      </div>

      {/* 2. HERO PRODUCT & WARRANTY OVERVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Identity Card */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                {product.category_name}
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5">
                {product.name}
              </h2>
              <p className="text-xs text-slate-500 font-medium">Brand: <span className="text-slate-800 font-bold">{product.brand}</span></p>
            </div>
            {warranty && <StatusBadge status={warranty.status} />}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Purchase Price</span>
              <span className="text-base font-black text-slate-900">${parseFloat(product.purchase_price).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Purchase Date</span>
              <span className="text-xs font-bold text-slate-800">{product.purchase_date}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Model #</span>
              <span className="text-xs font-bold text-slate-800">{product.model_number || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Serial #</span>
              <span className="text-xs font-bold text-slate-800 font-mono">{product.serial_number || 'N/A'}</span>
            </div>
          </div>

          {/* Retailer & Notes */}
          <div className="space-y-2 text-xs">
            {product.retailer && (
              <p className="text-slate-600">
                <span className="font-bold text-slate-700">Retailer:</span> {product.retailer}
              </p>
            )}
            {product.notes && (
              <div className="p-3 rounded-xl bg-slate-50 text-slate-600 text-xs italic">
                "{product.notes}"
              </div>
            )}
          </div>
        </div>

        {/* Warranty Coverage Status Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Warranty Coverage</h3>
                <p className="text-[11px] text-slate-400">{warranty?.warranty_type || 'Standard'} Warranty</p>
              </div>
            </div>

            {warranty ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Provider</span>
                  <span className="font-bold text-slate-800">{warranty.provider_name}</span>
                </div>

                {warranty.policy_number && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Policy / Contract #</span>
                    <span className="font-mono font-semibold text-slate-700">{warranty.policy_number}</span>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">Expiration Date</span>
                    <span className="font-black text-emerald-900 text-sm">{warranty.end_date}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-emerald-800">
                      {warranty.days_remaining < 0 ? 'Expired' : `${warranty.days_remaining} Days Left`}
                    </span>
                  </div>
                </div>

                {warranty.support_contact && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Support Contact</span>
                    <span className="text-indigo-600 font-semibold">{warranty.support_contact}</span>
                  </div>
                )}

                {warranty.coverage_details && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Coverage Scope</span>
                    <p className="text-[11px] text-slate-600">{warranty.coverage_details}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No warranty policy attached to this product.
              </div>
            )}
          </div>

          {/* Financial summary */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Total Cost of Ownership:</span>
            <span className="font-black text-slate-900 text-sm">
              ${parseFloat(product.total_cost_of_ownership || product.purchase_price).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. REPAIR & SERVICE LEDGER SECTION */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-indigo-600" />
              Repair & Maintenance History
            </h3>
            <p className="text-xs text-slate-500">Service visits, component replacements, and expenses</p>
          </div>

          <button
            onClick={() => {
              setEditingRepair(null);
              setIsRepairModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Repair
          </button>
        </div>

        {repairs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Service Center</th>
                  <th className="py-3 px-3">Issue Description</th>
                  <th className="py-3 px-3">Cost</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repairs.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3 font-semibold text-slate-800">{r.repair_date}</td>
                    <td className="py-3 px-3 text-slate-700">{r.service_center}</td>
                    <td className="py-3 px-3 text-slate-600 max-w-xs">{r.issue_description}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">${parseFloat(r.cost).toFixed(2)}</td>
                    <td className="py-3 px-3">
                      <StatusBadge status={r.status} type="repair" />
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingRepair(r);
                            setIsRepairModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteRepairId(r.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
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
        ) : (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-100">
            No repair records logged for this asset.
          </div>
        )}
      </div>

      {/* 4. ATTACHED DOCUMENTS VAULT SECTION */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              Attached Document Vault
            </h3>
            <p className="text-xs text-slate-500">Invoices, warranty certificates, and service receipts</p>
          </div>

          <button
            onClick={() => setIsDocModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Upload Document
          </button>
        </div>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(d => (
              <div
                key={d.id}
                className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                      {d.document_type}
                    </span>
                    <span className="text-[10px] text-slate-400">{(d.file_size / 1024).toFixed(1)} KB</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 truncate" title={d.original_name}>
                    {d.original_name}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1">Uploaded: {d.upload_date}</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-200/60">
                  <button
                    onClick={() => handleDownload(d.id, d.original_name)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                  <button
                    onClick={() => setDeleteDocId(d.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-100">
            No invoices or receipts attached yet.
          </div>
        )}
      </div>

      {/* MODALS */}
      <LogRepairModal
        isOpen={isRepairModalOpen}
        productId={productId}
        productName={product.name}
        initialData={editingRepair}
        onRepairLogged={loadProduct}
        onClose={() => {
          setIsRepairModalOpen(false);
          setEditingRepair(null);
        }}
      />

      <UploadDocumentModal
        isOpen={isDocModalOpen}
        productId={productId}
        productName={product.name}
        onDocumentUploaded={loadProduct}
        onClose={() => setIsDocModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={deleteProductModal}
        title={`Permanently delete "${product.name}"?`}
        message="This will delete the product, its warranty, and all associated repairs and invoices. This action cannot be undone."
        confirmText="Delete Product"
        isLoading={deleting}
        onConfirm={handleDeleteProduct}
        onClose={() => setDeleteProductModal(false)}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteRepairId)}
        title="Delete Repair Record?"
        message="Are you sure you want to remove this repair record from the maintenance ledger?"
        confirmText="Delete Record"
        isLoading={deleting}
        onConfirm={handleDeleteRepair}
        onClose={() => setDeleteRepairId(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteDocId)}
        title="Delete Document?"
        message="This document file will be deleted from storage and cannot be recovered."
        confirmText="Delete Document"
        isLoading={deleting}
        onConfirm={handleDeleteDocument}
        onClose={() => setDeleteDocId(null)}
      />
    </div>
  );
}

