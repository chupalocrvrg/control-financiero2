import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  writeBatch, 
  query, 
  where, 
  addDoc, 
  Timestamp 
} from 'firebase/firestore';

/**
 * Adjusts the stock of a specific article in a warehouse and updates its total global stock.
 * Uses a batch to ensure atomicity.
 */
export async function adjustStockAndGlobalQuantity(
  batch: any,
  warehouseId: string,
  articleId: string,
  quantityChange: number,
  userId: string,
  seriesListChange?: string[]
) {
  const invId = `${warehouseId}_${articleId}`;
  const invRef = doc(db, 'warehouse_inventory', invId);
  const invSnap = await getDoc(invRef);
  
  let currentInvQty = 0;
  let currentInvSeries: string[] = [];
  if (invSnap.exists()) {
    currentInvQty = invSnap.data().quantity || 0;
    currentInvSeries = invSnap.data().seriesList || [];
  }
  
  const newInvQty = Math.max(0, currentInvQty + quantityChange);
  let newInvSeries = [...currentInvSeries];
  if (seriesListChange && seriesListChange.length > 0) {
    if (quantityChange > 0) {
      newInvSeries = [...newInvSeries, ...seriesListChange];
    } else {
      newInvSeries = newInvSeries.filter(s => !seriesListChange.includes(s));
    }
  }

  batch.set(invRef, {
    id: invId,
    warehouseId,
    articleId,
    quantity: newInvQty,
    seriesList: newInvSeries,
    userId
  }, { merge: true });

  // Update global article stock
  const articleRef = doc(db, 'articles', articleId);
  const articleSnap = await getDoc(articleRef);
  if (articleSnap.exists()) {
    const currentGlobalQty = articleSnap.data().quantity || 0;
    const newGlobalQty = Math.max(0, currentGlobalQty + quantityChange);
    
    let currentGlobalSeries = articleSnap.data().seriesList || [];
    let newGlobalSeries = [...currentGlobalSeries];
    if (seriesListChange && seriesListChange.length > 0) {
      if (quantityChange > 0) {
        newGlobalSeries = [...newGlobalSeries, ...seriesListChange];
      } else {
        newGlobalSeries = newGlobalSeries.filter(s => !seriesListChange.includes(s));
      }
    }

    batch.update(articleRef, { quantity: newGlobalQty, seriesList: newGlobalSeries });
  }
}

/*
  batch: any, 
  warehouseId: string, 
  articleId: string, 
  quantityChange: number, 
  userId: string
) {
  const invId = `${warehouseId}_${articleId}`;
  const invRef = doc(db, 'warehouse_inventory', invId);
  const invSnap = await getDoc(invRef);
  
  let currentInvQty = 0;
  if (invSnap.exists()) {
    currentInvQty = invSnap.data().quantity || 0;
  }
  
  const newInvQty = Math.max(0, currentInvQty + quantityChange);
  
  batch.set(invRef, {
    id: invId,
    warehouseId,
    articleId,
    quantity: newInvQty,
    userId
  }, { merge: true });

  // Update global article stock
  const articleRef = doc(db, 'articles', articleId);
  const articleSnap = await getDoc(articleRef);
  if (articleSnap.exists()) {
    const currentGlobalQty = articleSnap.data().quantity || 0;
    const newGlobalQty = Math.max(0, currentGlobalQty + quantityChange);
    batch.update(articleRef, { quantity: newGlobalQty });
  }
}

*/
/**
 * Executes a warehouse-to-warehouse stock transfer.
 */
export async function executeTransfer(
  userId: string,
  fromWarehouseId: string,
  toWarehouseId: string,
  articlesList: Array<{ articleId: string; quantity: number; seriesList?: string[] }>,
  reason: string,
  comment: string
) {
  const batch = writeBatch(db);
  
  // 1. Fetch names for warehouses to store in the transfer record
  const fromSnap = await getDoc(doc(db, 'warehouses', fromWarehouseId));
  const toSnap = await getDoc(doc(db, 'warehouses', toWarehouseId));
  const fromName = fromSnap.exists() ? fromSnap.data().name : 'Desconocida';
  const toName = toSnap.exists() ? toSnap.data().name : 'Desconocida';

  // 2. Adjust stock for each article
  const detailedArticles = [];
  for (const item of articlesList) {
    const artSnap = await getDoc(doc(db, 'articles', item.articleId));
    const artName = artSnap.exists() ? artSnap.data().name : 'Articulo';
    const artSeries = artSnap.exists() ? artSnap.data().series || '' : '';

    // Subtract from source warehouse
    await adjustStockAndGlobalQuantity(batch, fromWarehouseId, item.articleId, -item.quantity, userId, item.seriesList);
    // Add to target warehouse
    await adjustStockAndGlobalQuantity(batch, toWarehouseId, item.articleId, item.quantity, userId, item.seriesList);

    detailedArticles.push({
      articleId: item.articleId,
      name: artName,
      quantity: item.quantity,
      series: artSeries
    });
  }

  // 3. Save transfer log
  const transferRef = doc(collection(db, 'transfers'));
  batch.set(transferRef, {
    fromWarehouseId,
    fromWarehouseName: fromName,
    toWarehouseId,
    toWarehouseName: toName,
    articles: detailedArticles,
    reason,
    comment,
    timestamp: Timestamp.now(),
    userId
  });

  await batch.commit();
}

