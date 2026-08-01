import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { RETENTIONS, DISCOUNTS } from '../constants';
import { calculateInstallments, formatCurrency, generateCheckNumber } from '../lib/utils';
import { addMonths, format, parse } from 'date-fns';
import { Upload, FileSpreadsheet, X, Calculator, CreditCard, Calendar, User, Tag, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { logAudit, AuditAction } from '../lib/audit';
import { isSuperAdminEmail } from '../lib/utils';

export default function CheckEntry() {
  const { user, profile, originalUser } = useAuth();
  const { settings } = useSettings();
  const { showToast, showAlert } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState<string[]>([]);
  
  const [enterprises, setEnterprises] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string>('');

  const isSuperAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || isSuperAdminEmail(originalUser?.email);

  const [formData, setFormData] = useState({
    beneficiaryName: '',
    invoiceNumber: '',
    initialCheckNumber: '',
    concept: '',
    months: 1,
    firstPaymentDate: format(new Date(), 'yyyy-MM-dd'),
    totalValue: 0,
    discountType: 'none',
    discountValue: 0,
    retentionType: 'none',
    bank: '',
  });

  const [installments, setInstallments] = useState<number[]>([]);
  const [finalTotal, setFinalTotal] = useState(0);

  const currentEnterpriseId = isSuperAdmin
    ? (selectedEnterpriseId || user?.uid || '')
    : (profile?.role === 'enterprise' ? user?.uid : (profile?.enterpriseId || user?.uid || ''));

  useEffect(() => {
    if (user) {
      loadBeneficiaries();
      if (isSuperAdmin) {
        loadEnterprises();
      }
    }
  }, [user, isSuperAdmin, selectedEnterpriseId]);

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
      console.error('Error loading enterprises for SuperAdmin:', error);
    }
  };

  const getEnterpriseIdToSave = () => {
    return currentEnterpriseId;
  };

  const loadBeneficiaries = async () => {
    if (!user) return;
    try {
      const snapshot = await getDocs(collection(db, 'beneficiaries'));
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(item => 
          item.enterpriseId === currentEnterpriseId || 
          item.userId === user.uid || 
          (!item.enterpriseId && !item.userId)
        )
        .map(item => item.name);
      
      setBeneficiaries(Array.from(new Set(list)));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'beneficiaries');
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      
      // Use header: 1 to get array of arrays (A=0, B=1, etc)
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      console.log('Strict Column Data parsed:', data);

      setLoading(true);
      let count = 0;
      try {
        // Skip header if it exists (usually row index 0 is header)
        // We look for the first row that has a numeric value in column F (index 5) 
        // or just skip row 0 assuming it's a title.
        const rows = data.slice(1); 

        for (const row of rows) {
          if (!row || row.length < 2) continue;

          // COLUMN PROTOCOL V2.1.6
          // A: EMPRESA O BENEFICIARIO (0)
          // B: # FACTURA (1)
          // C: CONCEPTO (2)
          // D: # CHEQUE (3)
          // E: FECHA DE PAGO (4)
          // F: VALOR A CANCELAR (5)

          let beneficiary = String(row[0] || 'Desconocido').trim();
          let invoiceNum = String(row[1] || '').trim();
          let concept = String(row[2] || 'Importado').trim();
          let checkNum = String(row[3] || '').trim();
          const rawDate = row[4];
          const totalRaw = row[5];
          
          // Strict number parsing to avoid calculation errors
          const total = parseFloat(String(totalRaw).replace(/[^0-9.-]+/g,"")) || 0;
          
          if (total <= 0) {
            console.warn('Skipping row due to invalid total:', row);
            continue;
          }

          let formattedDate = format(new Date(), 'yyyy-MM-dd');
          if (rawDate) {
            try {
              if (typeof rawDate === 'number') {
                // Excel date serial
                const date = new Date((rawDate - (25567 + 1)) * 86400 * 1000);
                formattedDate = format(date, 'yyyy-MM-dd');
              } else if (typeof rawDate === 'string') {
                // Try parsing common formats
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate.getTime())) {
                  formattedDate = format(parsedDate, 'yyyy-MM-dd');
                }
              }
            } catch (e) {
              console.error('Date parsing error:', e);
            }
          }

          // Invoices from Excel are treated as single-check payments by default 
          // unless user format specifies months, but per prompt we follow the A-F structure.
          const months = 1; 

          let invRef;
          try {
            invRef = await addDoc(collection(db, 'invoices'), {
              userId: user!.uid,
              enterpriseId: getEnterpriseIdToSave(),
              beneficiaryName: beneficiary,
              invoiceNumber: invoiceNum,
              concept: concept,
              totalValue: total,
              discountType: 'none',
              discountValue: 0,
              retentionType: 'none',
              retentionPercentage: 0,
              finalTotal: total,
              months,
              firstPaymentDate: formattedDate,
              createdAt: serverTimestamp()
            });

            await addDoc(collection(db, 'checks'), {
              userId: user!.uid,
              enterpriseId: getEnterpriseIdToSave(),
              invoiceId: invRef.id,
              beneficiaryName: beneficiary,
              checkNumber: checkNum,
              concept: concept,
              amount: total,
              dueDate: formattedDate,
              status: 'PENDING',
              bank: '',
              createdAt: serverTimestamp()
            });

            count++;
          } catch (error) {
            console.error('Error creating import docs:', error);
            handleFirestoreError(error, OperationType.CREATE, 'import_batch');
          }
        }
        showAlert('Importación Exitosa', `Se procesaron ${count} registros correctamente desde el archivo de protocolo Excel.`, 'success');
        logAudit(AuditAction.CHECK_CREATE, `Importados ${count} registros mediante protocolo Excel`);
        loadBeneficiaries();
      } catch (err) {
        console.error(err);
        showAlert('Error de Importación', 'Ocurrió un error crítico durante la lectura del protocolo Excel.', 'error');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  useEffect(() => {
    let total = formData.totalValue;
    
    // Step 1: Apply Discounts
    if (formData.discountType === 'percentage') {
      total -= total * (formData.discountValue / 100);
    } else if (formData.discountType === 'fixed') {
      total -= formData.discountValue;
    }

    const baseAmount = total;
    const ivaDivisor = 1 + (settings.iva / 100);

    // Step 2: Apply Retentions
    if (formData.retentionType === 'retencion_sin_iva') {
      const retFuente = Math.round((baseAmount / ivaDivisor) * 0.0175 * 100) / 100;
      total = baseAmount - retFuente;
    } else if (formData.retentionType === 'retencion_con_iva') {
      const baseSinIva = baseAmount / ivaDivisor;
      const retFuente = Math.round(baseSinIva * 0.0175 * 100) / 100;
      const retIva = Math.round((baseAmount - baseSinIva) * 0.30 * 100) / 100;
      total = baseAmount - retFuente - retIva;
    } else if (formData.retentionType !== 'none') {
      const retention = RETENTIONS.find(r => r.id === formData.retentionType);
      if (retention) {
        total -= baseAmount * (retention.percentage / 100);
      }
    }

    setFinalTotal(Math.max(0, total));
  }, [formData, settings.iva]);

  useEffect(() => {
    if (finalTotal > 0 && formData.months > 0) {
      setInstallments(calculateInstallments(finalTotal, formData.months));
    } else {
      setInstallments([]);
    }
  }, [finalTotal, formData.months]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      if (!beneficiaries.includes(formData.beneficiaryName)) {
        try {
          await addDoc(collection(db, 'beneficiaries'), {
            userId: user.uid,
            enterpriseId: getEnterpriseIdToSave(),
            name: formData.beneficiaryName,
            createdAt: serverTimestamp()
          });
          setBeneficiaries([...beneficiaries, formData.beneficiaryName]);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'beneficiaries');
        }
      }

      let invoiceRef;
      try {
        invoiceRef = await addDoc(collection(db, 'invoices'), {
          userId: user.uid,
          enterpriseId: getEnterpriseIdToSave(),
          beneficiaryName: formData.beneficiaryName,
          invoiceNumber: formData.invoiceNumber,
          concept: formData.concept,
          totalValue: formData.totalValue,
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          retentionType: formData.retentionType,
          retentionPercentage: RETENTIONS.find(r => r.id === formData.retentionType)?.percentage || 0,
          finalTotal,
          months: formData.months,
          firstPaymentDate: formData.firstPaymentDate,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'invoices');
        return;
      }

      const firstDate = new Date(formData.firstPaymentDate);
      firstDate.setMinutes(firstDate.getMinutes() + firstDate.getTimezoneOffset());

      for (let i = 0; i < installments.length; i++) {
        const checkDate = addMonths(firstDate, i);
        const checkNum = generateCheckNumber(formData.initialCheckNumber, i);
        
        try {
          await addDoc(collection(db, 'checks'), {
            userId: user.uid,
            enterpriseId: getEnterpriseIdToSave(),
            invoiceId: invoiceRef.id,
            beneficiaryName: formData.beneficiaryName,
            checkNumber: checkNum,
            concept: formData.concept,
            amount: installments[i],
            dueDate: format(checkDate, 'yyyy-MM-dd'),
            status: 'PENDING',
            bank: formData.bank || '',
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'checks');
        }
      }

      setFormData({
        ...formData,
        invoiceNumber: '',
        initialCheckNumber: '',
        concept: '',
        totalValue: 0,
        discountType: 'none',
        discountValue: 0,
        retentionType: 'none',
        bank: '',
      });
      showToast('¡Cheques registrados correctamente!', 'success');
      logAudit(AuditAction.CHECK_CREATE, `Registrada Factura ${formData.invoiceNumber} con ${installments.length} cheques por ${formData.beneficiaryName}`);

    } catch (error) {
      console.error('Error saving checks:', error);
      showToast('Error al guardar los cheques', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Registro de Egresos</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">Ingresa facturas y genera su programación de pagos automáticamente.</p>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl">
            <div className="flex -space-x-1">
              {['A','B','C','D','E','F'].map(l => (
                <div key={l} className="w-5 h-5 flex items-center justify-center bg-white dark:bg-neutral-800 rounded-full border border-amber-200 dark:border-amber-900/30 text-[10px] font-black text-amber-600">{l}</div>
              ))}
            </div>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-tighter">Protocolo V2.1.6 Requerido</p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx, .xls"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="group flex items-center px-5 py-2.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg shadow-indigo-100 dark:shadow-none"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Importar Protocolo
          </button>
        </div>
      </header>
      
      <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-3xl p-6 flex flex-col md:flex-row gap-6 items-center">
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl shadow-sm">
          <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-sm font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-widest">Protocolo de Carga Masiva v2.1.6</h2>
          <p className="text-xs text-indigo-700/70 dark:text-indigo-400">Organiza tu archivo Excel con este orden estricto de columnas para garantizar la precisión de los cálculos:</p>
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { c: 'A', t: 'Beneficiario' },
              { c: 'B', t: '# Factura' },
              { c: 'C', t: 'Concepto' },
              { c: 'D', t: '# Cheque' },
              { c: 'E', t: 'Fecha Pago' },
              { c: 'F', t: 'Valor' }
            ].map((col) => (
              <div key={col.c} className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                <span className="text-[10px] font-black text-indigo-600">{col.c}</span>
                <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 uppercase">{col.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 shadow-sm border border-neutral-100 dark:border-neutral-800 rounded-3xl overflow-hidden">
        <form onSubmit={handleSubmit} className="divide-y divide-neutral-50 dark:divide-neutral-800">
          <div className="p-8 space-y-8">
            {/* SuperAdmin Enterprise Selector */}
            {isSuperAdmin && (
              <div className="p-6 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="text-sm font-black text-amber-900 dark:text-amber-100 uppercase tracking-wider">Modo SuperAdministrador</h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">Asigne este egreso a una empresa matriz en particular, o manténgalo en la cuenta central del SuperAdmin.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block pl-1">Asignar a Empresa:</label>
                    <select
                      value={selectedEnterpriseId}
                      onChange={(e) => setSelectedEnterpriseId(e.target.value)}
                      className="w-full bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50 font-bold"
                    >
                      <option value="">-- Mantener en mi cuenta de SuperAdmin --</option>
                      {enterprises.map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.name} ({ent.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Beneficiario y Factura */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-neutral-900 dark:text-neutral-50">
              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <User className="w-4 h-4" /> Beneficiario *
                </label>
                <input
                  type="text"
                  required
                  list="beneficiaries-list"
                  value={formData.beneficiaryName}
                  onChange={(e) => setFormData({...formData, beneficiaryName: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Nombre de la empresa o persona"
                />
                <datalist id="beneficiaries-list">
                  {beneficiaries.map((b, i) => <option key={i} value={b} />)}
                </datalist>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> # Factura
                </label>
                <input
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="001-001-000000123"
                />
              </div>
            </div>

            {/* Concepto y Cheque Inicial */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-neutral-900 dark:text-neutral-50">
              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Concepto *
                </label>
                <input
                  type="text"
                  required
                  value={formData.concept}
                  onChange={(e) => setFormData({...formData, concept: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Pago por servicios ..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> # Cheque Inicial *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formData.initialCheckNumber}
                    onChange={(e) => setFormData({...formData, initialCheckNumber: e.target.value})}
                    className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="12345"
                  />
                  {settings.banks && settings.banks.length > 0 && (
                    <select
                      value={formData.bank}
                      onChange={(e) => setFormData({...formData, bank: e.target.value})}
                      className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-1/3"
                    >
                      <option value="">(Banco)</option>
                      {settings.banks.map((b, i) => (
                        <option key={i} value={b}>{b}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Valores Financieros */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-neutral-900 dark:text-neutral-50">
              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> Valor Factura *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.totalValue || ''}
                  onChange={(e) => setFormData({...formData, totalValue: parseFloat(e.target.value) || 0})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg font-bold"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <PlusCircle className="w-4 h-4" /> Meses (Cuotas) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  required
                  value={formData.months}
                  onChange={(e) => setFormData({...formData, months: parseInt(e.target.value) || 1})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> 1ra Fecha *
                </label>
                <input
                  type="date"
                  required
                  value={formData.firstPaymentDate}
                  onChange={(e) => setFormData({...formData, firstPaymentDate: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Descuentos y Retenciones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Ajuste de Descuento</label>
                <div className="flex gap-4">
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({...formData, discountType: e.target.value, discountValue: 0})}
                    className="flex-1 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 outline-none"
                  >
                    {DISCOUNTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  {formData.discountType !== 'none' && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formData.discountValue || ''}
                      onChange={(e) => setFormData({...formData, discountValue: parseFloat(e.target.value) || 0})}
                      className="w-24 bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 outline-none font-bold"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Retención en Venta</label>
                <select
                  value={formData.retentionType}
                  onChange={(e) => setFormData({...formData, retentionType: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-50 outline-none"
                >
                  {RETENTIONS.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.label} {r.percentage > 0 ? `(${r.percentage}%)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Resumen Final */}
          <div className="p-8 bg-neutral-50/50 dark:bg-neutral-950/40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
              <div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Proyección de Pago</h3>
                <p className="text-sm text-neutral-500">Monto total descontando retenciones y ajustes.</p>
              </div>
              <div className="bg-indigo-600 dark:bg-indigo-500 rounded-2xl px-6 py-3 text-white shadow-lg shadow-indigo-100 dark:shadow-none">
                <span className="text-xs font-bold uppercase tracking-widest block opacity-70">Monto Final</span>
                <span className="text-3xl font-black">{formatCurrency(finalTotal, settings.currency)}</span>
              </div>
            </div>
            
            {installments.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Calendario de {installments.length} cuotas:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {installments.map((amount, idx) => (
                    <div key={idx} className="bg-white dark:bg-neutral-800 p-3 rounded-2xl border border-neutral-100 dark:border-neutral-700 shadow-sm flex flex-col items-center">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase">Pago #{idx + 1}</span>
                      <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{formatCurrency(amount, settings.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-8 flex justify-end">
            <button
              type="submit"
              disabled={loading || finalTotal <= 0}
              className="px-10 py-4 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl text-lg font-black hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100 dark:shadow-none disabled:opacity-50 disabled:grayscale"
            >
              {loading ? 'Procesando Transacción...' : 'Generar Programación de Pagos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
