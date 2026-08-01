import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, where, writeBatch } from 'firebase/firestore';
import { Plus, Pencil, Trash2, Users, AlertCircle, Save, X, Target, Calendar, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { logAudit, AuditAction } from '../lib/audit';
import { format, startOfMonth, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

export type EmployeeRole = 'vendedor' | 'cobrador' | 'ambos' | 'supervisor_ventas' | 'supervisor_cobranza' | 'supervisor_general';

export interface Employee {
  id: string;
  name: string;
  lastName: string;
  role: EmployeeRole;
  createdAt: any;
  enterpriseId: string;
}

export interface Budget {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  salesBudget: number;
  collectionsBudget: number;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [budgets, setBudgets] = useState<Record<string, Budget>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useAuth();
  const { showToast, showConfirm } = useNotification();
  const currentEnterpriseId = profile?.enterpriseId || user?.uid;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // Search and tabs
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'PRESUPUESTOS'>('PERSONAL');
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));

  const [savingBudgets, setSavingBudgets] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    lastName: '',
    role: 'vendedor' as EmployeeRole
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, [user, currentEnterpriseId]);

  useEffect(() => {
    if (activeTab === 'PRESUPUESTOS') {
      fetchBudgets();
    }
  }, [currentMonth, activeTab, employees]);

  const fetchEmployees = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const q = query(collection(db, 'employees'), where('enterpriseId', '==', currentEnterpriseId));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setEmployees(data);
    } catch (err: any) {
      console.error('Error fetching employees:', err);
      setError('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  const fetchBudgets = async () => {
    if (!user || employees.length === 0) return;
    try {
      setLoading(true);
      const q = query(collection(db, 'budgets'), where('month', '==', currentMonth));
      const snap = await getDocs(q);
      const budgetMap: Record<string, Budget> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (employees.some(e => e.id === data.employeeId)) {
          budgetMap[data.employeeId] = { id: d.id, ...data } as Budget;
        }
      });
      setBudgets(budgetMap);
    } catch (err) {
      console.error('Error fetching budgets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee);
      setFormData({
        name: employee.name,
        lastName: employee.lastName,
        role: employee.role
      });
    } else {
      setEditingEmployee(null);
      setFormData({
        name: '',
        lastName: '',
        role: 'vendedor'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      setIsSubmitting(true);
      if (editingEmployee) {
        const docRef = doc(db, 'employees', editingEmployee.id);
        await updateDoc(docRef, {
          name: formData.name,
          lastName: formData.lastName,
          role: formData.role
        });
        await logAudit(AuditAction.EMPLOYEE_UPDATE, `Empleado modificado: ${formData.name} ${formData.lastName} (${formData.role})`, editingEmployee.id);
      } else {
        const newDoc = await addDoc(collection(db, 'employees'), {
          name: formData.name,
          lastName: formData.lastName,
          role: formData.role,
          enterpriseId: currentEnterpriseId,
          createdAt: Timestamp.now()
        });
        await logAudit(AuditAction.EMPLOYEE_UPDATE, `Empleado creado: ${formData.name} ${formData.lastName} (${formData.role})`, newDoc.id);
      }
      setIsModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      console.error('Error saving employee:', err);
      setError('Error al guardar empleado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Eliminar Empleado', '¿Está seguro de eliminar este empleado?', { type: 'danger' })) {
      try {
        const empToDelete = employees.find(e => e.id === id);
        await deleteDoc(doc(db, 'employees', id));
        if (empToDelete) {
           await logAudit(AuditAction.EMPLOYEE_UPDATE, `Empleado eliminado: ${empToDelete.name} ${empToDelete.lastName}`, id);
        }
        fetchEmployees();
      } catch (err: any) {
        console.error('Error deleting employee:', err);
        setError('Error al eliminar empleado');
      }
    }
  };

  const handleBudgetChange = (employeeId: string, field: 'salesBudget' | 'collectionsBudget', value: string) => {
    const numValue = parseFloat(value) || 0;
    setBudgets(prev => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || { id: '', employeeId, month: currentMonth, salesBudget: 0, collectionsBudget: 0 }),
        [field]: numValue
      }
    }));
  };

  const handleSaveBudgets = async () => {
    try {
      setSavingBudgets(true);
      const batch = writeBatch(db);
      
      Object.values(budgets).forEach((budget: Budget) => {
        if (budget.id) {
          batch.update(doc(db, 'budgets', budget.id), {
            salesBudget: budget.salesBudget,
            collectionsBudget: budget.collectionsBudget
          });
        } else {
          const newRef = doc(collection(db, 'budgets'));
          batch.set(newRef, {
            employeeId: budget.employeeId,
            month: budget.month,
            salesBudget: budget.salesBudget,
            collectionsBudget: budget.collectionsBudget
          });
          budget.id = newRef.id;
        }
      });

      await batch.commit();
      showToast('Presupuestos guardados exitosamente', 'success');
    } catch (err) {
      console.error('Error saving budgets:', err);
      showToast('Error al guardar presupuestos', 'error');
    } finally {
      setSavingBudgets(false);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    emp.lastName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Budgets calculations
  const totalSalesBudget = employees
    .filter(e => ['vendedor', 'ambos'].includes(e.role))
    .reduce((sum, e) => sum + (budgets[e.id]?.salesBudget || 0), 0);
    
  const totalCollectionsBudget = employees
    .filter(e => ['cobrador', 'ambos'].includes(e.role))
    .reduce((sum, e) => sum + (budgets[e.id]?.collectionsBudget || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-500" />
            Directorio Comercial
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
            Gestiona el personal de ventas y cobranzas
          </p>
        </div>
        
        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('PERSONAL')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'PERSONAL' ? 'bg-white dark:bg-neutral-900 text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
          >
            Personal
          </button>
          <button
            onClick={() => setActiveTab('PRESUPUESTOS')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'PRESUPUESTOS' ? 'bg-white dark:bg-neutral-900 text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
          >
            Presupuestos Mensuales
          </button>
        </div>

        {activeTab === 'PERSONAL' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo Empleado
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {activeTab === 'PERSONAL' ? (
        <div className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar empleado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                No hay empleados registrados.
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-400 font-medium border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-2xl">Nombre</th>
                    <th className="px-6 py-4">Apellidos</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4 rounded-tr-2xl">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-neutral-900 dark:text-neutral-100">{employee.name}</td>
                      <td className="px-6 py-4 text-neutral-600 dark:text-neutral-400">{employee.lastName}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 capitalize">
                          {employee.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenModal(employee)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(employee.id)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm flex flex-col">
            <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800 p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <button 
                  onClick={() => { const [y, m] = currentMonth.split('-'); setCurrentMonth(format(subMonths(new Date(Number(y), Number(m) - 1, 15), 1), 'yyyy-MM')); }}
                  className="p-1.5 hover:bg-white dark:hover:bg-neutral-700 rounded-lg transition-colors"
                >
                  &larr;
                </button>
                <div className="flex items-center gap-2 px-3 font-medium text-neutral-900 dark:text-neutral-100">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span className="capitalize">{format(new Date(Number(currentMonth.split('-')[0]), Number(currentMonth.split('-')[1]) - 1, 15), 'MMMM yyyy', { locale: es })}</span>
                </div>
                <button 
                  onClick={() => { const [y, m] = currentMonth.split('-'); setCurrentMonth(format(addMonths(new Date(Number(y), Number(m) - 1, 15), 1), 'yyyy-MM')); }}
                  className="p-1.5 hover:bg-white dark:hover:bg-neutral-700 rounded-lg transition-colors"
                >
                  &rarr;
                </button>
              </div>

              <button
                onClick={handleSaveBudgets}
                disabled={savingBudgets}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {savingBudgets ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar Cambios
              </button>
            </div>
            
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-50 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-400 font-medium">
                  <tr>
                    <th className="px-4 py-3">Empleado / Supervisor</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3 text-right">Presupuesto Ventas</th>
                    <th className="px-4 py-3 text-right">Presupuesto Cobranza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {employees.map((emp) => {
                    const canSell = ['vendedor', 'ambos', 'supervisor_ventas', 'supervisor_general'].includes(emp.role);
                    const canCollect = ['cobrador', 'ambos', 'supervisor_cobranza', 'supervisor_general'].includes(emp.role);
                    const isSupervisor = emp.role.startsWith('supervisor');
                    
                    return (
                      <tr key={emp.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                          {emp.name} {emp.lastName}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 dark:text-neutral-400">
                            {emp.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canSell ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center justify-end">
                                <span className="text-neutral-500 mr-2">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={budgets[emp.id]?.salesBudget || ''}
                                  onChange={(e) => handleBudgetChange(emp.id, 'salesBudget', e.target.value)}
                                  className="w-28 px-3 py-1.5 text-right bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                  placeholder="0.00"
                                />
                              </div>
                              {isSupervisor && (
                                <span className="text-[9px] text-indigo-500 font-bold uppercase">Meta Personal</span>
                              )}
                            </div>
                          ) : (
                            <div className="text-right text-neutral-400 text-xs italic">N/A</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canCollect ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center justify-end">
                                <span className="text-neutral-500 mr-2">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={budgets[emp.id]?.collectionsBudget || ''}
                                  onChange={(e) => handleBudgetChange(emp.id, 'collectionsBudget', e.target.value)}
                                  className="w-28 px-3 py-1.5 text-right bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                  placeholder="0.00"
                                />
                              </div>
                              {isSupervisor && (
                                <span className="text-[9px] text-emerald-500 font-bold uppercase">Meta Personal</span>
                              )}
                            </div>
                          ) : (
                            <div className="text-right text-neutral-400 text-xs italic">N/A</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-sm p-6 text-white">
              <h3 className="text-indigo-100 text-sm font-medium mb-1">Presupuesto Global Ventas</h3>
              <div className="text-3xl font-bold mb-2">
                ${totalSalesBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-indigo-200 mb-4 bg-indigo-950/25 p-2 rounded-lg">
                La sumatoria de las metas personales define el Presupuesto Global. Los supervisores también asumen esta meta global.
              </p>
              <div className="space-y-3 pt-4 border-t border-indigo-400/30">
                {employees.filter(e => ['vendedor', 'ambos'].includes(e.role)).map(emp => {
                  const b = budgets[emp.id]?.salesBudget || 0;
                  if (b === 0) return null;
                  const pct = totalSalesBudget > 0 ? (b / totalSalesBudget) * 100 : 0;
                  return (
                    <div key={emp.id} className="text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-indigo-100 truncate pr-2">{emp.name} {emp.lastName}</span>
                        <span className="font-bold bg-indigo-950/40 px-2 py-0.5 rounded text-xs">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-indigo-950/30 rounded-full h-1.5">
                        <div className="bg-indigo-300 rounded-full h-1.5" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-sm p-6 text-white">
              <h3 className="text-emerald-100 text-sm font-medium mb-1">Presupuesto Global Cobranzas</h3>
              <div className="text-3xl font-bold mb-2">
                ${totalCollectionsBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-emerald-100 mb-4 bg-emerald-950/25 p-2.5 rounded-lg border border-emerald-400/20 leading-relaxed">
                La sumatoria de las metas personales define el Presupuesto Global. Los supervisores también asumen esta meta global.
              </p>
              <div className="space-y-3 pt-4 border-t border-emerald-400/30">
                {employees.filter(e => ['cobrador', 'ambos'].includes(e.role)).map(emp => {
                  const b = budgets[emp.id]?.collectionsBudget || 0;
                  if (b === 0) return null;
                  const pct = totalCollectionsBudget > 0 ? (b / totalCollectionsBudget) * 100 : 0;
                  return (
                    <div key={emp.id} className="text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-emerald-100 truncate pr-2">{emp.name} {emp.lastName}</span>
                        <span className="font-bold bg-emerald-950/40 px-2 py-0.5 rounded text-xs">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-emerald-950/30 rounded-full h-1.5">
                        <div className="bg-emerald-300 rounded-full h-1.5" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Empleado */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                {editingEmployee ? 'Editar Personal' : 'Nuevo Personal'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Nombres</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej. Juan Carlos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Apellidos</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej. Pérez Gómez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Rol Operativo</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as EmployeeRole })}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="cobrador">Cobrador</option>
                  <option value="ambos">Ambos (Vendedor y Cobrador)</option>
                  <option value="supervisor_ventas">Supervisor de Ventas</option>
                  <option value="supervisor_cobranza">Supervisor de Cobranza</option>
                  <option value="supervisor_general">Supervisor General (Ambos)</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