/**
 * Executes a Loan or Return from a commercial house.
 */
export async function executeLoanReturn(
  userId: string,
  type: 'LOAN' | 'RETURN',
  commercialHouse: string,
  warehouseId: string, // optional/empty if direct sale & type === 'LOAN'
  isDirectSale: boolean,
  articlesList: Array<{ articleId: string; quantity: number; seriesList?: string[] }>,
  personName: string,
  comment: string
) {
  const batch = writeBatch(db);
  
  let warehouseName = 'Venta Directa';
  if (warehouseId) {
    const whSnap = await getDoc(doc(db, 'warehouses', warehouseId));
    warehouseName = whSnap.exists() ? whSnap.data().name : 'Desconocida';
  }

  const detailedArticles = [];
  for (const item of articlesList) {
    const artSnap = await getDoc(doc(db, 'articles', item.articleId));
    const artName = artSnap.exists() ? artSnap.data().name : 'Artículo';
    const artSeries = artSnap.exists() ? artSnap.data().series || '' : '';

    if (type === 'LOAN') {
      // Loan: We receive items
      if (!isDirectSale && warehouseId) {
        // Enters the warehouse
        await adjustStockAndGlobalQuantity(batch, warehouseId, item.articleId, item.quantity, userId, item.seriesList);
      } else {
        // Direct sale: doesn't enter warehouse but still updates the global count/logs
        const articleRef = doc(db, 'articles', item.articleId);
        if (artSnap.exists()) {
          const currentGlobalQty = artSnap.data().quantity || 0;
          batch.update(articleRef, { quantity: currentGlobalQty + item.quantity });
        }
      }
    } else {
      // Return: We deliver items back
      if (warehouseId) {
        // Subtracted from warehouse
        await adjustStockAndGlobalQuantity(batch, warehouseId, item.articleId, -item.quantity, userId, item.seriesList);
      }
    }

    detailedArticles.push({
      articleId: item.articleId,
      name: artName,
      quantity: item.quantity,
      series: artSeries
    });
  }

  // Save Loan/Return record
  const docRef = doc(collection(db, 'loans_returns'));
  batch.set(docRef, {
    type,
    commercialHouse,
    warehouseId: isDirectSale ? '' : warehouseId,
    warehouseName: isDirectSale ? 'Venta Directa' : warehouseName,
    isDirectSale: type === 'LOAN' ? isDirectSale : false,
    articles: detailedArticles,
    personName,
    comment,
    timestamp: Timestamp.now(),
    userId
  });

  await batch.commit();
}

/**
 * Executes a sales operation with multiple items and potential gift items.
 */
export async function executeInventorySale(
  userId: string,
  clientName: string,
  sellerId: string,
  sellerName: string,
  soldItemsList: Array<{ articleId: string; quantity: number; warehouseId: string; isGift: boolean; seriesList?: string[] }>
) {
  const batch = writeBatch(db);
  const detailedSoldArticles = [];

  for (const item of soldItemsList) {
    const whSnap = await getDoc(doc(db, 'warehouses', item.warehouseId));
    const whName = whSnap.exists() ? whSnap.data().name : 'Desconocida';
    
    const artSnap = await getDoc(doc(db, 'articles', item.articleId));
    const artName = artSnap.exists() ? artSnap.data().name : 'Artículo';

    // Deduct stock (both sold and gift items deduct from warehouse)
    await adjustStockAndGlobalQuantity(batch, item.warehouseId, item.articleId, -item.quantity, userId, item.seriesList);

    detailedSoldArticles.push({
      articleId: item.articleId,
      name: artName,
      quantity: item.quantity,
      warehouseId: item.warehouseId,
      warehouseName: whName,
      isGift: item.isGift
    });
  }

  const saleRef = doc(collection(db, 'inventory_sales'));
  batch.set(saleRef, {
    clientName,
    sellerId,
    sellerName,
    soldArticles: detailedSoldArticles,
    timestamp: Timestamp.now(),
    userId
  });

  await batch.commit();
}

/**
 * Reverts a warehouse stock transfer and marks it as deleted.
 */
