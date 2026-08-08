import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  runTransaction, 
  query, 
  where, 
  addDoc, 
  Timestamp 
} from 'firebase/firestore';

export function normalizeArticleData(data: any, id: string): any {
  const name =
    data?.name ||
    data?.computedName ||
    data?.nombre ||
    data?.description ||
    [data?.category, data?.brand, data?.model].filter(Boolean).join(' ') ||
    'Artículo sin Nombre';

  return {
    id,
    ...data,
    name,
    quantity: typeof data?.quantity === 'number' ? data.quantity : 0,
    minStockAlert: typeof data?.minStockAlert === 'number' ? data.minStockAlert : 5,
    category: data?.category || '',
    brand: data?.brand || '',
    model: data?.model || '',
    barcode: data?.barcode || '',
    seriesList: Array.isArray(data?.seriesList) ? data.seriesList : []
  };
}

/**
 * Helper to fetch documents from an inventory collection (articles, warehouses, warehouse_inventory, etc.)
 * matching any of the user's target IDs (primary enterpriseId, auth user UID, profile enterpriseId).
 * Ensures documents created by staff/bodegueros prior to linking or under alternate user IDs are seamlessly retrieved.
 */
export async function fetchInventoryCollection<T>(
  collectionName: string,
  primaryEnterpriseId: string,
  userUid?: string,
  profileEnterpriseId?: string
): Promise<T[]> {
  const targetIds = Array.from(
    new Set(
      [primaryEnterpriseId, userUid, profileEnterpriseId]
        .filter((id): id is string => Boolean(id && typeof id === 'string' && id.trim() !== ''))
    )
  );

  const resultMap = new Map<string, T>();

  const processDoc = (docSnap: any) => {
    const data = docSnap.data();
    if (collectionName === 'articles') {
      resultMap.set(docSnap.id, normalizeArticleData(data, docSnap.id) as T);
    } else {
      resultMap.set(docSnap.id, { id: docSnap.id, ...data } as T);
    }
  };

  // 1. Try a full collection read (works if security rules allow reading all documents for the user/enterprise)
  try {
    const fullSnap = await getDocs(collection(db, collectionName));
    fullSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const matchesTarget = targetIds.length === 0 || targetIds.some(id => 
        data.userId === id || data.enterpriseId === id || data.createdBy === id || !data.enterpriseId
      );
      if (matchesTarget || targetIds.length === 0) {
        processDoc(docSnap);
      }
    });
  } catch (err) {
    // If full collection query is restricted by rules, proceed to targeted field queries below
  }

  // 2. Perform targeted field queries for all target IDs
  if (targetIds.length > 0) {
    const queryPromises: Promise<any>[] = [];
    for (const id of targetIds) {
      queryPromises.push(getDocs(query(collection(db, collectionName), where('userId', '==', id))));
      queryPromises.push(getDocs(query(collection(db, collectionName), where('enterpriseId', '==', id))));
      queryPromises.push(getDocs(query(collection(db, collectionName), where('createdBy', '==', id))));
    }

    const snapshots = await Promise.all(
      queryPromises.map(p => p.catch(() => null))
    );

    snapshots.forEach(snap => {
      if (snap && 'docs' in snap) {
        snap.docs.forEach((docSnap: any) => {
          processDoc(docSnap);
        });
      }
    });
  }

  return Array.from(resultMap.values());
}

/**
 * Ensures that any article referenced by ID (e.g. in warehouse_inventory, sales, transfers, loans)
 * is present in the articles array. If missing, attempts to fetch it directly by document ID.
 */
export async function ensureArticlesLoaded<T extends { id: string }>(
  existingArticles: T[],
  referencedArticleIds: string[]
): Promise<T[]> {
  const resultMap = new Map<string, T>();
  existingArticles.forEach(art => {
    if (art && art.id) {
      const normalized = normalizeArticleData(art, art.id);
      resultMap.set(art.id, normalized as unknown as T);
    }
  });

  const missingIds = Array.from(
    new Set(referencedArticleIds.filter(id => Boolean(id) && typeof id === 'string' && !resultMap.has(id)))
  );

  if (missingIds.length === 0) {
    return Array.from(resultMap.values());
  }

  const docSnaps = await Promise.all(
    missingIds.map(id => getDoc(doc(db, 'articles', id)).catch(() => null))
  );

  docSnaps.forEach(snap => {
    if (snap && snap.exists()) {
      const normalized = normalizeArticleData(snap.data(), snap.id);
      resultMap.set(snap.id, normalized as unknown as T);
    }
  });

  return Array.from(resultMap.values());
}

