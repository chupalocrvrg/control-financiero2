import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { Warehouse, Article, WarehouseInventory, Transfer } from '../../types/inventory';
import { ArticleSelector } from './ArticleSelector';
import { executeTransfer, revertTransfer } from '../../lib/inventory-db';
import { ArrowLeftRight, AlertTriangle, Plus, Trash2, Calendar, FileText, Check, HelpCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';

interface TransferItemRow {
  articleId: string;
  name?: string;
  quantity: number;
  seriesList?: string[];
}

export default function TransfersTab() {
  const { user, profile } = useAuth();
  const { showToast, showConfirm } = useNotification();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [inventories, setInventories] = useState<WarehouseInventory[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [reason, setReason] = useState('TRASLADO');
  const [comment, setComment] = useState('');
  const [transferItems, setTransferItems] = useState<TransferItemRow[]>([{ articleId: '', quantity: 1 }]);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Revert states
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertItemId, setRevertItemId] = useState<string | null>(null);
  const [revertComment, setRevertComment] = useState('');

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

      // Fetch past transfers
      const transQ = query(collection(db, 'transfers'), where('userId', '==', currentEnterpriseId));
      const transSnap = await getDocs(transQ);
      const transList = transSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp)
        } as unknown as Transfer;
      }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setTransfers(transList);

      // Set defaults for form
      if (whList.length > 1) {
        setFromWarehouseId(whList[0].id);
        setToWarehouseId(whList[1].id);
      } else if (whList.length > 0) {
        setFromWarehouseId(whList[0].id);
      }
    } catch (err: any) {
      console.error('Error loading transfer data:', err);
      setError('No se pudieron cargar los datos de transferencias.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItemRow = () => {
    setTransferItems([...transferItems, { articleId: '', quantity: 1 }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (transferItems.length === 1) return;
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof TransferItemRow, value: any) => {
    const updated = [...transferItems];
    updated[index] = { ...updated[index], [field]: value };
    setTransferItems(updated);
  };

  // Get current stock for an article in the selected source warehouse
  const getAvailableStock = (articleId: string, warehouseId: string): number => {
    if (!articleId || !warehouseId) return 0;
    const inv = inventories.find(i => i.warehouseId === warehouseId && i.articleId === articleId);
    return inv ? inv.quantity : 0;
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentEnterpriseId) return;

    if (!fromWarehouseId || !toWarehouseId) {
      setError('Debe seleccionar la bodega de origen y la bodega de destino.');
      return;
    }

    if (fromWarehouseId === toWarehouseId) {
      setError('La bodega de origen y destino no pueden ser la misma.');
      return;
    }

    // Validate articles list
    if (transferItems.some(item => !item.articleId)) {
      setError('Por favor seleccione un artículo en cada fila.');
      return;
    }

    // Validate quantities and stock availability
    for (const item of transferItems) {
      if (item.quantity <= 0) {
        setError('Las cantidades a transferir deben ser mayores a 0.');
        return;
      }

      const available = getAvailableStock(item.articleId, fromWarehouseId);
      if (item.quantity > available) {
        const articleName = articles.find(a => a.id === item.articleId)?.name || 'Artículo';
        setError(`Stock insuficiente para "${articleName}". Disponible en bodega de origen: ${available} uds.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      await executeTransfer(
        currentEnterpriseId,
        fromWarehouseId,
        toWarehouseId,
        transferItems,
        reason,
        comment.trim()
      );

      setSuccess('¡Transferencia ejecutada de manera exitosa!');
      setComment('');
      setTransferItems([{ articleId: '', quantity: 1 }]);
      
      // Refresh data
      await fetchData();
    } catch (err: any) {
      console.error('Error processing transfer:', err);
      setError('Hubo un error al realizar la transferencia. Intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransfer = (transferId: string) => {
    setRevertItemId(transferId);
    setRevertComment('');
    setRevertModalOpen(true);
  };

  const handleConfirmRevert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revertItemId) return;
    if (!revertComment.trim()) {
      showToast('Debe ingresar un motivo para la eliminación.', 'error');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await revertTransfer(revertItemId, currentEnterpriseId || '', revertComment.trim());
      showToast('Movimiento de transferencia eliminado y stock revertido correctamente.', 'success');
      setRevertModalOpen(false);
      setRevertItemId(null);
      await fetchData();
    } catch (err: any) {
      console.error('Error deleting transfer:', err);
      showToast(err.message || 'Error al eliminar el movimiento.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const safeFormatDate = (date: any) => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return format(d, 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Transfer execution form */}
      <div className="lg:col-span-5 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm h-fit">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-neutral-900 dark:text-neutral-50 uppercase tracking-tight">Nueva Transferencia</h3>
            <p className="text-[10px] text-neutral-400 font-semibold uppercase">Mueve stock de forma inmediata entre bodegas.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {warehouses.length < 2 ? (
          <div className="p-6 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded-2xl text-yellow-800 dark:text-yellow-400 text-xs font-medium space-y-2">
            <p className="font-bold uppercase tracking-wider">Se requieren al menos 2 bodegas</p>
            <p>Para poder realizar transferencias, necesitas crear por lo menos dos bodegas activas en el sistema.</p>
          </div>
        ) : (
          <form onSubmit={handleTransferSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Bodega de Origen</label>
                <select
                  value={fromWarehouseId}
                  onChange={(e) => setFromWarehouseId(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all font-bold"
                >
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.assignedPerson})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Bodega de Destino</label>
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all font-bold"
                >
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.assignedPerson})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2">Razón de la Transferencia</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all font-black uppercase tracking-wider"
              >
                <option value="TRASLADO">TRASLADO DE STOCK</option>
                <option value="PRÉSTAMO">PRÉSTAMO INTERNO</option>
                <option value="DEVOLUCIÓN">DEVOLUCIÓN DE ARTÍCULOS</option>
                <option value="REPOSICIÓN">REPOSICIÓN DE STOCK</option>
                <option value="OTRO">OTRA RAZÓN</option>
              </select>
            </div>

            {/* Articles List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Artículos a transferir</label>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir Artículo
                </button>
              </div>

              <div className="space-y-3">
                {transferItems.map((item, index) => {
                  const available = getAvailableStock(item.articleId, fromWarehouseId);
                  return (
                    <div key={index} className="flex gap-2 items-start bg-neutral-50 dark:bg-neutral-800/30 p-3 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                      <div className="flex-1">
                        <ArticleSelector 
                          articles={articles}
                          inventories={inventories}
                          warehouseId={fromWarehouseId}
                          articleId={item.articleId}
                          quantity={item.quantity}
                          selectedSeries={item.seriesList || []}
                          onChangeArticle={(id) => handleItemChange(index, 'articleId', id)}
                          onChangeQuantity={(qty) => handleItemChange(index, 'quantity', qty)}
                          onChangeSeries={(series) => handleItemChange(index, 'seriesList', series)}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(index)}
                        disabled={transferItems.length === 1}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Comentario / Justificación *</label>
              <textarea
                required
                rows={3}
                placeholder="Explique detalladamente la razón de este movimiento de mercancías..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:shadow-indigo-500/15 transition-all disabled:opacity-50"
            >
              {submitting ? 'Procesando Transferencia...' : 'Confirmar Transferencia'}
            </button>
          </form>
        )}
      </div>

      {/* Transfer History / Report */}
      <div className="lg:col-span-7 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-neutral-900 dark:text-neutral-50 uppercase tracking-tight">Historial de Transferencias</h3>
            <p className="text-[10px] text-neutral-400 font-semibold uppercase">Registro detallado y firmas temporales para auditorías.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold text-neutral-500">Cargando registros...</p>
          </div>
        ) : transfers.length === 0 ? (
          <div className="py-12 text-center text-neutral-400 italic text-sm">
            No se han registrado transferencias de mercancías todavía.
          </div>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {transfers.map(trans => {
              const isDeleted = trans.status === 'ELIMINADO';
              return (
                <div 
                  key={trans.id}
                  className={cn(
                    "rounded-2xl border p-5 space-y-4 shadow-sm transition-all",
                    isDeleted
                      ? "bg-red-50/10 dark:bg-red-950/5 border-red-200/50 dark:border-red-900/30 opacity-75"
                      : "bg-neutral-50 dark:bg-neutral-800/20 border-neutral-100 dark:border-neutral-800"
                  )}
                >
                  {/* Meta Header */}
                  <div className="flex flex-wrap justify-between items-start gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2.5 py-0.5 text-[9px] font-black rounded-full uppercase tracking-widest",
                          trans.reason === 'PRÉSTAMO' ? "bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400" :
                          trans.reason === 'DEVOLUCIÓN' ? "bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 dark:text-yellow-400" :
                          "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400"
                        )}>
                          {trans.reason}
                        </span>
                        {isDeleted && (
                          <span className="px-2.5 py-0.5 text-[9px] font-black bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full uppercase tracking-widest animate-pulse">
                            ELIMINADO / REVERTIDO
                          </span>
                        )}
                        <span className="text-xs text-neutral-400 font-mono">ID: {trans.id.substring(0, 8)}</span>
                      </div>
                      <div className={cn(
                        "text-xs font-black uppercase tracking-tight",
                        isDeleted ? "text-neutral-500 line-through" : "text-neutral-900 dark:text-neutral-100"
                      )}>
                        De: <strong className="text-indigo-600 dark:text-indigo-400">{trans.fromWarehouseName}</strong> → A: <strong className="text-indigo-600 dark:text-indigo-400">{trans.toWarehouseName}</strong>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-bold uppercase tracking-tight">
                      <Calendar className="w-3.5 h-3.5" />
                      {safeFormatDate(trans.timestamp)}
                    </div>
                  </div>

                  {/* Articles List */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">Artículos Movilizados</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {trans.articles.map((art, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-800 rounded-xl text-xs">
                          <div className="truncate pr-2">
                            <span className={cn(
                              "font-bold uppercase block truncate",
                              isDeleted ? "text-neutral-400 line-through" : "text-neutral-800 dark:text-neutral-200"
                            )}>{art.name}</span>
                            {art.series && <span className="text-[9px] font-mono text-neutral-400 uppercase">S/N: {art.series}</span>}
                          </div>
                          <span className={cn(
                            "px-2 py-1 font-black rounded-lg text-[10px]",
                            isDeleted
                              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                              : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                          )}>
                            {art.quantity} uds
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Comment Section */}
                  <div className="p-3.5 bg-neutral-100 dark:bg-neutral-800/40 rounded-xl text-xs text-neutral-600 dark:text-neutral-300">
                    <p className="font-bold uppercase text-[9px] text-neutral-400 mb-1">Comentarios</p>
                    <p className="font-medium leading-relaxed">{trans.comment}</p>
                  </div>

                  {/* Revert Reason / Revert Action */}
                  {isDeleted ? (
                    <div className="p-3.5 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl text-xs text-red-600 dark:text-red-400">
                      <p className="font-bold uppercase text-[9px] mb-1">Motivo de Eliminación</p>
                      <p className="font-semibold leading-relaxed">{trans.revertReason || 'Sin motivo registrado'}</p>
                    </div>
                  ) : (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => handleDeleteTransfer(trans.id)}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/10 px-3 py-1.5 rounded-xl transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar Movimiento
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Revert Reason Modal */}
      {revertModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-red-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-lg font-black uppercase tracking-tight">Eliminar Movimiento</h3>
              </div>
              <button 
                onClick={() => setRevertModalOpen(false)}
                className="p-1 hover:bg-red-700 rounded-full text-white/85 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRevert} className="p-8 space-y-4">
              <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                Esta acción revertirá los saldos de los artículos en las bodegas correspondientes (sumando y restando el stock según corresponda) y marcará este movimiento como <strong className="text-red-600 dark:text-red-400 font-bold">ELIMINADO / REVERTIDO</strong> en el log.
              </p>

              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">
                  Motivo o Razón de la Eliminación *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej. Se seleccionó la bodega equivocada por error del digitador."
                  value={revertComment}
                  onChange={(e) => setRevertComment(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10 text-neutral-900 dark:text-neutral-50 transition-all"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setRevertModalOpen(false)}
                  className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Sí, revertir y eliminar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
