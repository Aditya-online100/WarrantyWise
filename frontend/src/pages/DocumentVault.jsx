import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  Search, 
  ExternalLink, 
  FileCheck, 
  HardDrive,
  FileSpreadsheet,
  FileImage,
  Layers
} from 'lucide-react';
import { api } from '../api';
import { UploadDocumentModal } from '../components/modals/UploadDocumentModal';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { useToast } from '../components/common/Toast';

export function DocumentVault({ onSelectProduct }) {
  const toast = useToast();
  const [documents, setDocuments] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      let query = [];
      if (docTypeFilter) query.push(`document_type=${encodeURIComponent(docTypeFilter)}`);
      const url = `/documents${query.length > 0 ? `?${query.join('&')}` : ''}`;

      const [docsRes, prodsRes] = await Promise.all([
        api.get(url),
        api.get('/products')
      ]);

      if (docsRes.success && docsRes.data) {
        setDocuments(docsRes.data);
      }
      if (prodsRes.success && prodsRes.data) {
        setProducts(prodsRes.data);
      }
    } catch (err) {
      toast.error('Failed to load document vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [docTypeFilter]);

  const handleDownload = async (doc) => {
    try {
      toast.info(`Preparing secure download for "${doc.original_name}"...`);
      await api.downloadDocument(doc.id, doc.original_name);
    } catch (err) {
      toast.error('Failed to download document.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteDocId) return;
    setDeleting(true);
    try {
      await api.delete(`/documents/${deleteDocId}`);
      toast.success('Document deleted successfully.');
      setDeleteDocId(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete document.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredDocs = documents.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.original_name.toLowerCase().includes(q) ||
      d.product_name.toLowerCase().includes(q) ||
      d.document_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* 1. TOP BANNER */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">Encrypted Cloud Storage</span>
          <h2 className="text-2xl font-black tracking-tight mt-0.5">Digital Document & Invoice Vault</h2>
          <p className="text-xs text-slate-300 mt-1">Archived in Azure Blob Storage with authenticated download access</p>
        </div>

        <button
          onClick={() => {
            if (products.length === 0) {
              toast.error('Please register a product before uploading documents.');
              return;
            }
            setIsUploadOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all flex-shrink-0"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* 2. CONTROLS BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by file name or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 focus:bg-white text-slate-800 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
            />
          </div>

          {/* Classification Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto text-xs font-semibold">
            {[
              { id: '', label: 'All Documents' },
              { id: 'Invoice', label: 'Invoices' },
              { id: 'Warranty Card', label: 'Warranty Cards' },
              { id: 'Repair Receipt', label: 'Repair Receipts' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setDocTypeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  docTypeFilter === tab.id
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

      {/* 3. DOCUMENTS GRID */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Loading document vault...</p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No documents in vault</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">Upload purchase invoices or warranty cards to preserve proof of purchase.</p>
          {products.length > 0 && (
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs"
            >
              Upload Document
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map(d => (
            <div
              key={d.id}
              className="bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-300 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {d.document_type}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {(d.file_size / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors flex-shrink-0">
                    {d.mime_type?.includes('pdf') ? (
                      <FileText className="w-5 h-5 text-rose-500" />
                    ) : (
                      <FileImage className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 truncate" title={d.original_name}>
                      {d.original_name}
                    </h4>
                    <p 
                      onClick={() => onSelectProduct(d.product_id)}
                      className="text-[11px] text-indigo-600 hover:underline cursor-pointer font-medium mt-0.5 truncate"
                    >
                      {d.product_name}
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Storage: <span className="font-semibold text-slate-700">{d.storage_type}</span></span>
                  <span>{d.upload_date?.substring(0, 10)}</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleDownload(d)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>

                <button
                  onClick={() => setDeleteDocId(d.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Delete Document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Document Modal */}
      {isUploadOpen && (
        <UploadDocumentModal
          isOpen={isUploadOpen}
          products={products}
          onDocumentUploaded={loadData}
          onClose={() => setIsUploadOpen(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(deleteDocId)}
        title="Delete Document?"
        message="This document will be permanently deleted from cloud storage. Are you sure you wish to proceed?"
        confirmText="Delete Document"
        isLoading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteDocId(null)}
      />
    </div>
  );
}