/**
 * Adjusts the stock of a specific article in a warehouse and updates its total global stock.
 * Uses Firestore runTransaction to prevent race conditions.
 */
export async function adjustStockAndGlobalQuantity(
  _batchOrDummy: any,
  warehouseId: string,
  articleId: string,
  quantityChange: number,
  userId: string,
  seriesListChange?: string[]
) {
  await runTransaction(db, async (transaction) => {
    const invId = `${warehouseId}_${articleId}`;
    const invRef = doc(db, 'warehouse_inventory', invId);
    const articleRef = doc(db, 'articles', articleId);

    // Phase 1: Reads
    const invSnap = await transaction.get(invRef);
    const articleSnap = await transaction.get(articleRef);

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

    // Phase 2: Writes
    transaction.set(invRef, {
      id: invId,
      warehouseId,
      articleId,
      quantity: newInvQty,
      seriesList: newInvSeries,
      userId,
      enterpriseId: userId
    }, { merge: true });

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

      transaction.update(articleRef, { quantity: newGlobalQty, seriesList: newGlobalSeries });
    }
  });
}

/**
 * Executes a warehouse-to-warehouse stock transfer atomically via runTransaction.
 */
export async function executeTransfer(
  userId: string,
  fromWarehouseId: string,
  toWarehouseId: string,
  articlesList: Array<{ articleId: string; quantity: number; seriesList?: string[] }>,
  reason: string,
  comment: string
) {
  await runTransaction(db, async (transaction) => {
    // 1. Reads
    const fromRef = doc(db, 'warehouses', fromWarehouseId);
    const toRef = doc(db, 'warehouses', toWarehouseId);
    const fromSnap = await transaction.get(fromRef);
    const toSnap = await transaction.get(toRef);
    const fromName = fromSnap.exists() ? fromSnap.data().name : 'Desconocida';
    const toName = toSnap.exists() ? toSnap.data().name : 'Desconocida';

    const detailedArticles = [];
    const itemReads = [];

    for (const item of articlesList) {
      const artRef = doc(db, 'articles', item.articleId);
      const artSnap = await transaction.get(artRef);
      const artName = artSnap.exists() ? artSnap.data().name : 'Articulo';
      const artSeries = artSnap.exists() ? artSnap.data().series || '' : '';

      const fromInvRef = doc(db, 'warehouse_inventory', `${fromWarehouseId}_${item.articleId}`);
      const toInvRef = doc(db, 'warehouse_inventory', `${toWarehouseId}_${item.articleId}`);

      const fromInvSnap = await transaction.get(fromInvRef);
      const toInvSnap = await transaction.get(toInvRef);

      detailedArticles.push({
        articleId: item.articleId,
        name: artName,
        quantity: item.quantity,
        series: artSeries
      });

      itemReads.push({
        item,
        artRef,
        artSnap,
        fromInvRef,
        fromInvSnap,
        toInvRef,
        toInvSnap
      });
    }

    // 2. Writes
    for (const read of itemReads) {
      // From warehouse
      const fromQty = read.fromInvSnap.exists() ? read.fromInvSnap.data().quantity || 0 : 0;
      let fromSeries = read.fromInvSnap.exists() ? read.fromInvSnap.data().seriesList || [] : [];
      if (read.item.seriesList && read.item.seriesList.length > 0) {
        fromSeries = fromSeries.filter((s: string) => !read.item.seriesList!.includes(s));
      }
      transaction.set(read.fromInvRef, {
        id: `${fromWarehouseId}_${read.item.articleId}`,
        warehouseId: fromWarehouseId,
        articleId: read.item.articleId,
        quantity: Math.max(0, fromQty - read.item.quantity),
        seriesList: fromSeries,
        userId,
        enterpriseId: userId
      }, { merge: true });

      // To warehouse
      const toQty = read.toInvSnap.exists() ? read.toInvSnap.data().quantity || 0 : 0;
      let toSeries = read.toInvSnap.exists() ? read.toInvSnap.data().seriesList || [] : [];
      if (read.item.seriesList && read.item.seriesList.length > 0) {
        toSeries = [...toSeries, ...read.item.seriesList];
      }
      transaction.set(read.toInvRef, {
        id: `${toWarehouseId}_${read.item.articleId}`,
        warehouseId: toWarehouseId,
        articleId: read.item.articleId,
        quantity: toQty + read.item.quantity,
        seriesList: toSeries,
        userId,
        enterpriseId: userId
      }, { merge: true });
    }

    const transferRef = doc(collection(db, 'transfers'));
    transaction.set(transferRef, {
      fromWarehouseId,
      fromWarehouseName: fromName,
      toWarehouseId,
      toWarehouseName: toName,
      articles: detailedArticles,
      reason,
      comment,
      timestamp: Timestamp.now(),
      userId,
      enterpriseId: userId
    });
  });
}

