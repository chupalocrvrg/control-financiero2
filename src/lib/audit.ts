import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User } from 'firebase/auth';
import { handleFirestoreError, OperationType } from './firestore-errors';

export enum AuditAction {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_DELETE = 'USER_DELETE',
  CHECK_CREATE = 'CHECK_CREATE',
  CHECK_UPDATE = 'CHECK_UPDATE',
  CHECK_DELETE = 'CHECK_DELETE', // Soft delete
  CHECK_RESTORE = 'CHECK_RESTORE',
  DB_VACUUM = 'DB_VACUUM',
  SETTINGS_UPDATE = 'SETTINGS_UPDATE',
  SENSITIVE_READ = 'SENSITIVE_READ',
  EMPLOYEE_UPDATE = 'EMPLOYEE_UPDATE',
  BUDGET_UPDATE = 'BUDGET_UPDATE',
  SALE_CREATE = 'SALE_CREATE',
  SALE_UPDATE = 'SALE_UPDATE',
  SALE_DELETE = 'SALE_DELETE',
  COLLECTION_CREATE = 'COLLECTION_CREATE',
  COLLECTION_UPDATE = 'COLLECTION_UPDATE',
  COLLECTION_DELETE = 'COLLECTION_DELETE',
}

export async function logAudit(action: AuditAction, details: string, targetId?: string, overrideUser?: User | null) {
  const path = 'auditLogs';
  try {
    const user = overrideUser || auth.currentUser;
    const docRef = doc(collection(db, path));
    await setDoc(docRef, {
      action,
      details,
      targetId: targetId || null,
      userId: user?.uid || 'system',
      userEmail: user?.email || 'system',
      timestamp: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('Failed to log audit:', error);
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
