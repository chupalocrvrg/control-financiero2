import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, where } from 'firebase/firestore';
import { Receipt, Plus, Trash2, Pencil, Calendar, X, Save, FileText, User, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { logAudit, AuditAction } from '../lib/audit';
import { format, startOfMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CollectionData {
  id: string;
  employeeId: string;
  initialDate: string;
  finalDate: string;
  noReceipt: boolean;
  initialReceipt: string | null;
  finalReceipt: string | null;
  totalCollected: number;
  depositsTransfers: number;
  cashFinal: number;
  createdAt: any;
  clientName?: string;
}

interface Employee {
  id: string;
  name: string;
  lastName: string;
  role: string;
}

export default function Collections() {
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useAuth();
  const { showToast, showConfirm } = useNotification();
  const currentEnterpriseId = profile?.enterpriseId || user?.uid;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionData | null>(null);
  
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [expandedCollectors, setExpandedCollectors] = useState<Set<string>>(new Set());

  // Pagination inside collectors
  const [collectorPages, setCollectorPages] = useState<Record<string, number>>({});
  const ITEMS_PER_PAGE = 10;
  
  // Pagination for collectors
  const [currentCollectorPage, setCurrentCollectorPage] = useState(1);
  const COLLECTORS_PER_PAGE = 10;
  
  const [formData, setFormData] = useState({
    employeeId: '',
    initialDate: format(new Date(), 'yyyy-MM-dd'),
    finalDate: format(new Date(), 'yyyy-MM-dd'),
    noReceipt: false,
    initialReceipt: '',
    finalReceipt: '',
    totalCollected: '',
    depositsTransfers: '',
    clientName: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user, currentEnterpriseId, currentMonth]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      const qEmp = query(collection(db, 'employees'), where('enterpriseId', '==', currentEnterpriseId));
      const snapEmp = await getDocs(qEmp);
      setEmployees(snapEmp.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));

      const qColl = query(collection(db, 'collections'), where('enterpriseId', '==', currentEnterpriseId));
      const snapColl = await getDocs(qColl);
      
      let allCollections = snapColl.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionData));

      // Filter by month (using initialDate)
      allCollections = allCollections.filter(c => c.initialDate && c.initialDate.startsWith(currentMonth));
      
      allCollections.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.initialDate).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.initialDate).getTime();
        return timeB - timeA;
      });
      
      setCollections(allCollections);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (coll?: CollectionData) => {
    if (coll) {
      setEditingCollection(coll);
      setFormData({
        employeeId: coll.employeeId,
        initialDate: coll.initialDate,
        finalDate: coll.finalDate,
        noReceipt: coll.noReceipt || false,
        initialReceipt: coll.initialReceipt || '',
        finalReceipt: coll.finalReceipt || '',
        totalCollected: coll.totalCollected.toString(),
        depositsTransfers: coll.depositsTransfers.toString(),
        clientName: coll.clientName || ''
      });
    } else {
      setEditingCollection(null);
      setFormData({
        employeeId: '',
        initialDate: format(new Date(), 'yyyy-MM-dd'),
        finalDate: format(new Date(), 'yyyy-MM-dd'),
        noReceipt: false,
        initialReceipt: '',
        finalReceipt: '',
        totalCollected: '',
        depositsTransfers: '',
        clientName: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const cashFinal = (parseFloat(formData.totalCollected) || 0) - (parseFloat(formData.depositsTransfers) || 0);
    if (cashFinal < 0) {
       showToast('El efectivo final no puede ser negativo', 'error');
       return;
    }
    
    try {
      setIsSubmitting(true);
      const dataToSave = {
        employeeId: formData.employeeId,
        initialDate: formData.initialDate,
        finalDate: formData.finalDate,
        noReceipt: formData.noReceipt,
        initialReceipt: formData.noReceipt ? null : formData.initialReceipt,
        finalReceipt: formData.noReceipt ? null : formData.finalReceipt,
        totalCollected: parseFloat(formData.totalCollected) || 0,
        depositsTransfers: parseFloat(formData.depositsTransfers) || 0,
        cashFinal,
        clientName: formData.noReceipt ? formData.clientName : null
      };

      if (editingCollection) {
        await updateDoc(doc(db, 'collections', editingCollection.id), dataToSave);
        await logAudit(AuditAction.COLLECTION_UPDATE, `Cobranza editada - $ ${dataToSave.totalCollected}`, editingCollection.id);
      } else {
        const newDoc = await addDoc(collection(db, 'collections'), {
          ...dataToSave,
          enterpriseId: currentEnterpriseId,
          createdAt: Timestamp.now()
        });
        await logAudit(AuditAction.COLLECTION_CREATE, `Cobranza registrada - $ ${dataToSave.totalCollected}`, newDoc.id);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving collection:', err);
      showToast('Error al guardar', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Eliminar Cobranza', '¿Está seguro de eliminar este registro?', { type: 'danger' })) {
      try {
        await deleteDoc(doc(db, 'collections', id));
        await logAudit(AuditAction.COLLECTION_DELETE, `Cobranza eliminada`, id);
        fetchData();
      } catch (err: any) {
        console.error('Error deleting collection:', err);
        showToast('Error al eliminar', 'error');
      }
    }
  };

  const toggleCollector = (id: string) => {
    const newSet = new Set(expandedCollectors);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCollectors(newSet);
  };

  const calculatedCashFinal = (parseFloat(formData.totalCollected) || 0) - (parseFloat(formData.depositsTransfers) || 0);

  const collectors = employees.filter(e => ['cobrador', 'ambos', 'supervisor_cobranza', 'supervisor_general'].includes(e.role));
  
  const totalCollectorPages = Math.ceil(collectors.length / COLLECTORS_PER_PAGE);
  const paginatedCollectors = collectors.slice((currentCollectorPage - 1) * COLLECTORS_PER_PAGE, currentCollectorPage * COLLECTORS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-indigo-500" />
            Registro de Cobranzas
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Gestión de lotes de cobranza y control de recibos por cobrador</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <button 
              onClick={() => setCurrentMonth(format(subMonths(parseISO(currentMonth + '-15'), 1), 'yyyy-MM'))}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              &larr;
            </button>
            <div className="flex items-center gap-2 px-3 font-medium text-neutral-900 dark:text-neutral-100">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span className="capitalize">{format(parseISO(currentMonth + '-15'), 'MMMM yyyy', { locale: es })}</span>
            </div>
            <button 
              onClick={() => setCurrentMonth(format(addMonths(parseISO(currentMonth + '-15'), 1), 'yyyy-MM'))}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              &rarr;
            </button>
          </div>

          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva Cobranza
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : collectors.length === 0 ? (
        <div className="p-8 text-center text-neutral-500">
          No hay cobradores registrados. Vaya al Directorio Comercial.
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedCollectors.map(collector => {
            const collectorCollections = collections.filter(c => c.employeeId === collector.id);
            const totalCollected = collectorCollections.reduce((acc, c) => acc + c.totalCollected, 0);
            const totalCash = collectorCollections.reduce((acc, c) => acc + c.cashFinal, 0);
            const isExpanded = expandedCollectors.has(collector.id);
            
            const currentPage = collectorPages[collector.id] || 1;
            const totalPages = Math.ceil(collectorCollections.length / ITEMS_PER_PAGE);
            const paginatedCollections = collectorCollections.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

            return (
              <div key={collector.id} className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                <div 
                  className="p-6 cursor-pointer flex flex-wrap items-center justify-between gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  onClick={() => toggleCollector(collector.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                      <User className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">{collector.name} {collector.lastName}</h3>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{collector.role.replace('_', ' ')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest">Total Recaudado</p>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest">Efectivo Retenido</p>
                      <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-neutral-500" /> : <ChevronDown className="w-5 h-5 text-neutral-500" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
                    {collectorCollections.length === 0 ? (
                      <div className="p-8 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                        No hay cobranzas registradas en este mes.
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-neutral-100/50 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-400 font-medium">
                              <tr>
                                <th className="px-6 py-4">Fechas / Cliente</th>
                                <th className="px-6 py-4">Recibos</th>
                                <th className="px-6 py-4 text-right">Recaudado</th>
                                <th className="px-6 py-4 text-right">Depósitos</th>
                                <th className="px-6 py-4 text-right">Efectivo</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                              {paginatedCollections.map((coll) => (
                                <tr key={coll.id} className="hover:bg-white dark:hover:bg-neutral-800/50 transition-colors">
                                  <td className="px-6 py-4">
                                    {coll.noReceipt ? (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase tracking-wide">Cobro en Agencia</span>
                                        <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">{coll.clientName || 'Sin nombre'}</span>
                                      </div>
                                    ) : (
                                      <div className="text-xs">
                                        <div><span className="text-neutral-500">Del:</span> {coll.initialDate}</div>
                                        <div><span className="text-neutral-500">Al:</span> {coll.finalDate}</div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                                    {coll.noReceipt ? '-' : (
                                      <>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{coll.initialReceipt}</span> al <span className="font-bold">{coll.finalReceipt}</span>
                                      </>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-neutral-900 dark:text-neutral-100">
                                    ${coll.totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                  </td>
                                  <td className="px-6 py-4 text-right text-neutral-600 dark:text-neutral-400">
                                    ${coll.depositsTransfers.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                    ${coll.cashFinal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <button onClick={() => handleOpenModal(coll)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg">
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button onClick={() => handleDelete(coll.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">
                            <p className="text-xs text-neutral-500">
                              Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, collectorCollections.length)} de {collectorCollections.length} cobranzas
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setCollectorPages(prev => ({ ...prev, [collector.id]: Math.max(1, currentPage - 1) }))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 text-xs font-bold text-neutral-600 bg-neutral-100 dark:bg-neutral-800 rounded-lg disabled:opacity-50"
                              >
                                Anterior
                              </button>
                              <button
                                onClick={() => setCollectorPages(prev => ({ ...prev, [collector.id]: Math.min(totalPages, currentPage + 1) }))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 text-xs font-bold text-neutral-600 bg-neutral-100 dark:bg-neutral-800 rounded-lg disabled:opacity-50"
                              >
                                Siguiente
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {totalCollectorPages > 1 && (
            <div className="flex items-center justify-between mt-6 px-4">
              <p className="text-sm text-neutral-500">
                Página {currentCollectorPage} de {totalCollectorPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentCollectorPage(prev => Math.max(1, prev - 1))}
                  disabled={currentCollectorPage === 1}
                  className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentCollectorPage(prev => Math.min(totalCollectorPages, prev + 1))}
                  disabled={currentCollectorPage === totalCollectorPages}
                  className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-500" />
                {editingCollection ? 'Editar Cobranza' : 'Registrar Cobranza'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-neutral-400" /> Cobrador Asignado
                  </label>
                  <select
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                    className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                  >
                    <option value="" disabled>Seleccione...</option>
                    {employees.filter(e => ['cobrador', 'ambos', 'supervisor_cobranza', 'supervisor_general'].includes(e.role)).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} {emp.lastName}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-end">
                  <label className="flex items-center gap-3 cursor-pointer p-2 w-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors h-[42px]">
                    <input
                      type="checkbox"
                      checked={formData.noReceipt}
                      onChange={(e) => setFormData({
                        ...formData, 
                        noReceipt: e.target.checked,
                        initialReceipt: e.target.checked ? '' : formData.initialReceipt,
                        finalReceipt: e.target.checked ? '' : formData.finalReceipt,
                        clientName: e.target.checked ? formData.clientName : ''
                      })}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-500 uppercase tracking-wider">
                      Cobro Directo en Agencia
                    </span>
                  </label>
                </div>
              </div>

              {formData.noReceipt && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl">
                  <label className="block text-sm font-medium text-amber-900 dark:text-amber-300 mb-1 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-amber-500" /> Nombre del Cliente (Obligatorio)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.clientName}
                    onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                    className="w-full px-4 py-2 bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-neutral-900 dark:text-white"
                    placeholder="Ej. Juan Pérez"
                  />
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                    Esta opción se utiliza cuando el cliente se acerca directamente a realizar un pago en la oficina sin la intervención física del cobrador con su libreta de recibos.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-50 dark:bg-neutral-800/30 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-700 pb-2">Datos Iniciales</h3>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-neutral-400" /> Fecha Inicial
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.initialDate}
                      onChange={(e) => setFormData({...formData, initialDate: e.target.value})}
                      className="w-full px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                    />
                  </div>
                  {!formData.noReceipt && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-neutral-400" /> Recibo Inicial
                      </label>
                      <input
                        type="text"
                        required={!formData.noReceipt}
                        value={formData.initialReceipt}
                        onChange={(e) => setFormData({...formData, initialReceipt: e.target.value})}
                        className="w-full px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white font-mono uppercase"
                        placeholder="Ej. XXX001"
                      />
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-700 pb-2">Datos Finales</h3>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-neutral-400" /> Fecha Final
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.finalDate}
                      onChange={(e) => setFormData({...formData, finalDate: e.target.value})}
                      className="w-full px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                    />
                  </div>
                  {!formData.noReceipt && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-neutral-400" /> Recibo Final
                      </label>
                      <input
                        type="text"
                        required={!formData.noReceipt}
                        value={formData.finalReceipt}
                        onChange={(e) => setFormData({...formData, finalReceipt: e.target.value})}
                        className="w-full px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white font-mono uppercase"
                        placeholder="Ej. XXX099"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Valor Total Cobrado
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">$</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.totalCollected}
                      onChange={(e) => setFormData({...formData, totalCollected: e.target.value})}
                      className="w-full pl-8 pr-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Depósitos / Transf.
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">$</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.depositsTransfers}
                      onChange={(e) => setFormData({...formData, depositsTransfers: e.target.value})}
                      className="w-full pl-8 pr-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                    Efectivo Final
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold">$</span>
                    <input
                      type="text"
                      disabled
                      value={calculatedCashFinal.toFixed(2)}
                      className={`w-full pl-8 pr-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border font-bold rounded-xl outline-none ${
                        calculatedCashFinal < 0 
                          ? 'border-red-300 text-red-600' 
                          : 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      }`}
                    />
                  </div>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-neutral-200 dark:border-neutral-800 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || calculatedCashFinal < 0}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar Cobranza
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