/**
 * Executes a Loan or Return from a commercial house atomically via runTransaction.
 */
export async function executeLoanReturn(
  userId: string,
  type: 'LOAN' | 'RETURN',
  commercialHouse: string,
  warehouseId: string,
  isDirectSale: boolean,
  articlesList: Array<{ articleId: string; quantity: number; seriesList?: string[] }>,
  personName: string,
  comment: string
) {
  await runTransaction(db, async (transaction) => {
    let warehouseName = 'Venta Directa';
    if (warehouseId) {
      const whSnap = await transaction.get(doc(db, 'warehouses', warehouseId));
      warehouseName = whSnap.exists() ? whSnap.data().name : 'Desconocida';
    }

    const detailedArticles = [];
    const itemReads = [];

    for (const item of articlesList) {
      const artRef = doc(db, 'articles', item.articleId);
      const artSnap = await transaction.get(artRef);
      const artName = artSnap.exists() ? artSnap.data().name : 'Artículo';
      const artSeries = artSnap.exists() ? artSnap.data().series || '' : '';

      let invRef = null;
      let invSnap = null;
      if (warehouseId) {
        invRef = doc(db, 'warehouse_inventory', `${warehouseId}_${item.articleId}`);
        invSnap = await transaction.get(invRef);
      }

      detailedArticles.push({
        articleId: item.articleId,
        name: artName,
        quantity: item.quantity,
        series: artSeries
      });

      itemReads.push({ item, artRef, artSnap, invRef, invSnap });
    }

    for (const read of itemReads) {
      const qty = read.item.quantity;
      if (type === 'LOAN') {
        if (!isDirectSale && read.invRef && read.invSnap) {
          const curQty = read.invSnap.exists() ? read.invSnap.data().quantity || 0 : 0;
          let curSeries = read.invSnap.exists() ? read.invSnap.data().seriesList || [] : [];
          if (read.item.seriesList && read.item.seriesList.length > 0) {
            curSeries = [...curSeries, ...read.item.seriesList];
          }
          transaction.set(read.invRef, {
            id: `${warehouseId}_${read.item.articleId}`,
            warehouseId,
            articleId: read.item.articleId,
            quantity: curQty + qty,
            seriesList: curSeries,
            userId,
            enterpriseId: userId
          }, { merge: true });

          if (read.artSnap.exists()) {
            const curGlobalQty = read.artSnap.data().quantity || 0;
            let curGlobalSeries = read.artSnap.data().seriesList || [];
            if (read.item.seriesList && read.item.seriesList.length > 0) {
              curGlobalSeries = [...curGlobalSeries, ...read.item.seriesList];
            }
            transaction.update(read.artRef, { quantity: curGlobalQty + qty, seriesList: curGlobalSeries });
          }
        } else {
          if (read.artSnap.exists()) {
            const curGlobalQty = read.artSnap.data().quantity || 0;
            transaction.update(read.artRef, { quantity: curGlobalQty + qty });
          }
        }
      } else {
        // RETURN
        if (read.invRef && read.invSnap) {
          const curQty = read.invSnap.exists() ? read.invSnap.data().quantity || 0 : 0;
          let curSeries = read.invSnap.exists() ? read.invSnap.data().seriesList || [] : [];
          if (read.item.seriesList && read.item.seriesList.length > 0) {
            curSeries = curSeries.filter((s: string) => !read.item.seriesList!.includes(s));
          }
          transaction.set(read.invRef, {
            id: `${warehouseId}_${read.item.articleId}`,
            warehouseId,
            articleId: read.item.articleId,
            quantity: Math.max(0, curQty - qty),
            seriesList: curSeries,
            userId,
            enterpriseId: userId
          }, { merge: true });

          if (read.artSnap.exists()) {
            const curGlobalQty = read.artSnap.data().quantity || 0;
            let curGlobalSeries = read.artSnap.data().seriesList || [];
            if (read.item.seriesList && read.item.seriesList.length > 0) {
              curGlobalSeries = curGlobalSeries.filter((s: string) => !read.item.seriesList!.includes(s));
            }
            transaction.update(read.artRef, { quantity: Math.max(0, curGlobalQty - qty), seriesList: curGlobalSeries });
          }
        }
      }
    }

    const docRef = doc(collection(db, 'loans_returns'));
    transaction.set(docRef, {
      type,
      commercialHouse,
      warehouseId: isDirectSale ? '' : warehouseId,
      warehouseName: isDirectSale ? 'Venta Directa' : warehouseName,
      isDirectSale: type === 'LOAN' ? isDirectSale : false,
      articles: detailedArticles,
      personName,
      comment,
      timestamp: Timestamp.now(),
      userId,
      enterpriseId: userId
    });
  });
}

