import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, where } from 'firebase/firestore';
import { Plus, Pencil, Trash2, ShoppingCart, AlertCircle, Save, X, Calendar, User, DollarSign, Bike } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { logAudit, AuditAction } from '../lib/audit';
import { format } from 'date-fns';
import { isSuperAdminEmail } from '../lib/utils';

interface Employee {
  id: string;
  name: string;
  lastName: string;
  role: 'vendedor' | 'cobrador' | 'ambos';
}

interface Sale {
  id: string;
  date: string;
  type: 'contado' | 'credito';
  employeeId: string;
  isMoto: boolean;
  motoType: 'combustion' | 'electrico' | null;
  clientName?: string;
  article: string;
  totalValue: number;
  createdAt: any;
}

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile, originalUser } = useAuth();
  const { showToast, showConfirm } = useNotification();

  const isSuperAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || isSuperAdminEmail(originalUser?.email);

  const [enterprises, setEnterprises] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string>(''); // list filter
  const [formEnterpriseId, setFormEnterpriseId] = useState<string>(''); // form creator filter

  const currentEnterpriseId = isSuperAdmin
    ? (selectedEnterpriseId || user?.uid || '')
    : (profile?.role === 'enterprise' ? user?.uid : (profile?.enterpriseId || user?.uid || ''));
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  // Filters
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterDateType, setFilterDateType] = useState<'exacta' | 'rango'>('exacta');
  const [filterDateExact, setFilterDateExact] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  
  // Form State
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'contado' as 'contado' | 'credito',
    employeeId: '',
    isMoto: false,
    motoType: 'combustion' as 'combustion' | 'electrico' | null,
    totalValue: '',
    clientName: '',
    article: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const uniqueClients = Array.from(new Set(sales.map(s => s.clientName).filter(Boolean))) as string[];

  const filteredSales = sales.filter(sale => {
    let match = true;
    const emp = employees.find(e => e.id === sale.employeeId);
    const empName = emp ? `${emp.name} ${emp.lastName}`.toLowerCase() : '';
    
    if (filterEmployee && !empName.includes(filterEmployee.toLowerCase())) match = false;
    if (filterClient && !(sale.clientName || '').toLowerCase().includes(filterClient.toLowerCase())) match = false;
    
    if (filterDateType === 'exacta' && filterDateExact) {
      if (sale.date !== filterDateExact) match = false;
    } else if (filterDateType === 'rango') {
      if (filterDateStart && sale.date < filterDateStart) match = false;
      if (filterDateEnd && sale.date > filterDateEnd) match = false;
    }
    
    return match;
  });

  useEffect(() => {
    if (user) {
      fetchData();
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
      console.error('Error loading enterprises for SuperAdmin sales:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      let salesList: Sale[] = [];
      let empList: Employee[] = [];

      if (isSuperAdmin) {
        // SuperAdmin fetches all documents and applies selectedEnterpriseId filter
        const [allSales, allEmployees] = await Promise.all([
          getDocs(collection(db, 'sales')),
          getDocs(collection(db, 'employees'))
        ]);
        
        salesList = allSales.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
        empList = allEmployees.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
        
        if (selectedEnterpriseId) {
          salesList = salesList.filter((s: any) => s.enterpriseId === selectedEnterpriseId);
          empList = empList.filter((e: any) => e.enterpriseId === selectedEnterpriseId);
        }
      } else {
        const tenantId = profile?.role === 'enterprise' ? user?.uid : (profile?.enterpriseId || user?.uid || '');
        const salesQ = query(collection(db, 'sales'), where('enterpriseId', '==', tenantId));
        const empQ = query(collection(db, 'employees'), where('enterpriseId', '==', tenantId));
        
        const [salesRes, empRes] = await Promise.all([
          getDocs(salesQ),
          getDocs(empQ)
        ]);
        
        salesList = salesRes.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
        empList = empRes.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      }

      salesList.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setSales(salesList);

      empList.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(empList);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (sale?: Sale) => {
    if (sale) {
      setEditingSale(sale);
      setFormEnterpriseId((sale as any).enterpriseId || '');
      setFormData({
        date: sale.date,
        type: sale.type,
        employeeId: sale.employeeId,
        isMoto: sale.isMoto,
        motoType: sale.motoType || 'combustion',
        totalValue: sale.totalValue.toString(),
        clientName: sale.clientName || '',
        article: sale.article || ''
      });
    } else {
      setEditingSale(null);
      const initialEntId = selectedEnterpriseId || '';
      setFormEnterpriseId(initialEntId);
      
      // Filter employees of the chosen initial company to select a valid seller
      const validEmps = initialEntId
        ? employees.filter(e => e.enterpriseId === initialEntId && (e.role === 'vendedor' || e.role === 'ambos'))
        : employees.filter(e => e.role === 'vendedor' || e.role === 'ambos');

      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'contado',
        employeeId: validEmps[0]?.id || '',
        isMoto: false,
        motoType: 'combustion',
        totalValue: '',
        clientName: '',
        article: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      setIsSubmitting(true);
      const targetEnterpriseId = isSuperAdmin
        ? (formEnterpriseId || user.uid)
        : (profile?.role === 'enterprise' ? user.uid : (profile?.enterpriseId || user.uid || ''));

      const saleData = {
        date: formData.date,
        type: formData.type,
        employeeId: formData.employeeId,
        isMoto: formData.isMoto,
        motoType: formData.isMoto ? formData.motoType : null,
        totalValue: parseFloat(formData.totalValue) || 0,
        clientName: formData.clientName,
        article: formData.article,
        enterpriseId: targetEnterpriseId
      };

      if (editingSale) {
        await updateDoc(doc(db, 'sales', editingSale.id), saleData);
        await logAudit(AuditAction.SALE_UPDATE, `Venta modificada para cliente: ${saleData.clientName || 'Sin Nombre'}, Artículo: ${saleData.article}, Valor: $${saleData.totalValue}`, editingSale.id);
      } else {
        const newDoc = await addDoc(collection(db, 'sales'), {
          ...saleData,
          createdAt: Timestamp.now()
        });
        await logAudit(AuditAction.SALE_UPDATE, `Venta registrada para cliente: ${saleData.clientName || 'Sin Nombre'}, Artículo: ${saleData.article}, Valor: $${saleData.totalValue}`, newDoc.id);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving sale:', err);
      setError('Error al guardar venta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Eliminar Venta', '¿Está seguro de eliminar este registro?', { type: 'danger' })) {
      try {
        const saleToDelete = sales.find(s => s.id === id);
        await deleteDoc(doc(db, 'sales', id));
        await logAudit(AuditAction.SALE_UPDATE, `Venta eliminada para cliente: ${saleToDelete?.clientName || 'Sin Nombre'}, Artículo: ${saleToDelete?.article}, Valor: $${saleToDelete?.totalValue}`, id);
        fetchData();
        showToast('Venta eliminada exitosamente', 'success');
      } catch (err: any) {
        console.error('Error deleting sale:', err);
        setError('Error al eliminar registro');
        showToast('Error al eliminar registro', 'error');
      }
    }
  };

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.name} ${emp.lastName}` : 'Desconocido';
  };

  // Pagination for sellers
  const [currentSellerPage, setCurrentSellerPage] = useState(1);
  const SELLERS_PER_PAGE = 10;
  const [expandedSellers, setExpandedSellers] = useState<Set<string>>(new Set());
  const [sellerPages, setSellerPages] = useState<Record<string, number>>({});
  const ITEMS_PER_PAGE = 10;
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));

  const toggleSeller = (id: string) => {
    const newSet = new Set(expandedSellers);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedSellers(newSet);
  };

  const sellers = employees.filter(e => ['vendedor', 'ambos', 'supervisor_ventas', 'supervisor_general'].includes(e.role));
  
  const totalSellerPages = Math.ceil(sellers.length / SELLERS_PER_PAGE);
  const paginatedSellers = sellers.slice((currentSellerPage - 1) * SELLERS_PER_PAGE, currentSellerPage * SELLERS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-indigo-500" />
            Registro de Ventas
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Gestión de ventas y cumplimiento de presupuestos por vendedor</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <button 
              onClick={() => setCurrentMonth(format(new Date(new Date(currentMonth + '-15').setMonth(new Date(currentMonth + '-15').getMonth() - 1)), 'yyyy-MM'))}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              &larr;
            </button>
            <div className="flex items-center gap-2 px-3 font-medium text-neutral-900 dark:text-neutral-100">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span className="capitalize">{format(new Date(currentMonth + '-15'), 'MMMM yyyy')}</span>
            </div>
            <button 
              onClick={() => setCurrentMonth(format(new Date(new Date(currentMonth + '-15').setMonth(new Date(currentMonth + '-15').getMonth() + 1)), 'yyyy-MM'))}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              &rarr;
            </button>
          </div>
          <button
            onClick={() => {
              setEditingSale(null);
              setFormData({
                date: format(new Date(), 'yyyy-MM-dd'),
                type: 'contado',
                employeeId: '',
                isMoto: false,
                motoType: 'combustion',
                totalValue: '',
                clientName: '',
                article: ''
              });
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva Venta
          </button>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="bg-amber-50/40 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/20 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-600">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-900 dark:text-amber-100 uppercase tracking-wider">Filtro de Empresa (SuperAdmin)</h4>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">Verifique las ventas registradas filtrando por empresa matriz.</p>
            </div>
          </div>
          <select
            value={selectedEnterpriseId}
            onChange={(e) => setSelectedEnterpriseId(e.target.value)}
            className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-amber-500 font-bold dark:text-neutral-100 min-w-[240px]"
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

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : sellers.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center shadow-sm">
          <ShoppingCart className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">No hay vendedores configurados</h3>
          <p className="text-neutral-500 dark:text-neutral-400">Agregue empleados con rol de "vendedor" o "ambos" en el Panel de Administración.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedSellers.map(seller => {
            const sellerSales = sales.filter(s => {
              const matchesEmp = s.employeeId === seller.id;
              const matchesMonth = s.date && s.date.startsWith(currentMonth);
              return matchesEmp && matchesMonth;
            });
            
            const totalValue = sellerSales.reduce((sum, s) => sum + (!s.isMoto ? (parseFloat(s.totalValue.toString()) || 0) : 0), 0);
            const totalMotos = sellerSales.filter(s => s.isMoto).length;
            const isExpanded = expandedSellers.has(seller.id);
            
            const currentPage = sellerPages[seller.id] || 1;
            const totalPages = Math.max(1, Math.ceil(sellerSales.length / ITEMS_PER_PAGE));
            const paginatedSellerSales = sellerSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

            return (
              <div key={seller.id} className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                <div 
                  className="p-6 cursor-pointer flex flex-wrap items-center justify-between gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  onClick={() => toggleSeller(seller.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                      <User className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">{seller.name} {seller.lastName}</h3>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{seller.role.replace('_', ' ')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest">Ventas Netas</p>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest">Unidades Moto</p>
                      <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{totalMotos}</p>
                    </div>
                    <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                      {isExpanded ? <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg> : <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
                    {sellerSales.length === 0 ? (
                      <div className="p-8 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                        No hay ventas registradas en este mes.
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-neutral-100/50 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-400 font-medium">
                              <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Cliente / Artículo</th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                                <th className="px-6 py-4 text-center">Moto</th>
                                <th className="px-6 py-4 text-right">Valor Final</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                              {paginatedSellerSales.map((sale) => (
                                <tr key={sale.id} className="hover:bg-white dark:hover:bg-neutral-800/50 transition-colors">
                                  <td className="px-6 py-4 text-neutral-600 dark:text-neutral-400 font-mono text-xs">
                                    {sale.date}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="font-bold text-neutral-900 dark:text-neutral-100">{sale.clientName || 'Sin cliente'}</div>
                                    <div className="text-xs text-neutral-500">{sale.article}</div>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={"px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-lg " + (sale.type === 'contado' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400")}>
                                      {sale.type}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    {sale.isMoto ? (
                                      <span className={"px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-lg " + (sale.motoType === 'electrico' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")}>
                                        {sale.motoType}
                                      </span>
                                    ) : (
                                      <span className="text-neutral-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-neutral-900 dark:text-neutral-100">
                                    ${(sale.totalValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <button onClick={() => handleOpenModal(sale)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg">
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button onClick={() => handleDelete(sale.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
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
                              Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, sellerSales.length)} de {sellerSales.length} ventas
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSellerPages(prev => ({ ...prev, [seller.id]: Math.max(1, currentPage - 1) }))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 text-xs font-bold text-neutral-600 bg-neutral-100 dark:bg-neutral-800 rounded-lg disabled:opacity-50"
                              >
                                Anterior
                              </button>
                              <button
                                onClick={() => setSellerPages(prev => ({ ...prev, [seller.id]: Math.min(totalPages, currentPage + 1) }))}
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
          
          {totalSellerPages > 1 && (
            <div className="flex items-center justify-between mt-6 px-4">
              <p className="text-sm text-neutral-500">
                Página {currentSellerPage} de {totalSellerPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentSellerPage(p => Math.max(1, p - 1))}
                  disabled={currentSellerPage === 1}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentSellerPage(p => Math.min(totalSellerPages, p + 1))}
                  disabled={currentSellerPage === totalSellerPages}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-lg shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-500" />
                {editingSale ? 'Editar Venta' : 'Registrar Venta'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {isSuperAdmin && (
                <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl space-y-2">
                  <label className="block text-xs font-black text-amber-900 dark:text-amber-100 uppercase tracking-wider pl-1">
                    Asignar Empresa (SuperAdmin)
                  </label>
                  <select
                    value={formEnterpriseId}
                    onChange={(e) => {
                      const newEntId = e.target.value;
                      setFormEnterpriseId(newEntId);
                      
                      // Auto-select the first employee of this new company to prevent mismatch
                      const validEmps = newEntId
                        ? employees.filter(emp => emp.enterpriseId === newEntId && (emp.role === 'vendedor' || emp.role === 'ambos'))
                        : employees.filter(emp => emp.role === 'vendedor' || emp.role === 'ambos');
                      setFormData(prev => ({ ...prev, employeeId: validEmps[0]?.id || '' }));
                    }}
                    className="w-full px-4 py-2 bg-white dark:bg-neutral-800 border border-amber-200 dark:border-neutral-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-bold dark:text-white"
                  >
                    <option value="">-- Asignar al SuperAdmin --</option>
                    {enterprises.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-neutral-400" /> Nombre del Cliente
                </label>
                <input
                  type="text"
                  required
                  list="clients-list"
                  value={formData.clientName}
                  onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                  className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                  placeholder="Ej. Juan Pérez"
                />
                <datalist id="clients-list">
                  {uniqueClients.map(client => (
                    <option key={client} value={client} />
                  ))}
                </datalist>
              </div>


              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-neutral-400" /> Artículo Vendido
                </label>
                <input
                  type="text"
                  required
                  value={formData.article}
                  onChange={(e) => setFormData({...formData, article: e.target.value})}
                  className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                  placeholder="Ej. Moto XYZ / Repuestos"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-neutral-400" /> Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-neutral-400" /> Tipo
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'contado' | 'credito'})}
                    className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                  >
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-neutral-400" /> Vendedor
                </label>
                <select
                  required
                  value={formData.employeeId}
                  onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                  className="w-full px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                >
                  <option value="" disabled>Seleccione un vendedor...</option>
                  {employees
                    .filter(e => {
                      if (e.role !== 'vendedor' && e.role !== 'ambos') return false;
                      if (isSuperAdmin) {
                        return e.enterpriseId === formEnterpriseId;
                      }
                      return true;
                    })
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} {emp.lastName}</option>
                    ))
                  }
                </select>
              </div>

              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isMoto}
                    onChange={(e) => setFormData({...formData, isMoto: e.target.checked})}
                    className="w-5 h-5 text-indigo-600 rounded border-neutral-300 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                    <Bike className="w-4 h-4 text-indigo-500" />
                    ¿La venta incluye una Moto?
                  </span>
                </label>
                
                {formData.isMoto && (
                  <div className="pl-8 flex gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="motoType"
                        value="combustion"
                        checked={formData.motoType === 'combustion'}
                        onChange={() => setFormData({...formData, motoType: 'combustion'})}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Combustión</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="motoType"
                        value="electrico"
                        checked={formData.motoType === 'electrico'}
                        onChange={() => setFormData({...formData, motoType: 'electrico'})}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Eléctrica</span>
                    </label>
                  </div>
                )}
                {formData.isMoto && (
                  <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 pl-8">
                    * El valor de las motos no sumará al cumplimiento de presupuesto en dinero, solo sumará en el indicador de unidades.
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                  Valor Total {formData.isMoto ? '(Final de la moto)' : ''}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">$</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.totalValue}
                    onChange={(e) => setFormData({...formData, totalValue: e.target.value})}
                    className="w-full pl-8 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-900 dark:text-white"
                    placeholder="0.00"
                  />
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
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar Venta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
    </div>
  );
}