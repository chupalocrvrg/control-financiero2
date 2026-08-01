import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { Article, WarehouseInventory } from '../../types/inventory';
import { cn } from '../../lib/utils';

interface Props {
  articles: Article[];
  inventories: WarehouseInventory[];
  warehouseId: string;
  articleId: string;
  quantity: number;
  selectedSeries: string[];
  onChangeArticle: (articleId: string) => void;
  onChangeQuantity: (quantity: number) => void;
  onChangeSeries: (series: string[]) => void;
  maxQuantityStr?: string;
  className?: string;
}

interface ExtendedProps extends Props {
  isReceiving?: boolean;
}

export function ArticleSelector({ articles, inventories, warehouseId, articleId, quantity, selectedSeries, onChangeArticle, onChangeQuantity, onChangeSeries, maxQuantityStr, className, isReceiving = false }: ExtendedProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedArticle = articles.find(a => a.id === articleId);

  useEffect(() => {
    if (selectedArticle) {
      setSearch(`${selectedArticle.name} ${selectedArticle.brand || ''} ${selectedArticle.model || ''}`.trim());
    } else {
      setSearch('');
    }
  }, [articleId, selectedArticle]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getAvailableStock = (artId: string) => {
    if (!warehouseId) return 0;
    const inv = inventories.find(i => i.warehouseId === warehouseId && i.articleId === artId);
    return inv ? inv.quantity : 0;
  };

  const filteredArticles = articles.filter(art => {
    const s = search.toLowerCase();
    const barcodeMatch = art.barcode?.toLowerCase().includes(s);
    const nameMatch = art.name.toLowerCase().includes(s);
    const brandMatch = art.brand?.toLowerCase().includes(s);
    const modelMatch = art.model?.toLowerCase().includes(s);
    const catMatch = art.category?.toLowerCase().includes(s);
    return barcodeMatch || nameMatch || brandMatch || modelMatch || catMatch;
  });

  const availableStock = articleId ? getAvailableStock(articleId) : 0;
  
  const handleSelect = (art: Article) => {
    onChangeArticle(art.id);
    setIsOpen(false);
    // Reset quantity and series when changing article
    onChangeQuantity(1);
    onChangeSeries([]);
  };

  const inv = inventories.find(i => i.warehouseId === warehouseId && i.articleId === articleId);
  const availableSeries = inv?.seriesList || [];

  const toggleSeries = (s: string) => {
    if (selectedSeries.includes(s)) {
      const next = selectedSeries.filter(x => x !== s);
      onChangeSeries(next);
      onChangeQuantity(next.length);
    } else {
      const next = [...selectedSeries, s];
      onChangeSeries(next);
      onChangeQuantity(next.length);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} ref={containerRef}>
      <div className="flex gap-2 items-start">
        <div className="flex-1 relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar artículo por nombre, código de barras, marca, modelo..."
              value={search}
              onChange={e => { setSearch(e.target.value); setIsOpen(true); if (articleId) onChangeArticle(''); }}
              onFocus={() => setIsOpen(true)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs outline-none focus:border-indigo-500 text-neutral-900 dark:text-neutral-50"
            />
            {isOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                {filteredArticles.length === 0 ? (
                  <div className="p-3 text-xs text-neutral-500 text-center">No se encontraron artículos</div>
                ) : (
                  filteredArticles.map(art => {
                    const stock = getAvailableStock(art.id);
                    return (
                      <div 
                        key={art.id} 
                        onClick={() => (stock > 0 || isReceiving) ? handleSelect(art) : null}
                        className={cn("p-2 text-xs border-b border-neutral-100 dark:border-neutral-700/50 last:border-0", (stock > 0 || isReceiving) ? "hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer" : "opacity-50 cursor-not-allowed")}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-neutral-900 dark:text-neutral-100">{art.name}</span>
                          <span className="text-[10px] font-mono bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-500">Disp: {stock}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                          {art.brand} {art.model} {art.barcode ? `| COD: ${art.barcode}` : ''}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
          {articleId && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block px-1 mt-1">
              Stock Disponible: <strong className="text-neutral-600 dark:text-neutral-300">{availableStock} uds</strong> {maxQuantityStr}
            </span>
          )}
        </div>
        
        {!selectedArticle?.requiresSeries && (
          <div className="w-24">
            <input
              type="number"
              min={1}
              
              value={quantity}
              onChange={(e) => onChangeQuantity(Math.max(1, parseInt(e.target.value) || 0))}
              disabled={!articleId}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-center outline-none focus:border-indigo-500 text-neutral-900 dark:text-neutral-50 disabled:opacity-50"
              {...(isReceiving ? {} : { max: availableStock || 1 })}
            />
          </div>
        )}
      </div>

      {selectedArticle?.requiresSeries && (
        <div className="mt-2 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-3">
          {isReceiving ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2">Ingrese Series ({selectedSeries.length} detectadas)</p>
              <textarea
                placeholder="Ingrese series separadas por coma o salto de línea"
                value={selectedSeries.join('\n')}
                onChange={(e) => {
                  const arr = e.target.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
                  onChangeSeries(arr);
                  onChangeQuantity(Math.max(1, arr.length));
                }}
                rows={3}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs outline-none focus:border-indigo-500 text-neutral-900 dark:text-neutral-50 transition-all uppercase font-mono"
              />
            </>
          ) : (
            availableSeries.length > 0 ? (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2">Seleccione Series ({selectedSeries.length} seleccionadas)</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {availableSeries.map(s => (
                    <label key={s} className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-mono cursor-pointer transition-all", selectedSeries.includes(s) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-indigo-300")}>
                      <input type="checkbox" checked={selectedSeries.includes(s)} onChange={() => toggleSeries(s)} className="sr-only" />
                      {s}
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500">No hay series disponibles para seleccionar.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