/**
 * Executes a sales operation atomically via runTransaction.
 */
export async function executeInventorySale(
  userId: string,
  clientName: string,
  sellerId: string,
  sellerName: string,
  soldItemsList: Array<{ articleId: string; quantity: number; warehouseId: string; isGift: boolean; seriesList?: string[] }>
) {
  await runTransaction(db, async (transaction) => {
    const detailedSoldArticles = [];
    const itemReads = [];

    for (const item of soldItemsList) {
      const whRef = doc(db, 'warehouses', item.warehouseId);
      const artRef = doc(db, 'articles', item.articleId);
      const invRef = doc(db, 'warehouse_inventory', `${item.warehouseId}_${item.articleId}`);

      const whSnap = await transaction.get(whRef);
      const artSnap = await transaction.get(artRef);
      const invSnap = await transaction.get(invRef);

      const whName = whSnap.exists() ? whSnap.data().name : 'Desconocida';
      const artName = artSnap.exists() ? artSnap.data().name : 'Artículo';

      detailedSoldArticles.push({
        articleId: item.articleId,
        name: artName,
        quantity: item.quantity,
        warehouseId: item.warehouseId,
        warehouseName: whName,
        isGift: item.isGift
      });

      itemReads.push({ item, artRef, artSnap, invRef, invSnap });
    }

    for (const read of itemReads) {
      const qty = read.item.quantity;
      const curInvQty = read.invSnap.exists() ? read.invSnap.data().quantity || 0 : 0;
      let curInvSeries = read.invSnap.exists() ? read.invSnap.data().seriesList || [] : [];
      if (read.item.seriesList && read.item.seriesList.length > 0) {
        curInvSeries = curInvSeries.filter((s: string) => !read.item.seriesList!.includes(s));
      }

      transaction.set(read.invRef, {
        id: `${read.item.warehouseId}_${read.item.articleId}`,
        warehouseId: read.item.warehouseId,
        articleId: read.item.articleId,
        quantity: Math.max(0, curInvQty - qty),
        seriesList: curInvSeries,
        userId,
        enterpriseId: userId
      }, { merge: true });

      if (read.artSnap.exists()) {
        const curGlobalQty = read.artSnap.data().quantity || 0;
        let curGlobalSeries = read.artSnap.data().seriesList || [];
        if (read.item.seriesList && read.item.seriesList.length > 0) {
          curGlobalSeries = curGlobalSeries.filter((s: string) => !read.item.seriesList!.includes(s));
        }
        transaction.update(read.artRef, { quantity: Math.max(0, curGlobalQty - qty), seriesList: curGlobalSeries });
      }
    }

    const saleRef = doc(collection(db, 'inventory_sales'));
    transaction.set(saleRef, {
      clientName,
      sellerId,
      sellerName,
      soldArticles: detailedSoldArticles,
      timestamp: Timestamp.now(),
      userId,
      enterpriseId: userId
    });
  });
}

/**
 * Reverts a warehouse stock transfer atomically via runTransaction.
 */
