import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { formatCurrency, cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { Download, Search, ChevronDown, ChevronRight, FilterX, FileText, CheckCircle2, AlertCircle, Trash2, RotateCcw, Trash, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { isSuperAdminEmail } from '../lib/utils';
import { logAudit, AuditAction } from '../lib/audit';

interface Invoice {
  id: string;
  beneficiaryName: string;
  invoiceNumber: string;
  concept: string;
  finalTotal: number;
  status: 'PENDING' | 'PAID';
}

interface Check {
  id: string;
  invoiceId: string;
  beneficiaryName: string;
  checkNumber: string;
  concept: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'DELETED';
}

export default function CheckSearch() {
  const { user, profile, originalUser } = useAuth();
  const { settings } = useSettings();
  const { showToast, showConfirm } = useNotification();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

  // SuperAdmin enterprise filter states
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string>('');
  const [enterprises, setEnterprises] = useState<{ id: string; name: string; email?: string }[]>([]);

  const isSuperAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || isSuperAdminEmail(originalUser?.email);

  const defaultEnterpriseId = profile?.role === 'enterprise'
    ? user?.uid
    : (profile?.enterpriseId || user?.uid || '');

  // Input states for debounced search
  const [typedProvider, setTypedProvider] = useState('');
  const [typedInvoice, setTypedInvoice] = useState('');
  const [typedConcept, setTypedConcept] = useState('');
  const [typedCheckNumber, setTypedCheckNumber] = useState('');

  // Trash Bin States
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [trashChecks, setTrashChecks] = useState<Check[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [filters, setFilters] = useState({
    provider: '',
    invoice: '',
    concept: '',
    checkNumber: '',
    exactValue: '',
    status: 'ALL',
    exactDate: '',
  });

  // Debouncing effect for typing inputs (Improvement #4)
  useEffect(() => {
    const handler = setTimeout(() => {
      setFilters(prev => ({
        ...prev,
        provider: typedProvider,
        invoice: typedInvoice,
        concept: typedConcept,
        checkNumber: typedCheckNumber,
      }));
    }, 250);

    return () => {
      clearTimeout(handler);
    };
  }, [typedProvider, typedInvoice, typedConcept, typedCheckNumber]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedEnterpriseId]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadEnterprises();
    }
  }, [isSuperAdmin]);

  const loadEnterprises = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'enterprise'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'Empresa sin nombre',
        email: doc.data().email
      }));
      setEnterprises(list);
    } catch (error) {
      console.error('Error loading enterprises for SuperAdmin search:', error);
    }
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let loadedInvoices: Invoice[] = [];
      let loadedChecks: Check[] = [];

      if (isSuperAdmin) {
        // SuperAdmin fetches all documents and applies optional enterpriseId filter
        const [invoicesAll, checksAll] = await Promise.all([
          getDocs(collection(db, 'invoices')),
          getDocs(collection(db, 'checks'))
        ]);
        
        loadedInvoices = invoicesAll.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        loadedChecks = checksAll.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Check))
          .filter(c => (c as any).status !== 'DELETED');
          
        if (selectedEnterpriseId) {
          loadedInvoices = loadedInvoices.filter((inv: any) => inv.enterpriseId === selectedEnterpriseId);
          loadedChecks = loadedChecks.filter((c: any) => c.enterpriseId === selectedEnterpriseId);
        }
      } else {
        // Regular user/employee: strictly limited to defaultEnterpriseId
        const invoicesQuery = query(collection(db, 'invoices'), where('enterpriseId', '==', defaultEnterpriseId));
        const checksQuery = query(collection(db, 'checks'), where('enterpriseId', '==', defaultEnterpriseId));

        const [invoicesRes, checksRes] = await Promise.all([
          getDocs(invoicesQuery),
          getDocs(checksQuery)
        ]);

        loadedInvoices = invoicesRes.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        loadedChecks = checksRes.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Check))
          .filter(c => (c as any).status !== 'DELETED');
      }

      loadedInvoices.forEach(inv => {
        const invChecks = loadedChecks.filter(c => c.invoiceId === inv.id);
        const allPaid = invChecks.length > 0 && invChecks.every(c => c.status === 'PAID');
        inv.status = allPaid ? 'PAID' : 'PENDING';
      });

      setInvoices(loadedInvoices);
      setChecks(loadedChecks);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'invoices_checks');
    } finally {
      setLoading(false);
    }
  };

  const loadTrashChecks = async () => {
    if (!user) return;
    setTrashLoading(true);
    try {
      if (isSuperAdmin) {
        const snap = await getDocs(collection(db, 'checks'));
        let list = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Check))
          .filter(c => c.status === 'DELETED');
          
        if (selectedEnterpriseId) {
          list = list.filter((c: any) => c.enterpriseId === selectedEnterpriseId);
        }
        setTrashChecks(list);
      } else {
        const q = query(
          collection(db, 'checks'),
          where('enterpriseId', '==', defaultEnterpriseId),
          where('status', '==', 'DELETED')
        );
        const snap = await getDocs(q);
        setTrashChecks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Check)));
      }
    } catch (e) {
      console.error("Error loading trash:", e);
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    if (isTrashOpen) {
      loadTrashChecks();
    }
  }, [isTrashOpen, selectedEnterpriseId]);

  const filteredData = useMemo(() => {
    let filteredChecks = checks;

    if (filters.provider) {
      const term = filters.provider.toLowerCase();
      filteredChecks = filteredChecks.filter(c => c.beneficiaryName.toLowerCase().includes(term));
    }
    if (filters.concept) {
      const term = filters.concept.toLowerCase();
      filteredChecks = filteredChecks.filter(c => c.concept.toLowerCase().includes(term));
    }
    if (filters.checkNumber) {
      const term = filters.checkNumber.toLowerCase();
      filteredChecks = filteredChecks.filter(c => c.checkNumber.toLowerCase().includes(term));
    }
    if (filters.exactValue) {
      const val = parseFloat(filters.exactValue);
      if (!isNaN(val)) {
        filteredChecks = filteredChecks.filter(c => c.amount === val);
      }
    }
    if (filters.status !== 'ALL') {
      filteredChecks = filteredChecks.filter(c => c.status === filters.status);
    }
    if (filters.exactDate) {
      filteredChecks = filteredChecks.filter(c => c.dueDate === filters.exactDate);
    }

    const validInvoiceIds = new Set(filteredChecks.map(c => c.invoiceId));
    let filteredInvoices = invoices.filter(inv => validInvoiceIds.has(inv.id));

    if (filters.invoice) {
      const term = filters.invoice.toLowerCase();
      filteredInvoices = filteredInvoices.filter(inv => (inv.invoiceNumber || '').toLowerCase().includes(term));
      const finalInvoiceIds = new Set(filteredInvoices.map(inv => inv.id));
      filteredChecks = filteredChecks.filter(c => finalInvoiceIds.has(c.invoiceId));
    }

    return { invoices: filteredInvoices, checks: filteredChecks };
  }, [checks, invoices, filters]);

  const totals = useMemo(() => {
    const total = filteredData.checks.reduce((acc, c) => acc + c.amount, 0);
    const paid = filteredData.checks.filter(c => c.status === 'PAID').reduce((acc, c) => acc + c.amount, 0);
    const pending = total - paid;
    return { total, paid, pending };
  }, [filteredData.checks]);

  const toggleInvoice = (id: string) => {
    const newSet = new Set(expandedInvoices);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedInvoices(newSet);
  };

  const clearFilters = () => {
    // Clear typed inputs directly too
    setTypedProvider('');
    setTypedInvoice('');
    setTypedConcept('');
    setTypedCheckNumber('');
    setFilters({
      provider: '',
      invoice: '',
      concept: '',
      checkNumber: '',
      exactValue: '',
      status: 'ALL',
      exactDate: '',
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Explorador de Pagos</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Busca, filtra y exporta el historial completo de cheques y facturas.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsTrashOpen(true)}
            className="flex items-center px-5 py-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-2xl transition-all text-sm font-black border border-neutral-200 dark:border-neutral-700"
          >
            <Trash className="w-5 h-5 mr-2 text-indigo-505" />
            Papelera Reciclaje
          </button>
        </div>
      </header>

      {/* Totals Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Total Histórico</p>
          </div>
          <p className="text-3xl font-black text-neutral-900 dark:text-neutral-50">{formatCurrency(totals.total, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Monto Pagado</p>
          </div>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.paid, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Saldo Pendiente</p>
          </div>
          <p className="text-3xl font-black text-amber-600 dark:text-amber-400">{formatCurrency(totals.pending, settings.currency)}</p>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
        {isSuperAdmin && (
          <div className="mb-8 p-4 bg-amber-50/40 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-600">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-900 dark:text-amber-100 uppercase tracking-wider">Filtro de Empresa (SuperAdmin)</h4>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">Verifique el flujo de egresos filtrando por empresa matriz.</p>
              </div>
            </div>
            <select
              value={selectedEnterpriseId}
              onChange={(e) => setSelectedEnterpriseId(e.target.value)}
              className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-amber-500 font-bold dark:text-neutral-100 min-w-[240px]"
            >
              <option value="">-- Ver todas las empresas --</option>
              {enterprises.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.name} ({ent.email})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-3">
            <Search className="w-6 h-6 text-indigo-500" /> Parámetros de Búsqueda
          </h2>
          <button 
            onClick={clearFilters} 
            className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors uppercase tracking-widest flex items-center gap-2"
          >
            <FilterX className="w-4 h-4" /> Limpiar Todo
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Beneficiario</label>
            <input
              type="text"
              value={typedProvider}
              onChange={(e) => setTypedProvider(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
              placeholder="Ej: Constructora ABC"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Número de Factura</label>
            <input
              type="text"
              value={typedInvoice}
              onChange={(e) => setTypedInvoice(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
              placeholder="001-..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Concepto</label>
            <input
              type="text"
              value={typedConcept}
              onChange={(e) => setTypedConcept(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
              placeholder="Ej: Mantenimiento"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Número de Cheque</label>
            <input
              type="text"
              value={typedCheckNumber}
              onChange={(e) => setTypedCheckNumber(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-300"
              placeholder="Ej: 1004"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Monto Exacto</label>
            <input
              type="number"
              step="0.01"
              value={filters.exactValue}
              onChange={(e) => setFilters({...filters, exactValue: e.target.value})}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold placeholder:text-neutral-300"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Estado de Pago</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 outline-none"
            >
              <option value="ALL">Histórico Completo</option>
              <option value="PENDING">Pendientes de Cobro</option>
              <option value="PAID">Transacciones Pagadas</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Fecha de Vencimiento</label>
            <input
              type="date"
              value={filters.exactDate}
              onChange={(e) => setFilters({...filters, exactDate: e.target.value})}
              className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">Cargando transacciones...</p>
          </div>
        ) : filteredData.invoices.length === 0 ? (
          <div className="p-20 text-center space-y-4">
            <Search className="w-12 h-12 text-neutral-200 dark:text-neutral-800 mx-auto" />
            <p className="text-neutral-400 font-medium">No se encontraron registros que coincidan con los filtros.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
            <div className="bg-neutral-50/50 dark:bg-neutral-950/40 px-8 py-4 grid grid-cols-12 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">
              <div className="col-span-1"></div>
              <div className="col-span-4">Información del Beneficiario</div>
              <div className="col-span-3 text-right">Detalle de Facturación</div>
              <div className="col-span-2 text-right">Monto Acumulado</div>
              <div className="col-span-2 text-center">Estado</div>
            </div>
                        {(() => {
              const totalPages = Math.ceil(filteredData.invoices.length / ITEMS_PER_PAGE);
              const paginatedInvoices = filteredData.invoices.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
              
              return (
                <>
                  {paginatedInvoices.map(invoice => {
              const isExpanded = expandedInvoices.has(invoice.id);
              const invoiceChecks = filteredData.checks.filter(c => c.invoiceId === invoice.id)
                .sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
              
              const invoiceTotal = invoiceChecks.reduce((acc, c) => acc + c.amount, 0);

              return (
                <div key={invoice.id} className="group transition-colors">
                  {/* Invoice Header */}
                  <div 
                    className="px-8 py-6 grid grid-cols-12 items-center cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-all"
                    onClick={() => toggleInvoice(invoice.id)}
                  >
                    <div className="col-span-1">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                        isExpanded ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                      )}>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                    <div className="col-span-4 translate-x-[-10px]">
                      <h3 className="font-bold text-neutral-900 dark:text-neutral-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{invoice.beneficiaryName}</h3>
                      <p className="text-xs text-neutral-400 font-medium truncate mt-0.5">{invoice.concept}</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">#{invoice.invoiceNumber || 'S/N'}</p>
                      <p className="text-[10px] text-neutral-400 font-medium">{invoiceChecks.length} Cheques asociados</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="font-black text-neutral-900 dark:text-neutral-50">{formatCurrency(invoiceTotal, settings.currency)}</p>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest",
                        invoice.status === 'PAID' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                      )}>
                        {invoice.status === 'PAID' ? 'Liquidado' : 'Proceso'}
                      </span>
                    </div>
                  </div>

                  {/* Checks List */}
                  {isExpanded && (
                    <div className="bg-neutral-50/50 dark:bg-neutral-950/30 px-8 py-8 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
                        <table className="min-w-full">
                          <thead className="bg-neutral-50 dark:bg-neutral-800/50">
                            <tr>
                              <th className="px-6 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">F. Vencimiento</th>
                              <th className="px-6 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Identificador</th>
                              <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Monto Cuota</th>
                              <th className="px-6 py-4 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Disponibilidad</th>
                              <th className="px-6 py-4 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                            {invoiceChecks.map(check => (
                              <tr key={check.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/20 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-neutral-900 dark:text-neutral-100">
                                  {format(parseISO(check.dueDate), 'dd / MM / yyyy')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-400 font-mono">
                                  {check.checkNumber}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-neutral-900 dark:text-neutral-100 text-right">
                                  {formatCurrency(check.amount, settings.currency)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <span className={cn(
                                    "px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider",
                                    check.status === 'PAID' ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                  )}>
                                    {check.status === 'PAID' ? 'Cobrado' : 'Pendiente'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  {check.status !== 'PAID' && (
                                    <button
                                      onClick={async () => {
                                        if (!(await showConfirm('Mover a Papelera', `¿Estás seguro de enviar el cheque #${check.checkNumber} a la papelera?`, { type: 'danger' }))) return;
                                        try {
                                          await updateDoc(doc(db, 'checks', check.id), { status: 'DELETED' });
                                          setChecks(prev => prev.filter(c => c.id !== check.id));
                                          loadData();
                                          import('../lib/audit').then(({ logAudit, AuditAction }) => {
                                            logAudit(AuditAction.CHECK_DELETE, `Cheque ${check.checkNumber} de ${check.beneficiaryName} enviado a papelera por el usuario`, check.id);
                                          });
                                          showToast("Enviado a papelera exitosamente", "success");
                                        } catch (e) {
                                          showToast("Error al enviar a la papelera", "error");
                                        }
                                      }}
                                      className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/35 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl transition-colors border border-red-200 dark:border-red-800 inline-flex items-center justify-center"
                                      title="Enviar a papelera"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
                <p className="text-sm text-neutral-500">
                  Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.invoices.length)} de {filteredData.invoices.length} registros
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl disabled:opacity-50 hover:bg-neutral-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl disabled:opacity-50 hover:bg-neutral-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
            </>
            );
          })()}
        </div>
        )}
      </div>

      {/* Recycle Bin Modal (Improvement #3) */}
      {isTrashOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-4xl w-full border border-neutral-100 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-950/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-neutral-50">Papelera de Reciclaje</h3>
                  <p className="text-xs text-neutral-400">Cheques eliminados temporariamente. Recupera o elimina permanentemente.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {trashChecks.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!(await showConfirm("Vaciar Papelera", "¿De verdad quieres vaciar toda la papelera permanentemente? Esta acción es irreversible.", { type: "danger" }))) return;
                      try {
                        for (const check of trashChecks) {
                          await deleteDoc(doc(db, 'checks', check.id));
                        }
                        setTrashChecks([]);
                        showToast("Papelera vaciada correctamente", "success");
                      } catch (e) {
                        showToast("Error al vaciar papelera", "error");
                      }
                    }}
                    className="flex items-center px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl transition-colors border border-red-200 dark:border-red-800"
                  >
                    <Trash className="w-3.5 h-3.5 mr-1.5" />
                    Vaciar Papelera
                  </button>
                )}
                <button
                  onClick={() => setIsTrashOpen(false)}
                  className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-400 dark:text-neutral-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="p-6 overflow-y-auto flex-1">
              {trashLoading ? (
                <div className="py-20 text-center space-y-3">
                  <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                  <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">Cargando borrados...</p>
                </div>
              ) : trashChecks.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 dark:text-emerald-500 mx-auto" />
                  <p className="text-neutral-500 font-bold">¡Tu papelera está vacía!</p>
                  <p className="text-neutral-400 text-xs">No tienes registros eliminados recientemente.</p>
                </div>
              ) : (
                <div className="border border-neutral-100 dark:border-neutral-800 rounded-2xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-neutral-50 dark:bg-neutral-800/40 text-left">
                      <tr>
                        <th className="px-6 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-wider">Beneficiario/Firma</th>
                        <th className="px-6 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-wider">Detalle Cheque</th>
                        <th className="px-6 py-3.5 text-right text-[10px] font-black text-neutral-400 uppercase tracking-wider">Monto</th>
                        <th className="px-6 py-3.5 text-center text-[10px] font-black text-neutral-400 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                      {trashChecks.map(check => (
                        <tr key={check.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors text-sm">
                          <td className="px-6 py-4">
                            <span className="font-bold text-neutral-900 dark:text-neutral-100 tracking-tight uppercase block">{check.beneficiaryName}</span>
                            <span className="text-xs text-neutral-400 leading-none">{check.concept}</span>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-neutral-500 dark:text-neutral-400">
                            #{check.checkNumber}
                            <span className="text-[10px] block font-sans font-medium text-neutral-400 mt-0.5">Vence: {format(parseISO(check.dueDate), 'dd/MM/yyyy')}</span>
                          </td>
                          <td className="px-6 py-4 font-black text-neutral-900 dark:text-neutral-100 text-right">
                            {formatCurrency(check.amount, settings.currency)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'checks', check.id), { status: 'PENDING' });
                                    setTrashChecks(prev => prev.filter(c => c.id !== check.id));
                                    loadData();
                                    import('../lib/audit').then(({ logAudit, AuditAction }) => {
                                      logAudit(AuditAction.SETTINGS_UPDATE, `Restaurado cheque ${check.checkNumber} de ${check.beneficiaryName} desde papelera`, check.id);
                                    });
                                    showToast("Cheque restaurado correctamente", "success");
                                  } catch (error) {
                                    showToast("Error al restaurar", "error");
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restaurar
                              </button>
                              <button
                                onClick={async () => {
                                  if (!(await showConfirm("Borrar Definitivamente", "¿Está seguro de borrar definitivamente este cheque? Esta acción es permanente.", { type: "danger" }))) return;
                                  try {
                                    await deleteDoc(doc(db, 'checks', check.id));
                                    setTrashChecks(prev => prev.filter(c => c.id !== check.id));
                                    import('../lib/audit').then(({ logAudit, AuditAction }) => {
                                      logAudit(AuditAction.SETTINGS_UPDATE, `Eliminado permanentemente cheque ${check.checkNumber} de ${check.beneficiaryName}`, check.id);
                                    });
                                    showToast("Cheque eliminado permanentemente", "success");
                                  } catch (e) {
                                    showToast("Error al eliminar permanentemente", "error");
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 hover:bg-red-50 dark:bg-neutral-850 dark:hover:bg-red-950/30 text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400 text-xs font-bold rounded-lg transition-colors border border-neutral-200 dark:border-neutral-800/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Borrar Definitivo
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
