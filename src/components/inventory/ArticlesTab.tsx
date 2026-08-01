import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { Article, Warehouse } from '../../types/inventory';
import { Plus, Search, AlertTriangle, Edit3, Trash2, Package, Eye, Tag, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { adjustStockAndGlobalQuantity } from '../../lib/inventory-db';

export default function ArticlesTab() {
  const { user, profile } = useAuth();
  const { showToast, showConfirm } = useNotification();
  const [articles, setArticles] = useState<Article[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [matchedArticle, setMatchedArticle] = useState<Article | null>(null);
  const [formData, setFormData] = useState({
    category: '',
    brand: '',
    model: '',
    barcode: '',
    requiresSeries: false,
    seriesInput: '',
    minStockAlert: "5" as string | number,
    initialQuantity: "" as string | number,
    initialWarehouseId: ''
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
      
      // Fetch articles
      const artQ = query(collection(db, 'articles'), where('userId', '==', currentEnterpriseId));
      const artSnap = await getDocs(artQ);
      const artList = artSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
      setArticles(artList);

      // Fetch warehouses for initial assignment options
      const whQ = query(collection(db, 'warehouses'), where('userId', '==', currentEnterpriseId));
      const whSnap = await getDocs(whQ);
      const whList = whSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warehouse));
      setWarehouses(whList);
    } catch (err: any) {
      console.error('Error fetching inventory articles:', err);
      setError('No se pudieron cargar los artículos del inventario.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (article?: Article) => {
    setError('');
    if (article) {
      setEditingArticle(article);
      setFormData({
        category: '',
        brand: '',
        model: '',
        barcode: '',
        minStockAlert: 5,
        initialQuantity: 0,
        initialWarehouseId: warehouses[0]?.id || '',
        requiresSeries: false,
        seriesInput: ''
      });
    }
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (editingArticle || !isModalOpen) {
      setMatchedArticle(null);
      return;
    }
    
    let match = null;
    if (formData.barcode && formData.barcode.trim()) {
      match = articles.find(a => a.barcode?.toLowerCase() === formData.barcode.trim().toLowerCase()) || null;
    } 
    if (!match && formData.model && formData.brand && formData.model.trim() && formData.brand.trim()) {
      match = articles.find(a => a.model?.toLowerCase() === formData.model.trim().toLowerCase() && a.brand?.toLowerCase() === formData.brand.trim().toLowerCase()) || null;
    }

    if (match) {
      setMatchedArticle(match);
      setFormData(prev => ({
        ...prev,
        category: prev.category || match!.category || '',
        brand: prev.brand || match!.brand || '',
        model: prev.model || match!.model || '',
        barcode: prev.barcode || match!.barcode || '',
        requiresSeries: match!.requiresSeries || false
      }));
    } else {
      setMatchedArticle(null);
    }
  }, [formData.barcode, formData.model, formData.brand, articles, editingArticle, isModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEnterpriseId) return;

    if (matchedArticle && !editingArticle) {
      const confirmed = await showConfirm(
        'Código de barras / Artículo ya registrado',
        `El artículo con este código de barras o datos ya está registrado como "${matchedArticle.name}". ¿Desea sumar el nuevo ingreso a dicho producto? (Esto evitará duplicados)`,
        { type: 'warning', confirmText: 'Sí, sumar stock', cancelText: 'No, cancelar' }
      );
      if (!confirmed) {
        return;
      }
    }

if (!formData.category.trim()) {
      setError('La categoría es obligatoria.');
      return;
    }

    if (!formData.brand.trim()) {
      setError('La marca es obligatoria.');
      return;
    }

    if (!formData.model.trim()) {
      setError('El modelo es obligatorio.');
      return;
    }

    if (formData.minStockAlert < 0) {
      setError('El umbral de alerta debe ser un número igual o mayor a 0.');
      return;
    }

    if (!editingArticle && !formData.initialWarehouseId) {
      setError('Debe seleccionar la bodega de destino inicial obligatoriamente.');
      return;
    }

    setSubmitting(true);
    setError('');

    
    let seriesArray: string[] = [];
    if (formData.requiresSeries) {
      seriesArray = formData.seriesInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const targetQuantity = editingArticle ? editingArticle.quantity : Number(formData.initialQuantity || 0);
      if (seriesArray.length !== targetQuantity && formData.initialQuantity > 0) {
        setError(`Debe ingresar exactamente ${targetQuantity} series (una por artículo). Actual: ${seriesArray.length}`);
        setSubmitting(false);
        return;
      }
    }
    const computedName = `${formData.category.trim()} ${formData.brand.trim()} ${formData.model.trim()}${formData.barcode.trim() ? ' ' + formData.barcode.trim() : ''}`.trim().replace(/\s+/g, ' ');

    try {
      if (editingArticle) {
        // Edit article attributes (excluding quantity here to preserve history/transfer accuracy)
        const artRef = doc(db, 'articles', editingArticle.id);
        await updateDoc(artRef, {
          name: computedName,
          category: formData.category.trim(),
          brand: formData.brand.trim(),
          model: formData.model.trim(),
          requiresSeries: formData.requiresSeries,
          seriesList: seriesArray,
          barcode: formData.barcode.trim(),
          minStockAlert: Number(formData.minStockAlert)
        });
      } else {
        // Create new article or update existing
        const batch = writeBatch(db);
        let artId = '';
        let currentArtSeries: string[] = [];

        if (matchedArticle) {
          artId = matchedArticle.id;
          currentArtSeries = matchedArticle.seriesList || [];
          
          const artRef = doc(db, 'articles', artId);
          batch.update(artRef, {
            quantity: matchedArticle.quantity + Number(formData.initialQuantity || 0),
            seriesList: [...currentArtSeries, ...seriesArray]
          });
        } else {
          const artRef = doc(collection(db, 'articles'));
          artId = artRef.id;
          const newArticle = {
            name: computedName,
            category: formData.category.trim(),
            brand: formData.brand.trim(),
            model: formData.model.trim(),
            requiresSeries: formData.requiresSeries,
            seriesList: seriesArray,
            barcode: formData.barcode.trim(),
            minStockAlert: Number(formData.minStockAlert),
            quantity: Number(formData.initialQuantity || 0),
            userId: currentEnterpriseId,
            createdAt: Timestamp.now()
          };
          batch.set(artRef, newArticle);
        }

        const invId = `${formData.initialWarehouseId}_${artId}`;
        const invRef = doc(db, 'warehouse_inventory', invId);
        
        // We need to know if warehouse_inventory exists to update it, but we are doing it in a batch...
        // Let's do it right before batch:
        const { getDoc } = await import('firebase/firestore');
        const invSnap = await getDoc(invRef);
        
        if (invSnap.exists()) {
          const existingInv = invSnap.data();
          batch.update(invRef, {
            quantity: existingInv.quantity + Number(formData.initialQuantity || 0),
            seriesList: [...(existingInv.seriesList || []), ...seriesArray]
          });
        } else {
          batch.set(invRef, {
            id: invId,
            warehouseId: formData.initialWarehouseId,
            articleId: artId,
            quantity: Number(formData.initialQuantity || 0),
            seriesList: seriesArray,
            userId: currentEnterpriseId
          });
        }

        await batch.commit();
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving article:', err);
      setError('Error al guardar el artículo. Por favor intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await showConfirm('Eliminar Artículo', '¿Está seguro de eliminar este artículo? Esta acción también eliminará sus registros de stock.', { type: 'danger' }))) return;
    try {
      setLoading(true);
      // Delete article document
      await deleteDoc(doc(db, 'articles', id));
      
      // Delete associated warehouse_inventory docs
      const q = query(collection(db, 'warehouse_inventory'), where('articleId', '==', id));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      fetchData();
      showToast('Artículo eliminado exitosamente', 'success');
    } catch (err: any) {
      console.error('Error deleting article:', err);
      setError('Error al eliminar el artículo.');
      showToast('Error al eliminar el artículo', 'error');
      setLoading(false);
    }
  };

  const uniqueCategories = Array.from(new Set(articles.map(a => a.category).filter(Boolean))).sort() as string[];
  const uniqueBrands = Array.from(new Set(articles.map(a => a.brand).filter(Boolean))).sort() as string[];
  const uniqueModels = Array.from(new Set(articles.map(a => a.model).filter(Boolean))).sort() as string[];

  const filteredArticles = articles.filter(art => 
    art.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ((art.seriesList || []).some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))) ||
    (art.category && art.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (art.brand && art.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (art.model && art.model.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Artículos de Inventario</h2>
          <p className="text-xs text-neutral-400 font-medium">Control de stock global y alertas de mínimo requerimiento.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Ingreso de Mercadería</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o serie de artículo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-xs font-semibold text-neutral-500">Cargando catálogo...</p>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-sm font-bold text-neutral-950 dark:text-neutral-50">No hay artículos registrados</h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto">
            Crea tu primer artículo para comenzar a registrar movimientos, stock en bodegas y alertas personalizadas.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/10">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Artículo</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Nº Serie</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cantidad Global</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Stock Mínimo Alerta</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Estado Alerta</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredArticles.map(art => {
                  const isLowStock = art.quantity <= art.minStockAlert;
                  return (
                    <tr key={art.id} className="hover:bg-neutral-50/30 dark:hover:bg-neutral-800/20 transition-all">
                      <td className="px-6 py-4.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-neutral-950 dark:text-neutral-50 uppercase tracking-tight block">{art.name}</span>
                            <div className="flex flex-wrap gap-1.5 mt-1 text-[10px]">
                              {art.category && (
                                <span className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-bold uppercase px-1.5 py-0.5 rounded">
                                  {art.category}
                                </span>
                              )}
                              {art.brand && (
                                <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold uppercase px-1.5 py-0.5 rounded">
                                  {art.brand}
                                </span>
                              )}
                              {art.model && (
                                <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold uppercase px-1.5 py-0.5 rounded">
                                  {art.model}
                                </span>
                              )}
                              {art.barcode && (
                                <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-mono px-1.5 py-0.5 rounded">
                                  || {art.barcode}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4.5 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                        {art.series ? (
                          <span className="font-mono text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-300">
                            {art.series}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">Sin serie</span>
                        )}
                      </td>
                      <td className="px-6 py-4.5 text-center">
                        <span className={cn(
                          "text-sm font-extrabold px-3 py-1.5 rounded-xl inline-block min-w-12",
                          isLowStock 
                            ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400" 
                            : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400"
                        )}>
                          {art.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 text-center text-sm font-bold text-neutral-600 dark:text-neutral-300">
                        {art.minStockAlert}
                      </td>
                      <td className="px-6 py-4.5 text-center">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Stock Bajo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                            Estable
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenModal(art)}
                            className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-neutral-500 hover:text-indigo-600 dark:text-neutral-400 dark:hover:text-indigo-400 rounded-xl transition-all"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(art.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 rounded-xl transition-all"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 max-w-xl w-full overflow-hidden shadow-2xl my-8 animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {editingArticle ? 'Editar Artículo' : 'Ingreso de Mercadería'}
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
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                {matchedArticle && !editingArticle && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl mb-4">
                    <p className="text-xs font-bold text-green-700 dark:text-green-400">Artículo Existente detectado. Se ingresará stock adicional.</p>
                  </div>
                )}
                {/* Nombre del Artículo Generado Automáticamente */}
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Nombre del Artículo (Automático)</label>
                  <input
                    type="text"
                    readOnly
                    placeholder="Categoría + Marca + Modelo + Código de Barras"
                    value={`${formData.category.trim()} ${formData.brand.trim()} ${formData.model.trim()}${formData.barcode.trim() ? ' ' + formData.barcode.trim() : ''}`.trim().replace(/\s+/g, ' ')}
                    className="w-full px-4 py-3 bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none text-neutral-500 dark:text-neutral-400 cursor-not-allowed uppercase font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Categoría (Predictivo) */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Categoría *</label>
                    <input
                      type="text"
                      required
                      list="categories-list"
                      placeholder="Ej. Cocinas, Parlantes, Neveras..."
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase"
                    />
                    <datalist id="categories-list">
                      {uniqueCategories.map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>

                  {/* Marca (Predictivo) */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Marca *</label>
                    <input
                      type="text"
                      required
                      list="brands-list"
                      placeholder="Ej. Samsung, LG, Indurama..."
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase"
                    />
                    <datalist id="brands-list">
                      {uniqueBrands.map(brand => (
                        <option key={brand} value={brand} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Modelo (Predictivo) */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Modelo *</label>
                    <input
                      type="text"
                      required
                      list="models-list"
                      placeholder="Ej. Premium Class X, EcoPlus..."
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase"
                    />
                    <datalist id="models-list">
                      {uniqueModels.map(model => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </div>

                  {/* Código de barras (Opcional) */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Código de Barras (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Escanee o digite código"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Número de Serie */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer mb-2 mt-4">
                      <input
                        type="checkbox"
                        checked={formData.requiresSeries}
                        onChange={(e) => setFormData({ ...formData, requiresSeries: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded border-neutral-300 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Requerir Series / Seriales</span>
                    </label>
                    {formData.requiresSeries && (
                      <textarea
                        placeholder="Ingrese series separadas por coma o salto de línea"
                        value={formData.seriesInput}
                        onChange={(e) => setFormData({ ...formData, seriesInput: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all uppercase font-mono"
                      />
                    )}
                  </div>

                  {/* Stock Mínimo Alerta */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Mínimo para Alerta *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      placeholder="Ej. 5"
                      value={formData.minStockAlert}
                      onChange={(e) => setFormData({ ...formData, minStockAlert: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all"
                    />
                  </div>
                </div>

                {!editingArticle && warehouses.length > 0 && (
                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-4 bg-neutral-50 dark:bg-neutral-800/20 p-4.5 rounded-2xl border border-neutral-100 dark:border-neutral-800/60">
                    <div>
                      <h4 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Asignación Obligatoria de Bodega</h4>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Defina a qué bodega se ingresará inicialmente este nuevo artículo.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Stock Inicial *</label>
                        <input
                          type="number"
                          min={0}
                          required
                          placeholder="0"
                          value={formData.initialQuantity}
                          onChange={(e) => setFormData({ ...formData, initialQuantity: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all relative z-10 cursor-pointer "
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1.5">Bodega Destino *</label>
                        <select
                          required
                          value={formData.initialWarehouseId}
                          onChange={(e) => setFormData({ ...formData, initialWarehouseId: e.target.value })}
                          className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-neutral-900 dark:text-neutral-50 transition-all"
                        >
                          <option value="" disabled>Seleccione Bodega...</option>
                          {warehouses.map(wh => (
                            <option key={wh.id} value={wh.id}>{wh.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
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
                  {submitting ? 'Guardando...' : 'Guardar Artículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