export async function revertTransfer(transferId: string, userId: string, revertReason: string) {
  await runTransaction(db, async (transaction) => {
    const transferRef = doc(db, 'transfers', transferId);
    const transferSnap = await transaction.get(transferRef);
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
    const itemReads = [];

    for (const item of articles) {
      const toInvRef = doc(db, 'warehouse_inventory', `${toWarehouseId}_${item.articleId}`);
      const fromInvRef = doc(db, 'warehouse_inventory', `${fromWarehouseId}_${item.articleId}`);
      const artRef = doc(db, 'articles', item.articleId);

      const toInvSnap = await transaction.get(toInvRef);
      const fromInvSnap = await transaction.get(fromInvRef);
      const artSnap = await transaction.get(artRef);

      itemReads.push({ item, toInvRef, toInvSnap, fromInvRef, fromInvSnap, artRef, artSnap });
    }

    const revertedArticlesLog: Array<{ articleId: string; name: string; requested: number; actual: number }> = [];

    for (const read of itemReads) {
      const availableQty = read.toInvSnap.exists() ? read.toInvSnap.data().quantity || 0 : 0;
      const qToRevert = Math.min(read.item.quantity, availableQty);

      revertedArticlesLog.push({
        articleId: read.item.articleId,
        name: read.item.name,
        requested: read.item.quantity,
        actual: qToRevert
      });

      // Add back to fromWarehouse
      const fromQty = read.fromInvSnap.exists() ? read.fromInvSnap.data().quantity || 0 : 0;
      let fromSeries = read.fromInvSnap.exists() ? read.fromInvSnap.data().seriesList || [] : [];
      if (read.item.seriesList && read.item.seriesList.length > 0) {
        fromSeries = [...fromSeries, ...read.item.seriesList];
      }
      transaction.set(read.fromInvRef, {
        id: `${fromWarehouseId}_${read.item.articleId}`,
        warehouseId: fromWarehouseId,
        articleId: read.item.articleId,
        quantity: fromQty + qToRevert,
        seriesList: fromSeries,
        userId,
        enterpriseId: userId
      }, { merge: true });

      // Deduct from toWarehouse
      let toSeries = read.toInvSnap.exists() ? read.toInvSnap.data().seriesList || [] : [];
      if (read.item.seriesList && read.item.seriesList.length > 0) {
        toSeries = toSeries.filter((s: string) => !read.item.seriesList!.includes(s));
      }
      transaction.set(read.toInvRef, {
        id: `${toWarehouseId}_${read.item.articleId}`,
        warehouseId: toWarehouseId,
        articleId: read.item.articleId,
        quantity: Math.max(0, availableQty - qToRevert),
        seriesList: toSeries,
        userId,
        enterpriseId: userId
      }, { merge: true });
    }

    transaction.update(transferRef, {
      status: 'ELIMINADO',
      revertReason,
      revertedArticles: revertedArticlesLog,
      revertedAt: Timestamp.now()
    });
  });
}

/**
 * Reverts a loan or return atomically via runTransaction.
 */
