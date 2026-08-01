import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Warehouse, Article, WarehouseInventory, LoanReturn, Transfer, InventorySale } from '../../types/inventory';
import { Package, Home, ArrowLeftRight, ShoppingBag, ShoppingCart, AlertTriangle, User, Calendar, CheckCircle, TrendingUp } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { cn } from '../../lib/utils';

export default function InventoryDashboard() {
  const { user, profile } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [inventories, setInventories] = useState<WarehouseInventory[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<Transfer[]>([]);
  const [recentLoansReturns, setRecentLoansReturns] = useState<LoanReturn[]>([]);
  const [recentSales, setRecentSales] = useState<InventorySale[]>([]);
  const [loading, setLoading] = useState(true);

  const currentEnterpriseId = profile?.role === 'BODEGUERO' ? profile?.enterpriseId : user?.uid;

  useEffect(() => {
    if (currentEnterpriseId) {
      loadDashboardData();
    }
  }, [currentEnterpriseId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Warehouses
      const whQ = query(collection(db, 'warehouses'), where('userId', '==', currentEnterpriseId));
      const whSnap = await getDocs(whQ);
      const whList = whSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warehouse));
      setWarehouses(whList);

      // 2. Fetch Articles
      const artQ = query(collection(db, 'articles'), where('userId', '==', currentEnterpriseId));
      const artSnap = await getDocs(artQ);
      const artList = artSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
      setArticles(artList);

      // 3. Fetch Warehouse Inventories
      const invQ = query(collection(db, 'warehouse_inventory'), where('userId', '==', currentEnterpriseId));
      const invSnap = await getDocs(invQ);
      const invList = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WarehouseInventory));
      setInventories(invList);

      // 4. Fetch recent transfers (limit to 3)
      const transQ = query(
        collection(db, 'transfers'), 
        where('userId', '==', currentEnterpriseId), 
        orderBy('timestamp', 'desc'),
        // limit(3) removed to calculate full stock for commercial houses
      );
      const transSnap = await getDocs(transQ);
      const transList = transSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(doc.data().timestamp)
      } as unknown as Transfer));
      setRecentTransfers(transList);

      // 5. Fetch recent loans/returns (limit to 3)
      const lrQ = query(
        collection(db, 'loans_returns'), 
        where('userId', '==', currentEnterpriseId), 
        orderBy('timestamp', 'desc'),
        limit(3)
      );
      const lrSnap = await getDocs(lrQ);
      const lrList = lrSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(doc.data().timestamp)
      } as unknown as LoanReturn));
      setRecentLoansReturns(lrList);

      // 6. Fetch recent sales (limit to 3)
      const salesQ = query(
        collection(db, 'inventory_sales'), 
        where('userId', '==', currentEnterpriseId), 
        orderBy('timestamp', 'desc'),
        limit(3)
      );
      const salesSnap = await getDocs(salesQ);
      const salesList = salesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(doc.data().timestamp)
      } as unknown as InventorySale));
      setRecentSales(salesList);

    } catch (err) {
      console.error('Error loading inventory dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Aggregations
  const lowStockArticles = articles.filter(art => art.quantity <= art.minStockAlert);
  const totalArticlesCount = articles.reduce((acc, art) => acc + art.quantity, 0);
  
  // Calculate Commercial House Stock
  const houseStock: Record<string, Record<string, number>> = {};
  recentLoansReturns.forEach(lr => {
    const house = lr.commercialHouse;
    if (!houseStock[house]) houseStock[house] = {};
    
    lr.articles.forEach(art => {
      if (!houseStock[house][art.articleId]) houseStock[house][art.articleId] = 0;
      if (lr.type === 'RETURN') {
        // Egreso: went to commercial house
        houseStock[house][art.articleId] += art.quantity;
      } else if (lr.type === 'LOAN') {
        // Ingreso: came back from commercial house
        houseStock[house][art.articleId] -= art.quantity;
      }
    });
  });

  // Filter out empty stocks
  const activeHouseStocks = Object.entries(houseStock).map(([house, stock]) => {
    const activeArticles = Object.entries(stock).filter(([_, qty]) => qty > 0);
    return { house, articles: activeArticles };
  }).filter(h => h.articles.length > 0);

  const activeLoans = recentLoansReturns.filter(l => l.type === 'LOAN');
  const salesTodayCount = recentSales.filter(s => isToday(new Date(s.timestamp))).length;

  const safeFormatDate = (date: any) => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return format(d, 'dd/MM/yyyy HH:mm');
    } catch (e) {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 className="text-sm font-black text-neutral-400 uppercase tracking-widest">Generando Dashboard de Almacén...</h3>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1 */}
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-[2rem] border border-neutral-100 dark:border-neutral-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Bodegas Activas</span>
            <span className="text-3xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">{warehouses.length}</span>
          </div>
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Home className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-[2rem] border border-neutral-100 dark:border-neutral-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Unidades en Almacén</span>
            <span className="text-3xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">{totalArticlesCount}</span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-[2rem] border border-neutral-100 dark:border-neutral-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Artículos por Acabarse</span>
            <span className={cn(
              "text-3xl font-black tracking-tight",
              lowStockArticles.length > 0 ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-50"
            )}>
              {lowStockArticles.length}
            </span>
          </div>
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center",
            lowStockArticles.length > 0 
              ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse" 
              : "bg-neutral-50 dark:bg-neutral-800 text-neutral-400"
          )}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-[2rem] border border-neutral-100 dark:border-neutral-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Despachos de Hoy</span>
            <span className="text-3xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">{salesTodayCount}</span>
          </div>
          <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Low Stock and Active Loans */}
        <div className="lg:col-span-6 space-y-8">
          
          {/* Low stock list */}
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-6">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-extrabold text-neutral-950 dark:text-neutral-50 uppercase tracking-tight">Artículos por Acabarse</h3>
            </div>
            
            {lowStockArticles.length === 0 ? (
              <div className="py-6 text-center text-xs font-semibold text-neutral-400 bg-neutral-50 dark:bg-neutral-800/20 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800">
                ¡Excelente! Todos los artículos están por encima del stock de alerta.
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockArticles.map(art => (
                  <div key={art.id} className="flex items-center justify-between p-4 bg-red-50/30 dark:bg-red-950/10 border border-red-100 dark:border-red-950/40 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center text-red-500">
                        <Package className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <span className="text-xs font-extrabold text-neutral-950 dark:text-neutral-50 block uppercase tracking-tight">{art.name}</span>
                        {art.series && <span className="text-[9px] font-mono text-neutral-400 uppercase">S/N: {art.series}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-red-600 dark:text-red-400 block">{art.quantity} uds</span>
                      <span className="text-[9px] font-bold text-neutral-400 uppercase block">Min: {art.minStockAlert} uds</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Loans */}
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm space-y-6">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-extrabold text-neutral-950 dark:text-neutral-50 uppercase tracking-tight">Stock en Casas Comerciales</h3>
            </div>
            {activeHouseStocks.length === 0 ? (
              <div className="py-6 text-center text-xs font-semibold text-neutral-400 bg-neutral-50 dark:bg-neutral-800/20 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800">
                No hay stock actualmente en préstamo en casas comerciales.
              </div>
            ) : (
              <div className="space-y-4">
                {activeHouseStocks.map(({ house, articles: houseArts }) => {
                  const hasAlert = houseArts.some(([artId, _qty]) => {
                    const article = articles.find(a => a.id === artId);
                    if (!article) return false;
                    const alertThreshold = Math.round((article.minStockAlert / 2) + 0.1);
                    return article.quantity <= alertThreshold;
                  });
                  return (
                    <div key={house} className={`p-4 bg-neutral-50 dark:bg-neutral-800/20 border ${hasAlert ? 'border-amber-400 dark:border-amber-600' : 'border-neutral-100 dark:border-neutral-800'} rounded-2xl space-y-3 relative overflow-hidden`}>
                      {hasAlert && (
                        <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-sm flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          ¡Alerta: Requerido!
                        </div>
                      )}
                      <div className="flex justify-between items-start border-b border-neutral-100 dark:border-neutral-800 pb-2 pt-1">
                        <div>
                          <span className="text-xs font-black text-neutral-950 dark:text-neutral-50 uppercase tracking-tight block">{house}</span>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">Artículos en préstamo activo</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {houseArts.map(([artId, qty]) => {
                          const article = articles.find(a => a.id === artId);
                          if (!article) return null;
                          const alertThreshold = Math.round((article.minStockAlert / 2) + 0.1);
                          const isWarning = article.quantity <= alertThreshold;
                          return (
                            <span key={artId} className={`px-2.5 py-1 bg-white dark:bg-neutral-900 border ${isWarning ? 'border-amber-300 dark:border-amber-700/50 text-amber-700 dark:text-amber-400' : 'border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'} rounded-lg text-[10px] font-bold`} title={isWarning ? "Stock interno bajo: " + article.quantity + " uds. (Límite: " + alertThreshold + " uds)" : ""}>
                              {article.name} ({qty} uds)
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
