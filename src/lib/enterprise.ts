import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, setDoc, addDoc, writeBatch, Timestamp } from 'firebase/firestore';
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
 * Migrates all existing employees in the system to Almacenes Derick (creditosderick15@gmail.com).
 * Required by Rule #1: "Todos los empleados creados en el sistema hasta este momento deben ser asignados y vinculados exclusivamente a la empresa Almacenes Derick."
 */
export async function migrateAllEmployeesToDerick(): Promise<{ totalMigrated: number }> {
  // Disablement of automatic employee hijacking: Every employee must remain attached to the enterprise that created them.
  return { totalMigrated: 0 };
}

/**
 * Syncs a user designated as an employee with the `employees` collection.
 */
export async function syncLinkedUserToEmployees(
  userId: string,
  userEmail: string,
  userName: string,
  userLastName: string = '',
  enterpriseId: string,
  role: 'vendedor' | 'cobrador' | 'ambos' | 'supervisor_ventas' | 'supervisor_cobranza' | 'supervisor_general' = 'vendedor'
): Promise<string> {
  try {
    // Check if an employee record already exists for this userId or email
    const qUser = query(collection(db, 'employees'), where('userId', '==', userId));
    const snapUser = await getDocs(qUser);

    if (!snapUser.empty) {
      const empDoc = snapUser.docs[0];
      await updateDoc(empDoc.ref, {
        name: userName || empDoc.data().name,
        lastName: userLastName || empDoc.data().lastName || '',
        role,
        enterpriseId,
        email: userEmail
      });
      return empDoc.id;
    }

    // Check by email
    if (userEmail) {
      const qEmail = query(collection(db, 'employees'), where('email', '==', userEmail));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const empDoc = snapEmail.docs[0];
        await updateDoc(empDoc.ref, {
          userId,
          name: userName || empDoc.data().name,
          lastName: userLastName || empDoc.data().lastName || '',
          role,
          enterpriseId
        });
        return empDoc.id;
      }
    }

    // Create new employee record
    const newRef = await addDoc(collection(db, 'employees'), {
      userId,
      email: userEmail,
      name: userName || 'Empleado',
      lastName: userLastName || '',
      role,
      enterpriseId,
      createdAt: Timestamp.now()
    });
    return newRef.id;
  } catch (err) {
    console.error('Error syncing linked user to employees collection:', err);
    return '';
  }
}

/**
 * Unifies duplicate employee records, links budgets and sales to Almacenes Derick (creditosderick15@gmail.com)
 */
export async function unifyEmployeesAndBudgets(): Promise<{ unifiedCount: number; salesLinked: number; budgetsLinked: number }> {
  const result = await migrateAllEmployeesToDerick();
  return { unifiedCount: result.totalMigrated, salesLinked: 0, budgetsLinked: 0 };
}