export async function revertLoanReturn(loanReturnId: string, userId: string, revertReason: string) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'loans_returns', loanReturnId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error('El movimiento no existe.');
    }
    const data = snap.data();
    if (data.status === 'ELIMINADO') {
      throw new Error('Este movimiento ya fue eliminado/revertida.');
    }
    const type = data.type;
    const warehouseId = data.warehouseId;
    const isDirectSale = data.isDirectSale;
    const articles = data.articles || [];

    const itemReads = [];
    for (const item of articles) {
      const artRef = doc(db, 'articles', item.articleId);
      const artSnap = await transaction.get(artRef);
      let invRef = null;
      let invSnap = null;
      if (warehouseId) {
        invRef = doc(db, 'warehouse_inventory', `${warehouseId}_${item.articleId}`);
        invSnap = await transaction.get(invRef);
      }
      itemReads.push({ item, artRef, artSnap, invRef, invSnap });
    }

    const revertedArticlesLog: Array<{ articleId: string; name: string; requested: number; actual: number }> = [];

    for (const read of itemReads) {
      const curGlobalQty = read.artSnap.exists() ? read.artSnap.data().quantity || 0 : 0;
      if (type === 'LOAN') {
        if (!isDirectSale && warehouseId && read.invRef && read.invSnap) {
          const availableQty = read.invSnap.exists() ? read.invSnap.data().quantity || 0 : 0;
          const qToRevert = Math.min(read.item.quantity, availableQty);

          revertedArticlesLog.push({
            articleId: read.item.articleId,
            name: read.item.name,
            requested: read.item.quantity,
            actual: qToRevert
          });

          let curSeries = read.invSnap.exists() ? read.invSnap.data().seriesList || [] : [];
          if (read.item.seriesList && read.item.seriesList.length > 0) {
            curSeries = curSeries.filter((s: string) => !read.item.seriesList!.includes(s));
          }

          transaction.set(read.invRef, {
            id: `${warehouseId}_${read.item.articleId}`,
            warehouseId,
            articleId: read.item.articleId,
            quantity: Math.max(0, availableQty - qToRevert),
            seriesList: curSeries,
            userId,
            enterpriseId: userId
          }, { merge: true });

          if (read.artSnap.exists()) {
            let curGlobalSeries = read.artSnap.data().seriesList || [];
            if (read.item.seriesList && read.item.seriesList.length > 0) {
              curGlobalSeries = curGlobalSeries.filter((s: string) => !read.item.seriesList!.includes(s));
            }
            transaction.update(read.artRef, {
              quantity: Math.max(0, curGlobalQty - qToRevert),
              seriesList: curGlobalSeries
            });
          }
        } else {
          const qToRevert = Math.min(read.item.quantity, curGlobalQty);
          revertedArticlesLog.push({
            articleId: read.item.articleId,
            name: read.item.name,
            requested: read.item.quantity,
            actual: qToRevert
          });
          transaction.update(read.artRef, { quantity: Math.max(0, curGlobalQty - qToRevert) });
        }
      } else {
        // RETURN revert: add stock back
        revertedArticlesLog.push({
          articleId: read.item.articleId,
          name: read.item.name,
          requested: read.item.quantity,
          actual: read.item.quantity
        });
        if (warehouseId && read.invRef && read.invSnap) {
          const availableQty = read.invSnap.exists() ? read.invSnap.data().quantity || 0 : 0;
          let curSeries = read.invSnap.exists() ? read.invSnap.data().seriesList || [] : [];
          if (read.item.seriesList && read.item.seriesList.length > 0) {
            curSeries = [...curSeries, ...read.item.seriesList];
          }
          transaction.set(read.invRef, {
            id: `${warehouseId}_${read.item.articleId}`,
            warehouseId,
            articleId: read.item.articleId,
            quantity: availableQty + read.item.quantity,
            seriesList: curSeries,
            userId,
            enterpriseId: userId
          }, { merge: true });

          if (read.artSnap.exists()) {
            let curGlobalSeries = read.artSnap.data().seriesList || [];
            if (read.item.seriesList && read.item.seriesList.length > 0) {
              curGlobalSeries = [...curGlobalSeries, ...read.item.seriesList];
            }
            transaction.update(read.artRef, {
              quantity: curGlobalQty + read.item.quantity,
              seriesList: curGlobalSeries
            });
          }
        }
      }
    }

    transaction.update(ref, {
      status: 'ELIMINADO',
      revertReason,
      revertedArticles: revertedArticlesLog,
      revertedAt: Timestamp.now()
    });
  });
}

/**
 * Reverts an inventory sale atomically via runTransaction.
 */
export async function revertInventorySale(saleId: string, userId: string, revertReason: string) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'inventory_sales', saleId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error('La venta no existe.');
    }
    const data = snap.data();
    if (data.status === 'ELIMINADO') {
      throw new Error('Esta venta ya fue eliminada/revertida.');
    }
    const soldArticles = data.soldArticles || [];
    const itemReads = [];

    for (const item of soldArticles) {
      const invRef = doc(db, 'warehouse_inventory', `${item.warehouseId}_${item.articleId}`);
      const articleRef = doc(db, 'articles', item.articleId);

      const invSnap = await transaction.get(invRef);
      const artSnap = await transaction.get(articleRef);

      itemReads.push({ item, invRef, invSnap, articleRef, artSnap });
    }

    for (const read of itemReads) {
      const curInvQty = read.invSnap.exists() ? read.invSnap.data().quantity || 0 : 0;
      let curInvSeries = read.invSnap.exists() ? read.invSnap.data().seriesList || [] : [];
      if (read.item.seriesList && read.item.seriesList.length > 0) {
        curInvSeries = [...curInvSeries, ...read.item.seriesList];
      }

      transaction.set(read.invRef, {
        id: `${read.item.warehouseId}_${read.item.articleId}`,
        warehouseId: read.item.warehouseId,
        articleId: read.item.articleId,
        quantity: curInvQty + read.item.quantity,
        seriesList: curInvSeries,
        userId,
        enterpriseId: userId
      }, { merge: true });

      if (read.artSnap.exists()) {
        const curGlobalQty = read.artSnap.data().quantity || 0;
        let curGlobalSeries = read.artSnap.data().seriesList || [];
        if (read.item.seriesList && read.item.seriesList.length > 0) {
          curGlobalSeries = [...curGlobalSeries, ...read.item.seriesList];
        }
        transaction.update(read.artRef, {
          quantity: curGlobalQty + read.item.quantity,
          seriesList: curGlobalSeries
        });
      }
    }

    transaction.update(ref, {
      status: 'ELIMINADO',
      revertReason,
      revertedAt: Timestamp.now()
    });
  });
}

