import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { Warehouse, Article, WarehouseInventory } from '../../types/inventory';
import { Plus, Search, AlertTriangle, Edit3, Trash2, Home, User, ChevronDown, ChevronUp, Package, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function WarehousesTab() {
  const { user, profile } = useAuth();
  const { showToast, showAlert, showConfirm } = useNotification();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [inventories, setInventories] = useState<WarehouseInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWarehouseId, setExpandedWarehouseId] = useState<string | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    assignedPerson: ''
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentEnterpriseId = profile?.role === 'BODEGUERO' ? profile?.enterpriseId : user?.uid;

  useEffect(() => {
    if (currentEnterpriseId) {
      fetchData();
    }
  }, [currentEnterpriseId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Fetch warehouses
      const whQ = query(collection(db, 'warehouses'), where('userId', '==', currentEnterpriseId));
      const whSnap = await getDocs(whQ);
      const whList = whSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warehouse));
      setWarehouses(whList);

      // Fetch articles
      const artQ = query(collection(db, 'articles'), where('userId', '==', currentEnterpriseId));
      const artSnap = await getDocs(artQ);
      const artList = artSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
      setArticles(artList);

      // Fetch warehouse inventories
      const invQ = query(collection(db, 'warehouse_inventory'), where('userId', '==', currentEnterpriseId));
      const invSnap = await getDocs(invQ);
      const invList = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WarehouseInventory));
      setInventories(invList);

      // Auto-expand first warehouse if exists
      if (whList.length > 0 && !expandedWarehouseId) {
        setExpandedWarehouseId(whList[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching warehouse data:', err);
      setError('No se pudieron cargar las bodegas e inventarios.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (warehouse?: Warehouse) => {
    setError('');
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setFormData({
        name: warehouse.name,
        assignedPerson: warehouse.assignedPerson
      });
    } else {
      setEditingWarehouse(null);
      setFormData({
        name: '',
        assignedPerson: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEnterpriseId) return;

    if (!formData.name.trim()) {
      setError('El nombre de la bodega es obligatorio.');
      return;
    }

    if (!formData.assignedPerson.trim()) {
      setError('La persona asignada a la bodega es obligatoria.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (editingWarehouse) {
        const whRef = doc(db, 'warehouses', editingWarehouse.id);
        await updateDoc(whRef, {
          name: formData.name.trim(),
          assignedPerson: formData.assignedPerson.trim()
        });
      } else {
        await addDoc(collection(db, 'warehouses'), {
          name: formData.name.trim(),
          assignedPerson: formData.assignedPerson.trim(),
          userId: currentEnterpriseId,
          createdAt: Timestamp.now()
        });
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving warehouse:', err);
      setError('Error al guardar la bodega. Intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Check if warehouse has active inventory items
    const hasItems = inventories.some(inv => inv.warehouseId === id && inv.quantity > 0);
    if (hasItems) {
      showAlert('Bodega Activa', 'No se puede eliminar una bodega que contiene artículos con stock activo. Transfiera o de de baja los artículos primero.', 'warning');
      return;
    }

    if (!(await showConfirm('Eliminar Bodega', '¿Está seguro de eliminar esta bodega?', { type: 'danger' }))) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'warehouses', id));
      
      // Clear associated empty inventory docs if any
      const q = query(collection(db, 'warehouse_inventory'), where('warehouseId', '==', id));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      if (expandedWarehouseId === id) {
        setExpandedWarehouseId(null);
      }
      fetchData();
      showToast('Bodega eliminada exitosamente', 'success');
    } catch (err: any) {
      console.error('Error deleting warehouse:', err);
      setError('Error al eliminar la bodega.');
      showToast('Error al eliminar la bodega', 'error');
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedWarehouseId(expandedWarehouseId === id ? null : id);
  };

  // Get articles and their quantities for a specific warehouse
  const getWarehouseStock = (warehouseId: string) => {
    return inventories
      .filter(inv => inv.warehouseId === warehouseId && inv.quantity > 0)
      .map(inv => {
        const article = articles.find(art => art.id === inv.articleId);
        return {
          articleId: inv.articleId,
          name: article ? article.name : 'Artículo Desconocido',
          series: article?.series || '',
          quantity: inv.quantity,
          minStockAlert: article?.minStockAlert || 0
        };
      });
  };

  const uniqueWarehouseNames = Array.from(new Set(warehouses.map(w => w.name).filter(Boolean))).sort() as string[];
  const uniqueAssignedPersons = Array.from(new Set(warehouses.map(w => w.assignedPerson).filter(Boolean))).sort() as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Bodegas Activas</h2>
          <p className="text-xs text-neutral-400 font-medium">Asigna encargados y consulta los inventarios específicos por sucursal o almacén.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Bodega</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-xs font-semibold text-neutral-500">Cargando bodegas...</p>
        </div>
      ) : warehouses.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Home className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-sm font-bold text-neutral-950 dark:text-neutral-50">No hay bodegas registradas</h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto">
            Crea tu primera bodega y asígnale un responsable directo para poder almacenar tu stock y transferir mercadería.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {warehouses.map(wh => {
            const isExpanded = expandedWarehouseId === wh.id;
            const stockItems = getWarehouseStock(wh.id);
            const totalItemsCount = stockItems.reduce((acc, item) => acc + item.quantity, 0);

            return (
              <div 
                key={wh.id}
                className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm transition-all"
              >
                {/* Header Panel */}
                <div 
                  onClick={() => toggleExpand(wh.id)}
                  className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-neutral-800/10 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                      <Home className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-neutral-950 dark:text-neutral-50 uppercase tracking-tight">{wh.name}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-neutral-400 font-semibold">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-neutral-400" />
                          Encargado: <strong className="text-neutral-600 dark:text-neutral-300 uppercase">{wh.assignedPerson}</strong>
                        </span>
                        <span className="h-3 w-px bg-neutral-200 dark:bg-neutral-700 hidden sm:block"></span>
                        <span className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-neutral-400" />
                          Total Artículos: <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">{totalItemsCount}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(wh);
                      }}
                      className="p-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-indigo-600 dark:text-neutral-400 dark:hover:text-indigo-400 rounded-xl transition-all"
                      title="Editar bodega"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(wh.id);
                      }}
                      className="p-2.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 rounded-xl transition-all"
                      title="Eliminar bodega"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="p-2 text-neutral-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Inventory List */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/10 dark:bg-neutral-900/20">
                    <div className="pt-4">
                      <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">Inventario Activo en esta Bodega</h4>
                      
                      {stockItems.length === 0 ? (
                        <p className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 italic py-4">Esta bodega está actualmente vacía de stock.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {stockItems.map(item => {
                            const isLowStock = item.quantity <= item.minStockAlert;
                            return (
                              <div 
                                key={item.articleId}
                                className="flex items-center justify-between p-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-neutral-50 dark:bg-neutral-800 rounded-lg flex items-center justify-center text-neutral-400">
                                    <Package className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold text-neutral-950 dark:text-neutral-50 block uppercase tracking-tight">{item.name}</span>
                                    {item.series && (
                                      <span className="text-[10px] font-mono text-neutral-400 uppercase">S/N: {item.series}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isLowStock && (
                                    <span className="p-1 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-lg" title="¡Stock bajo!">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  <span className={cn(
                                    "px-3 py-1 text-xs font-black rounded-lg min-w-10 text-center",
                                    isLowStock
                                      ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                                      : "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400"
                                  )}>
                                    {item.quantity} uds
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-250">
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-250">
            <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Home className="w-5 h-5" />
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {editingWarehouse ? 'Editar Bodega' : 'Nueva Bodega'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-indigo-700 rounded-full text-white/80 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Nombre de la Bodega *</label>
                  <input
                    type="text"
                    required
                    list="warehouse-names-list"
                    placeholder="Ej. Bodega Central, Bodega Sur"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase"
                  />
                  <datalist id="warehouse-names-list">
                    {uniqueWarehouseNames.map(whName => (
                      <option key={whName} value={whName} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Persona Asignada / Responsable *</label>
                  <input
                    type="text"
                    required
                    list="assigned-persons-list"
                    placeholder="Ej. Juan Pérez"
                    value={formData.assignedPerson}
                    onChange={(e) => setFormData({ ...formData, assignedPerson: e.target.value })}
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase"
                  />
                  <datalist id="assigned-persons-list">
                    {uniqueAssignedPersons.map(person => (
                      <option key={person} value={person} />
                    ))}
                  </datalist>
                  <p className="text-[10px] text-neutral-400 font-medium mt-1">Obligatorio. Persona encargada de recibir o despachar mercaderías en esta bodega.</p>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : 'Guardar Bodega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
