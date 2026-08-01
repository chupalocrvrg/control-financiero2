import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, setDoc } from 'firebase/firestore';
import { logAudit, AuditAction } from './audit';

let cachedDerickUid: string | null = null;

/**
 * Resolves the Firestore UID of "Almacenes Derick" (user email creditosderick15@gmail.com)
 */
export async function getDerickEnterpriseUid(): Promise<string> {
  if (cachedDerickUid) return cachedDerickUid;

  try {
    // 1. Search user by exact email creditosderick15@gmail.com
    const qEmail = query(collection(db, 'users'), where('email', '==', 'creditosderick15@gmail.com'));
    const snapEmail = await getDocs(qEmail);

    if (!snapEmail.empty) {
      cachedDerickUid = snapEmail.docs[0].id;
      return cachedDerickUid;
    }

    // 2. Search enterprise users by name containing 'derick'
    const qEnt = query(collection(db, 'users'), where('role', '==', 'enterprise'));
    const snapEnt = await getDocs(qEnt);

    const derickDoc = snapEnt.docs.find(d => {
      const data = d.data();
      const name = (data.name || '').toLowerCase();
      const email = (data.email || '').toLowerCase();
      return name.includes('derick') || email.includes('derick');
    });

    if (derickDoc) {
      cachedDerickUid = derickDoc.id;
      return cachedDerickUid;
    }

    // 3. Fallback to first enterprise user if exists
    if (!snapEnt.empty) {
      cachedDerickUid = snapEnt.docs[0].id;
      return cachedDerickUid;
    }
  } catch (err) {
    console.error('Error resolving Derick enterprise UID:', err);
  }

  return '';
}

/**
 * Unifies duplicate employee records, links budgets and sales to Almacenes Derick (creditosderick15@gmail.com)
 */
export async function unifyEmployeesAndBudgets(): Promise<{ unifiedCount: number; salesLinked: number; budgetsLinked: number }> {
  let unifiedCount = 0;
  let salesLinked = 0;
  let budgetsLinked = 0;

  try {
    const derickUid = await getDerickEnterpriseUid();
    if (!derickUid) return { unifiedCount, salesLinked, budgetsLinked };

    // 1. Fetch all employees
    const empSnap = await getDocs(collection(db, 'employees'));
    const allEmps = empSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // Group by normalized full name
    const grouped: Record<string, any[]> = {};
    allEmps.forEach(emp => {
      const key = `${emp.name || ''} ${emp.lastName || ''}`.trim().toLowerCase();
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(emp);
    });

    for (const key of Object.keys(grouped)) {
      const emps = grouped[key];
      // Find master employee: prefer one already assigned to derickUid
      let primary = emps.find(e => e.enterpriseId === derickUid) || emps[0];

      // Ensure primary employee belongs to derickUid
      if (primary.enterpriseId !== derickUid) {
        await updateDoc(doc(db, 'employees', primary.id), {
          enterpriseId: derickUid
        });
      }

      // Merge remaining duplicate employees into primary
      const duplicates = emps.filter(e => e.id !== primary.id);
      for (const dup of duplicates) {
        // Migrate sales
        const salesQ = query(collection(db, 'sales'), where('employeeId', '==', dup.id));
        const salesSnap = await getDocs(salesQ);
        for (const sDoc of salesSnap.docs) {
          await updateDoc(doc(db, 'sales', sDoc.id), {
            employeeId: primary.id,
            enterpriseId: derickUid
          });
          salesLinked++;
        }

        // Migrate collections
        const collsQ = query(collection(db, 'collections'), where('employeeId', '==', dup.id));
        const collsSnap = await getDocs(collsQ);
        for (const cDoc of collsSnap.docs) {
          await updateDoc(doc(db, 'collections', cDoc.id), {
            employeeId: primary.id,
            enterpriseId: derickUid
          });
        }

        // Migrate budgets
        const budgetsQ = query(collection(db, 'budgets'), where('employeeId', '==', dup.id));
        const budgetsSnap = await getDocs(budgetsQ);
        for (const bDoc of budgetsSnap.docs) {
          await updateDoc(doc(db, 'budgets', bDoc.id), {
            employeeId: primary.id,
            enterpriseId: derickUid
          });
          budgetsLinked++;
        }

        // Delete duplicate employee document
        await deleteDoc(doc(db, 'employees', dup.id));
        unifiedCount++;
      }
    }

    // 2. Link unassigned sales to derickUid
    const allSalesSnap = await getDocs(collection(db, 'sales'));
    for (const sDoc of allSalesSnap.docs) {
      const data = sDoc.data();
      if (!data.enterpriseId) {
        await updateDoc(doc(db, 'sales', sDoc.id), {
          enterpriseId: derickUid
        });
        salesLinked++;
      }
    }

    // 3. Link unassigned budgets to derickUid and merge duplicate monthly budgets for same employee
    const allBudgetsSnap = await getDocs(collection(db, 'budgets'));
    const budgetKeyMap: Record<string, any[]> = {};

    for (const bDoc of allBudgetsSnap.docs) {
      const data = bDoc.data();
      if (!data.enterpriseId) {
        await updateDoc(doc(db, 'budgets', bDoc.id), {
          enterpriseId: derickUid
        });
        budgetsLinked++;
      }
      const bKey = `${data.employeeId}_${data.month}`;
      if (!budgetKeyMap[bKey]) budgetKeyMap[bKey] = [];
      budgetKeyMap[bKey].push({ id: bDoc.id, ...data });
    }

    // Unify duplicate budget records for same employee & month
    for (const bKey of Object.keys(budgetKeyMap)) {
      const list = budgetKeyMap[bKey];
      if (list.length > 1) {
        const masterB = list[0];
        let totalSales = masterB.salesBudget || 0;
        let totalColls = masterB.collectionsBudget || 0;

        for (let i = 1; i < list.length; i++) {
          totalSales = Math.max(totalSales, list[i].salesBudget || 0);
          totalColls = Math.max(totalColls, list[i].collectionsBudget || 0);
          await deleteDoc(doc(db, 'budgets', list[i].id));
        }

        await updateDoc(doc(db, 'budgets', masterB.id), {
          salesBudget: totalSales,
          collectionsBudget: totalColls,
          enterpriseId: derickUid
        });
      }
    }

    if (unifiedCount > 0 || salesLinked > 0 || budgetsLinked > 0) {
      logAudit(
        AuditAction.EMPLOYEE_UPDATE,
        `UNIFICACIÓN ALMACENES DERICK: Se unificaron ${unifiedCount} empleados duplicados, ${salesLinked} ventas y ${budgetsLinked} presupuestos bajo Almacenes Derick.`
      );
    }
  } catch (err) {
    console.error('Error unifying employees and budgets:', err);
  }

  return { unifiedCount, salesLinked, budgetsLinked };
}