/**
 * Creates a new article or adds stock to a matched existing article atomically via runTransaction.
 */
export async function saveArticleWithStockTransaction(
  articleData: {
    category: string;
    brand: string;
    model: string;
    computedName: string;
    requiresSeries: boolean;
    seriesList: string[];
    barcode: string;
    minStockAlert: number;
    initialQuantity: number;
    initialWarehouseId: string;
  },
  matchedArticleId: string | null,
  enterpriseId: string,
  createdById?: string
) {
  if (!enterpriseId) {
    throw new Error('Empresa no identificada. No se puede guardar el artículo.');
  }

  const safeCreatedBy = createdById || enterpriseId || '';

  await runTransaction(db, async (transaction) => {
    let artRef;
    let artId = matchedArticleId;

    if (artId) {
      artRef = doc(db, 'articles', artId);
    } else {
      artRef = doc(collection(db, 'articles'));
      artId = artRef.id;
    }

    const invRef = articleData.initialWarehouseId
      ? doc(db, 'warehouse_inventory', `${articleData.initialWarehouseId}_${artId}`)
      : null;

    // === PHASE 1: READS ONLY ===
    let artSnap = null;
    if (matchedArticleId) {
      artSnap = await transaction.get(artRef);
    }

    let invSnap = null;
    if (invRef) {
      invSnap = await transaction.get(invRef);
    }

    // === PHASE 2: WRITES ONLY ===
    if (matchedArticleId) {
      // Matched existing article - update global quantity and seriesList
      let currentQty = 0;
      let currentSeriesList: string[] = [];
      if (artSnap && artSnap.exists()) {
        currentQty = artSnap.data().quantity || 0;
        currentSeriesList = artSnap.data().seriesList || [];
      }

      transaction.update(artRef, {
        quantity: currentQty + articleData.initialQuantity,
        seriesList: [...currentSeriesList, ...articleData.seriesList]
      });
    } else {
      // Brand new article
      const newArticle = {
        name: articleData.computedName,
        category: articleData.category,
        brand: articleData.brand,
        model: articleData.model,
        requiresSeries: articleData.requiresSeries,
        seriesList: articleData.seriesList,
        barcode: articleData.barcode,
        minStockAlert: articleData.minStockAlert,
        quantity: articleData.initialQuantity,
        userId: enterpriseId,
        enterpriseId: enterpriseId,
        createdBy: safeCreatedBy,
        createdAt: Timestamp.now()
      };
      transaction.set(artRef, newArticle);
    }

    if (invRef && articleData.initialWarehouseId) {
      const invId = `${articleData.initialWarehouseId}_${artId}`;
      if (invSnap && invSnap.exists()) {
        const existingQty = invSnap.data().quantity || 0;
        const existingSeries = invSnap.data().seriesList || [];
        transaction.update(invRef, {
          quantity: existingQty + articleData.initialQuantity,
          seriesList: [...existingSeries, ...articleData.seriesList]
        });
      } else {
        transaction.set(invRef, {
          id: invId,
          warehouseId: articleData.initialWarehouseId,
          articleId: artId,
          quantity: articleData.initialQuantity,
          seriesList: articleData.seriesList,
          userId: enterpriseId,
          enterpriseId: enterpriseId,
          createdBy: safeCreatedBy
        });
      }
    }
  });
}
