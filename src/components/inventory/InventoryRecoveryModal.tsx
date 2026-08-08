import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { Warehouse, Article } from '../../types/inventory';
import { Wrench, X, Link, Plus, Trash2, AlertTriangle, Check, Package, Sparkles, Search } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export interface OrphanItem {
  id: string; // warehouse_inventory doc ID
  warehouseId: string;
  articleId: string;
  quantity: number;
}

interface InventoryRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orphanInventories: OrphanItem[];
  warehouses: Warehouse[];
  articles: Article[];
  initialSelectedInvId?: string | null;
  onSuccess: () => void;
  currentEnterpriseId: string;
  userId: string;
}

export default function InventoryRecoveryModal({
  isOpen,
  onClose,
  orphanInventories,
  warehouses,
  articles,
  initialSelectedInvId,
  onSuccess,
  currentEnterpriseId,
  userId
}: InventoryRecoveryModalProps) {
  const { showToast } = useNotification();
  const [selectedInvId, setSelectedInvId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'link' | 'create'>('link');
  const [targetArticle, setTargetArticle] = useState<Article | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = articles.filter(art => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameStr = (art.name || (art as any).computedName || '').toLowerCase();
    const catStr = (art.category || '').toLowerCase();
    const brandStr = (art.brand || '').toLowerCase();
    const modelStr = (art.model || '').toLowerCase();
    return nameStr.includes(q) || catStr.includes(q) || brandStr.includes(q) || modelStr.includes(q);
  });
  
  // New Article Form
  const [newArtData, setNewArtData] = useState({
    category: '',
    brand: '',
    model: '',
    barcode: '',
    minStockAlert: 5
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialSelectedInvId && orphanInventories.some(inv => inv.id === initialSelectedInvId)) {
      setSelectedInvId(initialSelectedInvId);
    } else if (orphanInventories.length > 0) {
      setSelectedInvId(orphanInventories[0].id);
    }
  }, [initialSelectedInvId, orphanInventories]);

  if (!isOpen) return null;

  const currentOrphan = orphanInventories.find(inv => inv.id === selectedInvId) || orphanInventories[0];
  const currentWarehouse = warehouses.find(w => w.id === currentOrphan?.warehouseId);

  const handleLinkExisting = async () => {
    if (!currentOrphan) {
      setError('No hay registro huérfano seleccionado.');
      return;
    }
    if (!targetArticle) {
      setError('Seleccione un artículo existente del catálogo.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Check if target warehouse_inventory doc already exists for this (warehouseId, targetArticle.id)
      const targetInvId = `${currentOrphan.warehouseId}_${targetArticle.id}`;
      const targetInvRef = doc(db, 'warehouse_inventory', targetInvId);
      const targetInvSnap = await getDoc(targetInvRef);

      if (targetInvSnap.exists()) {
        const existingData = targetInvSnap.data();
        const currentQty = existingData.quantity || 0;
        await updateDoc(targetInvRef, {
          quantity: currentQty + currentOrphan.quantity,
          updatedAt: Timestamp.now()
        });
      } else {
        await setDoc(targetInvRef, {
          warehouseId: currentOrphan.warehouseId,
          articleId: targetArticle.id,
          quantity: currentOrphan.quantity,
          enterpriseId: currentEnterpriseId,
          userId: currentEnterpriseId,
          createdBy: userId,
          createdAt: Timestamp.now()
        });
      }

      // Delete old orphan doc
      const oldInvRef = doc(db, 'warehouse_inventory', currentOrphan.id);
      await deleteDoc(oldInvRef);

      showToast(`Stock de ${currentOrphan.quantity} uds reasignado exitosamente a "${targetArticle.name}"`, 'success');
      onSuccess();
      if (orphanInventories.length <= 1) {
        onClose();
      }
    } catch (err: any) {
      console.error('Error linking article:', err);
      setError('Error al reasignar el artículo. Intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrphan) return;

    const computedName = `${newArtData.category.trim()} ${newArtData.brand.trim()} ${newArtData.model.trim()}${newArtData.barcode.trim() ? ' ' + newArtData.barcode.trim() : ''}`.trim().replace(/\s+/g, ' ');

    if (!computedName) {
      setError('Ingrese al menos la categoría, marca o modelo para nombrar el nuevo artículo.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Create new article doc in 'articles' collection
      const artRef = await addDoc(collection(db, 'articles'), {
        name: computedName,
        category: newArtData.category.trim(),
        brand: newArtData.brand.trim(),
        model: newArtData.model.trim(),
        barcode: newArtData.barcode.trim(),
        minStockAlert: Number(newArtData.minStockAlert) || 5,
        quantity: 0,
        enterpriseId: currentEnterpriseId,
        userId: currentEnterpriseId,
        createdBy: userId,
        createdAt: Timestamp.now()
      });

      // Link to warehouse_inventory
      const targetInvId = `${currentOrphan.warehouseId}_${artRef.id}`;
      await setDoc(doc(db, 'warehouse_inventory', targetInvId), {
        warehouseId: currentOrphan.warehouseId,
        articleId: artRef.id,
        quantity: currentOrphan.quantity,
        enterpriseId: currentEnterpriseId,
        userId: currentEnterpriseId,
        createdBy: userId,
        createdAt: Timestamp.now()
      });

      // Delete old orphan doc if different
      if (currentOrphan.id !== targetInvId) {
        await deleteDoc(doc(db, 'warehouse_inventory', currentOrphan.id));
      }

      showToast(`Artículo "${computedName}" creado y vinculado con ${currentOrphan.quantity} uds`, 'success');
      onSuccess();
      if (orphanInventories.length <= 1) {
        onClose();
      }
    } catch (err: any) {
      console.error('Error creating & linking article:', err);
      setError('Error al crear el artículo y vincularlo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOrphan = async () => {
    if (!currentOrphan) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'warehouse_inventory', currentOrphan.id));
      showToast('Registro huérfano eliminado correctamente', 'success');
      onSuccess();
      if (orphanInventories.length <= 1) {
        onClose();
      }
    } catch (err: any) {
      console.error('Error deleting orphan:', err);
      setError('Error al eliminar el registro huérfano.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 max-w-xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-amber-500 text-white flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-5 h-5" />
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">Herramienta de Autorrecuperación</h3>
              <p className="text-[10px] text-amber-100 font-medium">Repara o vincula registros de stock con artículos reales del catálogo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-amber-600 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {orphanInventories.length === 0 ? (
            <div className="text-center py-8">
              <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h4 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">¡Todo está en orden!</h4>
              <p className="text-xs text-neutral-500 mt-1">No hay registros huérfanos pendientes de reparación.</p>
            </div>
          ) : (
            <>
              {/* Selector for orphan item */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Seleccionar Registro Huérfano ({orphanInventories.length} detectados):
                </label>
                <select
                  value={selectedInvId}
                  onChange={(e) => setSelectedInvId(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {orphanInventories.map(inv => {
                    const wh = warehouses.find(w => w.id === inv.warehouseId);
                    return (
                      <option key={inv.id} value={inv.id}>
                        Bodega: "{wh?.name || 'Desconocida'}" — Cantidad: {inv.quantity} uds — (ID Inexistente: {inv.articleId})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Summary Card of selected orphan */}
              {currentOrphan && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest block">Bodega de Destino</span>
                    <strong className="text-sm font-black text-neutral-900 dark:text-neutral-100 uppercase">{currentWarehouse?.name || 'Desconocida'}</strong>
                    <span className="text-xs font-mono text-neutral-500 block mt-0.5">ID Huérfano: {currentOrphan.articleId}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block">Stock Afectado</span>
                    <span className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-black">
                      {currentOrphan.quantity} uds
                    </span>
                  </div>
                </div>
              )}

              {/* Tabs: Link existing vs Create new */}
              <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('link')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'link'
                      ? 'bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <Link className="w-3.5 h-3.5" />
                  <span>Vincular Artículo Existente</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'create'
                      ? 'bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear Nuevo Artículo y Vincular</span>
                </button>
              </div>

              {/* Tab 1: Link Existing */}
              {activeTab === 'link' && (
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-2">
                      Buscar y seleccionar un artículo válido del catálogo:
                    </label>
                    <div className="relative mb-2">
                      <Search className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre, marca o modelo..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                      {filteredArticles.length === 0 ? (
                        <p className="p-4 text-xs font-medium text-neutral-400 text-center">No se encontraron artículos que coincidan con la búsqueda.</p>
                      ) : (
                        filteredArticles.map(art => {
                          const artName = art.name || (art as any).computedName || [art.category, art.brand, art.model].filter(Boolean).join(' ') || 'Artículo sin Nombre';
                          const isSelected = targetArticle?.id === art.id;
                          return (
                            <div
                              key={art.id}
                              onClick={() => setTargetArticle(art)}
                              className={`p-3 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                isSelected 
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-800 dark:text-neutral-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                                <div>
                                  <span className="block font-bold">{artName}</span>
                                  {(art.category || art.brand || art.model) && (
                                    <span className="text-[10px] text-neutral-400">
                                      {[art.category, art.brand, art.model].filter(Boolean).join(' • ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {targetArticle && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      <span>
                        Se asignará el stock de {currentOrphan?.quantity} uds al producto: <strong>"{targetArticle.name || (targetArticle as any).computedName}"</strong>
                      </span>
                    </div>
                  )}

                  <div className="pt-2 flex justify-between items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDeleteOrphan}
                      disabled={submitting}
                      className="px-4 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Este Registro</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLinkExisting}
                      disabled={submitting || !targetArticle}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>{submitting ? 'Viculando...' : 'Guardar y Vincular'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Create New */}
              {activeTab === 'create' && (
                <form onSubmit={handleCreateAndLink} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Categoría</label>
                      <input
                        type="text"
                        placeholder="Ej: Laptops, Impresoras"
                        value={newArtData.category}
                        onChange={(e) => setNewArtData({ ...newArtData, category: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Marca</label>
                      <input
                        type="text"
                        placeholder="Ej: HP, Dell, Samsung"
                        value={newArtData.brand}
                        onChange={(e) => setNewArtData({ ...newArtData, brand: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Modelo</label>
                      <input
                        type="text"
                        placeholder="Ej: Pavilion 15, G50"
                        value={newArtData.model}
                        onChange={(e) => setNewArtData({ ...newArtData, model: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Código de Barras (Opcional)</label>
                      <input
                        type="text"
                        placeholder="Ej: 786123456789"
                        value={newArtData.barcode}
                        onChange={(e) => setNewArtData({ ...newArtData, barcode: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Stock Mínimo de Alerta</label>
                    <input
                      type="number"
                      min="1"
                      value={newArtData.minStockAlert}
                      onChange={(e) => setNewArtData({ ...newArtData, minStockAlert: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="pt-2 flex justify-between items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDeleteOrphan}
                      disabled={submitting}
                      className="px-4 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Este Registro</span>
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{submitting ? 'Creando...' : 'Crear y Vincular Stock'}</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