export async function revertTransfer(transferId: string, userId: string, revertReason: string) {
  const batch = writeBatch(db);
  const transferRef = doc(db, 'transfers', transferId);
  const transferSnap = await getDoc(transferRef);
  if (!transferSnap.exists()) {
    throw new Error('La transferencia no existe.');
  }
  const data = transferSnap.data();
  if (data.status === 'ELIMINADO') {
    throw new Error('Esta transferencia ya fue eliminada/revertida.');
  }
  const fromWarehouseId = data.fromWarehouseId;
  const toWarehouseId = data.toWarehouseId;
  const articles = data.articles || [];
  const revertedArticlesLog: Array<{ articleId: string; name: string; requested: number; actual: number }> = [];

  for (const item of articles) {
    // Find current available quantity in the target warehouse (toWarehouseId)
    const invId = `${toWarehouseId}_${item.articleId}`;
    const invSnap = await getDoc(doc(db, 'warehouse_inventory', invId));
    const availableQty = invSnap.exists() ? invSnap.data().quantity || 0 : 0;
    
    // We can only subtract what is actually available in the target warehouse
    const qToRevert = Math.min(item.quantity, availableQty);
    revertedArticlesLog.push({
      articleId: item.articleId,
      name: item.name,
      requested: item.quantity,
      actual: qToRevert
    });

    // Add stock back to the original source warehouse (fromWarehouseId)
    await adjustStockAndGlobalQuantity(batch, fromWarehouseId, item.articleId, qToRevert, userId, item.seriesList);
    // Subtract stock from target warehouse (toWarehouseId)
    await adjustStockAndGlobalQuantity(batch, toWarehouseId, item.articleId, -qToRevert, userId, item.seriesList);
  }

  // Update transfer document status
  batch.update(transferRef, {
    status: 'ELIMINADO',
    revertReason,
    revertedArticles: revertedArticlesLog,
    revertedAt: Timestamp.now()
  });
  await batch.commit();
}

/**
 * Reverts a loan or return and marks it as deleted.
 */
export async function revertLoanReturn(loanReturnId: string, userId: string, revertReason: string) {
  const batch = writeBatch(db);
  const ref = doc(db, 'loans_returns', loanReturnId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('El movimiento no existe.');
  }
  const data = snap.data();
  if (data.status === 'ELIMINADO') {
    throw new Error('Este movimiento ya fue eliminado/revertida.');
  }
  const type = data.type; // 'LOAN' or 'RETURN'
  const warehouseId = data.warehouseId;
  const isDirectSale = data.isDirectSale;
  const articles = data.articles || [];
  const revertedArticlesLog: Array<{ articleId: string; name: string; requested: number; actual: number }> = [];

  for (const item of articles) {
    const artSnap = await getDoc(doc(db, 'articles', item.articleId));
    const currentGlobalQty = artSnap.exists() ? artSnap.data().quantity || 0 : 0;
    
    if (type === 'LOAN') {
      // LOAN originally added stock. To revert: we must subtract stock.
      if (!isDirectSale && warehouseId) {
        // Find current available quantity in this warehouse
        const invId = `${warehouseId}_${item.articleId}`;
        const invSnap = await getDoc(doc(db, 'warehouse_inventory', invId));
        const availableQty = invSnap.exists() ? invSnap.data().quantity || 0 : 0;
        
        const qToRevert = Math.min(item.quantity, availableQty);
        revertedArticlesLog.push({
          articleId: item.articleId,
          name: item.name,
          requested: item.quantity,
          actual: qToRevert
        });
        
        // Subtract from warehouse
        await adjustStockAndGlobalQuantity(batch, warehouseId, item.articleId, -qToRevert, userId, item.seriesList);
      } else {
        // Direct sale: subtract from global only
        const qToRevert = Math.min(item.quantity, currentGlobalQty);
        revertedArticlesLog.push({
          articleId: item.articleId,
          name: item.name,
          requested: item.quantity,
          actual: qToRevert
        });
        
        const articleRef = doc(db, 'articles', item.articleId);
        batch.update(articleRef, { quantity: Math.max(0, currentGlobalQty - qToRevert) });
      }
    } else {
      // RETURN originally subtracted stock. To revert: we must add stock back to warehouse (which also increases global).
      // Adding stock is always mathematically fully available to do
      revertedArticlesLog.push({
        articleId: item.articleId,
        name: item.name,
        requested: item.quantity,
        actual: item.quantity
      });
      if (warehouseId) {
        await adjustStockAndGlobalQuantity(batch, warehouseId, item.articleId, item.quantity, userId, item.seriesList);
      }
    }
  }

  // Update document status
  batch.update(ref, {
    status: 'ELIMINADO',
    revertReason,
    revertedArticles: revertedArticlesLog,
    revertedAt: Timestamp.now()
  });
  await batch.commit();
}

/**
 * Reverts an inventory sale and marks it as deleted.
 */
export async function revertInventorySale(saleId: string, userId: string, revertReason: string) {
  const batch = writeBatch(db);
  const ref = doc(db, 'inventory_sales', saleId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('La venta no existe.');
  }
  const data = snap.data();
  if (data.status === 'ELIMINADO') {
    throw new Error('Esta venta ya fue eliminada/revertida.');
  }
  const soldArticles = data.soldArticles || [];

  for (const item of soldArticles) {
    // Originally deducted stock from item.warehouseId. To revert: add it back!
    await adjustStockAndGlobalQuantity(batch, item.warehouseId, item.articleId, item.quantity, userId, item.seriesList);
  }

  // Update document status
  batch.update(ref, {
    status: 'ELIMINADO',
    revertReason,
    revertedAt: Timestamp.now()
  });
  await batch.commit();
}
