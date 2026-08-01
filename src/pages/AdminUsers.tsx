import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../firebase';
import { collection, getDocs, getDoc, doc, updateDoc, query, where, orderBy, deleteDoc, addDoc, serverTimestamp, limit, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { formatCurrency, cn, hashPin } from '../lib/utils';
import { format, parseISO, addDays, addMonths, addYears } from 'date-fns';
import { Users, User, Shield, Calendar, Eye, Ban, CheckCircle, Search, Edit3, X, Download, ShieldCheck, Mail, Clock, Lock, Trash2, Plus, ArrowRight, RotateCcw, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getDynamicVersions, ChangelogRelease } from '../lib/changelog';
import { logAudit, AuditAction } from '../lib/audit';
import { isSuperAdminEmail } from '../lib/utils';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  subscriptionEnd: string;
  pin: string;
  createdAt: string;
}

export default function AdminUsers({ mode = "USERS" }: { mode?: "USERS" | "HISTORY" | "AUDIT" | "TRASH" | "ENTITIES" }) {
  const { user, isAdmin, profile, impersonateUser, originalUser, verifyPin } = useAuth();
  const { settings } = useSettings();
  const { showToast, showAlert, showConfirm } = useNotification();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkSearchTerm, setCheckSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPinValue, setNewPinValue] = useState('');
  
  const [showAdminConfirmModal, setShowAdminConfirmModal] = useState(false);
  const [adminPinValue, setAdminPinValue] = useState('');
  
  const [showDeleteUserConfirmModal, setShowDeleteUserConfirmModal] = useState(false);
  const [deleteUserPinValue, setDeleteUserPinValue] = useState('');

  const [viewingUserInstance, setViewingUserInstance] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<'USERS' | 'HISTORY' | 'AUDIT' | 'TRASH' | 'ENTITIES'>(mode);
  useEffect(() => { setActiveTab(mode); }, [mode]);
  const [editingEntityUser, setEditingEntityUser] = useState<any | null>(null);
  const [entityFormData, setEntityFormData] = useState({
    role: 'enterprise',
    enterpriseId: ''
  });
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [userChecks, setUserChecks] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [viewingUserSettings, setViewingUserSettings] = useState<any>(null);
  const [dynamicVersions, setDynamicVersions] = useState<ChangelogRelease[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [editingCheck, setEditingCheck] = useState<any | null>(null);
  const [checkToDelete, setCheckToDelete] = useState<string | null>(null);
  const [isAddingCheck, setIsAddingCheck] = useState(false);
  const [checkFormData, setCheckFormData] = useState({
    beneficiaryName: '',
    checkNumber: '',
    concept: '',
    amount: 0,
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'PENDING',
    bank: '',
  });

  const isSuperAdmin = isSuperAdminEmail(originalUser?.email);

  // Personal & Budget Migration Tool States
  const [migrationEmployees, setMigrationEmployees] = useState<any[]>([]);
  const [selectedMigrationEmployee, setSelectedMigrationEmployee] = useState<string>('');
  const [selectedMigrationTargetEnterprise, setSelectedMigrationTargetEnterprise] = useState<string>('');
  const [migrating, setMigrating] = useState(false);
  const [migrationStats, setMigrationStats] = useState<{ budgets: number, sales: number, collections: number } | null>(null);

  // Checks/Expenses Migration to Almacenes Derick States
  const [migratingChecks, setMigratingChecks] = useState(false);
  const [unassignedChecksCount, setUnassignedChecksCount] = useState<number | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      loadUsers();
      if (activeTab === 'AUDIT') loadAuditLogs();
      if (activeTab === 'TRASH') loadTrashItems();
      if (activeTab === 'HISTORY') loadDynamicVersions();
      if (activeTab === 'ENTITIES') {
        loadMigrationEmployees();
        fetchUnassignedChecksCount();
      }
    }
  }, [isSuperAdmin, activeTab]);

  const fetchUnassignedChecksCount = async () => {
    try {
      const checksSnap = await getDocs(collection(db, 'checks'));
      let unassigned = 0;
      checksSnap.docs.forEach(doc => {
        if (!doc.data().enterpriseId) {
          unassigned++;
        }
      });
      setUnassignedChecksCount(unassigned);
    } catch (e) {
      console.error("Error fetching unassigned checks:", e);
    }
  };

  const handleMigrateChecksToDerick = async () => {
    try {
      setMigratingChecks(true);
      // 1. Get Almacenes Derick
      const usersQ = query(collection(db, 'users'), where('role', '==', 'enterprise'));
      const usersSnap = await getDocs(usersQ);
      let derickId = '';
      
      const enterprises = usersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      const derickUser = enterprises.find(u => 
        u.name?.toLowerCase().includes('derick') || 
        u.name?.toLowerCase().includes('deric') ||
        u.email?.toLowerCase().includes('derick') ||
        u.email?.toLowerCase().includes('deric')
      );
      
      if (derickUser) {
        derickId = derickUser.id;
      } else if (enterprises.length > 0) {
        derickId = enterprises[0].id;
      }

      if (!derickId) {
        showToast('No se encontró ninguna empresa "Almacenes Derick" ni ninguna otra empresa principal para la migración.', 'error');
        return;
      }

      const derickName = derickUser ? derickUser.name : 'Primera Empresa Registrada';

      if (await showConfirm('Confirmar Migración de Egresos', `¿Desea migrar automáticamente todos los cheques, egresos, facturas y beneficiarios sin empresa asignada a "${derickName}"?`, { type: 'warning' })) {
        let checksCount = 0;
        const checksSnap = await getDocs(collection(db, 'checks'));
        for (const checkDoc of checksSnap.docs) {
          const data = checkDoc.data();
          if (!data.enterpriseId) {
            await updateDoc(doc(db, 'checks', checkDoc.id), {
              enterpriseId: derickId
            });
            checksCount++;
          }
        }

        let invoicesCount = 0;
        const invoicesSnap = await getDocs(collection(db, 'invoices'));
        for (const invoiceDoc of invoicesSnap.docs) {
          const data = invoiceDoc.data();
          if (!data.enterpriseId) {
            await updateDoc(doc(db, 'invoices', invoiceDoc.id), {
              enterpriseId: derickId
            });
            invoicesCount++;
          }
        }

        let beneficiariesCount = 0;
        const beneficiariesSnap = await getDocs(collection(db, 'beneficiaries'));
        for (const benDoc of beneficiariesSnap.docs) {
          const data = benDoc.data();
          if (!data.enterpriseId) {
            await updateDoc(doc(db, 'beneficiaries', benDoc.id), {
              enterpriseId: derickId
            });
            beneficiariesCount++;
          }
        }

        logAudit(
          AuditAction.SETTINGS_UPDATE, 
          `MIGRACIÓN DE EGRESOS: Se migraron ${checksCount} cheques, ${invoicesCount} facturas y ${beneficiariesCount} beneficiarios sin empresa asignada a la empresa "${derickName}" (ID: ${derickId}).`
        );

        showToast(`Migración completada con éxito. Se migraron ${checksCount} cheques a "${derickName}".`, 'success');
        fetchUnassignedChecksCount();
      }
    } catch (err: any) {
      console.error("Error migrando cheques:", err);
      showToast('Error al migrar cheques y egresos: ' + err.message, 'error');
    } finally {
      setMigratingChecks(false);
    }
  };

  const loadMigrationEmployees = async () => {
    try {
      const q = query(collection(db, 'employees'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as any);
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setMigrationEmployees(list);
    } catch (e) {
      console.error("Error cargando empleados para migración:", e);
    }
  };

  useEffect(() => {
    if (selectedMigrationEmployee) {
      fetchMigrationStats(selectedMigrationEmployee);
    } else {
      setMigrationStats(null);
    }
  }, [selectedMigrationEmployee]);

  const fetchMigrationStats = async (empId: string) => {
    try {
      const budgetsQ = query(collection(db, 'budgets'), where('employeeId', '==', empId));
      const budgetsSnap = await getDocs(budgetsQ);
      
      const salesQ = query(collection(db, 'sales'), where('employeeId', '==', empId));
      const salesSnap = await getDocs(salesQ);

      const collsQ = query(collection(db, 'collections'), where('employeeId', '==', empId));
      const collsSnap = await getDocs(collsQ);

      setMigrationStats({
        budgets: budgetsSnap.size,
        sales: salesSnap.size,
        collections: collsSnap.size
      });
    } catch (e) {
      console.error("Error calculando estadísticas de migración:", e);
    }
  };

  const handleExecuteMigration = async () => {
    if (!selectedMigrationEmployee || !selectedMigrationTargetEnterprise) {
      showToast('Por favor, seleccione un empleado y una empresa de destino.', 'error');
      return;
    }

    const emp = migrationEmployees.find(e => e.id === selectedMigrationEmployee);
    const targetCompany = users.find(u => u.id === selectedMigrationTargetEnterprise);

    if (!emp || !targetCompany) return;

    const confirmMsg = `¿Está seguro de migrar al empleado "${emp.name} ${emp.lastName}" a la empresa "${targetCompany.name}"?\n\n` +
      `Esto actualizará:\n` +
      `- El empleado asignado\n` +
      `- ${migrationStats?.budgets || 0} presupuestos mensuales asociados\n` +
      `- ${migrationStats?.sales || 0} ventas registradas\n` +
      `- ${migrationStats?.collections || 0} cobranzas registradas\n\n` +
      `Toda esta información pasará a pertenecer a la empresa de destino. Esta acción no se puede deshacer de forma automática.`;

    if (await showConfirm('Confirmar Migración Integral', confirmMsg, { type: 'warning' })) {
      try {
        setMigrating(true);
        setLoading(true);
        
        // 1. Update Employee enterpriseId
        await updateDoc(doc(db, 'employees', selectedMigrationEmployee), {
          enterpriseId: selectedMigrationTargetEnterprise
        });

        // 2. Update Budgets enterpriseId
        const budgetsQ = query(collection(db, 'budgets'), where('employeeId', '==', selectedMigrationEmployee));
        const budgetsSnap = await getDocs(budgetsQ);
        const budgetPromises = budgetsSnap.docs.map(d => 
          updateDoc(doc(db, 'budgets', d.id), {
            enterpriseId: selectedMigrationTargetEnterprise
          })
        );
        await Promise.all(budgetPromises);

        // 3. Update Sales enterpriseId
        const salesQ = query(collection(db, 'sales'), where('employeeId', '==', selectedMigrationEmployee));
        const salesSnap = await getDocs(salesQ);
        const salesPromises = salesSnap.docs.map(d => 
          updateDoc(doc(db, 'sales', d.id), {
            enterpriseId: selectedMigrationTargetEnterprise
          })
        );
        await Promise.all(salesPromises);

        // 4. Update Collections enterpriseId
        const collsQ = query(collection(db, 'collections'), where('employeeId', '==', selectedMigrationEmployee));
        const collsSnap = await getDocs(collsQ);
        const collsPromises = collsSnap.docs.map(d => 
          updateDoc(doc(db, 'collections', d.id), {
            enterpriseId: selectedMigrationTargetEnterprise
          })
        );
        await Promise.all(collsPromises);

        // Log audit
        logAudit(
          AuditAction.SETTINGS_UPDATE, 
          `MIGRACIÓN INTEGRAL: Empleado ${emp.name} ${emp.lastName} migrado a la empresa ${targetCompany.name} (UID: ${selectedMigrationTargetEnterprise}) junto con sus ${budgetsSnap.size} presupuestos, ${salesSnap.size} ventas y ${collsSnap.size} cobranzas.`
        );

        showToast('Migración integral ejecutada con éxito', 'success');
        
        // Reset state
        setSelectedMigrationEmployee('');
        setSelectedMigrationTargetEnterprise('');
        setMigrationStats(null);
        
        // Reload list
        loadMigrationEmployees();
      } catch (err: any) {
        console.error("Error durante la migración integral:", err);
        showToast('Error al ejecutar la migración', 'error');
      } finally {
        setMigrating(false);
        setLoading(false);
      }
    }
  };

  const loadDynamicVersions = async () => {
    setLoading(false); // don't block the whole page with global loading spinner
    setLoadingVersions(true);
    try {
      const list = await getDynamicVersions();
      setDynamicVersions(list);
    } catch (e) {
      console.error("Error cargando versiones dinámicas:", e);
    } finally {
      setLoadingVersions(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTrashItems = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'checks'), where('status', '==', 'DELETED'), orderBy('dueDate', 'desc'));
      const snap = await getDocs(q);
      setTrashItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    const path = 'users';
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
      setUsers(data);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (userId: string, status: 'ENABLED' | 'DISABLED') => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', userId), { status });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
      if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, status } : null);
      logAudit(AuditAction.SETTINGS_UPDATE, `Estado de usuario ${userId} cambiado a ${status}`);
    } catch (e) {
      console.error("Error updating user status:", e);
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunRoleMigration = async () => {
    setLoading(true);
    let migratedCount = 0;
    try {
      const batch = writeBatch(db);
      
      for (const u of users) {
        const currentRole = (u as any).role;
        // If they don't have a modern role (enterprise, employee, BODEGUERO, ADMIN), migrate them to enterprise
        if (currentRole !== 'ADMIN' && currentRole !== 'BODEGUERO' && currentRole !== 'enterprise' && currentRole !== 'employee') {
          const userRef = doc(db, 'users', u.id);
          batch.update(userRef, { role: 'enterprise' });
          migratedCount++;
        }
      }
      
      if (migratedCount > 0) {
        await batch.commit();
        await loadUsers();
        logAudit(AuditAction.SETTINGS_UPDATE, `Migración automática completada. Se migraron ${migratedCount} usuarios al rol de 'enterprise'.`);
        showToast(`¡Migración completada! Se actualizaron ${migratedCount} usuarios a 'enterprise'.`, "success");
      } else {
        showAlert('Sin cambios', 'Todos los usuarios ya se encuentran migrados o tienen un rol administrativo/específico.', 'info');
      }
    } catch (e: any) {
      console.error("Error running role migration:", e);
      showToast('Error ejecutando migración: ' + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEntityRelation = async () => {
    if (!editingEntityUser) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', editingEntityUser.id);
      const updateData: any = {
        role: entityFormData.role,
      };
      
      if (entityFormData.role === 'employee' || entityFormData.role === 'BODEGUERO') {
        if (!entityFormData.enterpriseId) {
          throw new Error('Debe seleccionar una empresa para asociar este empleado o bodeguero.');
        }
        updateData.enterpriseId = entityFormData.enterpriseId;
      } else {
        updateData.enterpriseId = null;
      }
      
      await updateDoc(userRef, updateData);
      
      // Sync Custom Claims on backend dynamically for the modified user
      try {
        await fetch('/api/admin/sync-claims', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uid: editingEntityUser.id })
        });
      } catch (claimsSyncError) {
        console.warn("Backend claims sync pending or failed:", claimsSyncError);
      }

      await loadUsers();
      logAudit(AuditAction.SETTINGS_UPDATE, `Relación de entidad actualizada para ${editingEntityUser.email}: Rol=${entityFormData.role}, Empresa=${entityFormData.enterpriseId || 'Ninguna'}`);
      setShowEntityModal(false);
      setEditingEntityUser(null);
      showToast('Relación de entidad actualizada con éxito.', "success");
    } catch (e: any) {
      console.error("Error saving entity relation:", e);
      showToast('Error al guardar relación: ' + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const updateSubscription = async (userId: string, type: 'days' | 'months' | 'years', val: number) => {
    setLoading(true);
    try {
      const now = new Date();
      let newEnd = now;
      if (type === 'days') newEnd = addDays(now, val);
      if (type === 'months') newEnd = addMonths(now, val);
      if (type === 'years') newEnd = addYears(now, val);
      
      const isoStr = newEnd.toISOString();
      await updateDoc(doc(db, 'users', userId), { subscriptionEnd: isoStr });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, subscriptionEnd: isoStr } : u));
      if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, subscriptionEnd: isoStr } : null);
      showToast("Suscripción actualizada correctamente", "success");
      logAudit(AuditAction.SETTINGS_UPDATE, `Suscripción de usuario ${userId} extendida por ${val} ${type}`);
    } catch (e) {
      console.error("Error updating subscription:", e);
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setLoading(false);
    }
  };

  const resetPin = async (userId: string) => {
    if (!newPinValue || newPinValue.length !== 6) {
      showAlert("PIN Inválido", "El PIN debe tener exactamente 6 dígitos.", "warning");
      return;
    }
    setLoading(true);
    try {
      const hashedPin = await hashPin(newPinValue);
      await updateDoc(doc(db, 'users', userId), { pin: hashedPin });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, pin: hashedPin } : u));
      if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, pin: hashedPin } : null);
      showToast("PIN actualizado exitosamente", "success");
      setShowPinModal(false);
      setNewPinValue('');
      logAudit(AuditAction.SETTINGS_UPDATE, `PIN de usuario ${userId} reseteado administrativamente`);
    } catch (e) {
      console.error("Error updating PIN:", e);
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setLoading(false);
    }
  };

  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [migrateTargetUserId, setMigrateTargetUserId] = useState('');
  const [migratePinValue, setMigratePinValue] = useState('');

  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonateTargetUser, setImpersonateTargetUser] = useState<UserData | null>(null);
  const [impersonatePinValue, setImpersonatePinValue] = useState('');

  const handleImpersonate = async () => {
    if (impersonatePinValue.length !== 6) {
      showAlert("PIN Inválido", "El PIN debe tener 6 dígitos.", "warning");
      return;
    }
    setLoading(true);
    try {
      const isValid = await verifyPin(impersonatePinValue);
      if (!isValid) {
        showAlert("PIN Incorrecto", "El PIN de administrador ingresado no es correcto.", "error");
        setLoading(false);
        return;
      }
      
      if (impersonateTargetUser) {
        await impersonateUser({ uid: impersonateTargetUser.id, email: impersonateTargetUser.email, displayName: impersonateTargetUser.name });
      }
      setShowImpersonateModal(false);
      setImpersonatePinValue('');
    } catch (error) {
      console.error("Error al simular usuario:", error);
      showToast("Error al simular sesión", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateData = async () => {
    if (!selectedUser || !migrateTargetUserId) {
      showToast("Por favor, seleccione un usuario destino.", "warning");
      return;
    }
    
    setLoading(true);
    try {
      const isValid = await verifyPin(migratePinValue);
      if (!isValid) {
        showAlert("PIN Incorrecto", "El PIN de administrador ingresado es incorrecto o no está configurado.", "error");
        setLoading(false);
        return;
      }

      const checksPath = 'checks';
      const checksQ = query(collection(db, checksPath), where('userId', '==', selectedUser.id));
      const checksSnaps = await getDocs(checksQ);
      
      const invoicesPath = 'invoices';
      const invoicesQ = query(collection(db, invoicesPath), where('userId', '==', selectedUser.id));
      const invSnaps = await getDocs(invoicesQ);

      const beneficiariesPath = 'beneficiaries';
      const beneficiariesQ = query(collection(db, beneficiariesPath), where('userId', '==', selectedUser.id));
      const benSnaps = await getDocs(beneficiariesQ);
      
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      // Firestore batch max operations is 500, but we assume it might not exceed for now.
      // If needed, we'd chunk it. For smaller apps it's ok.
      checksSnaps.docs.forEach(d => {
        batch.update(doc(db, checksPath, d.id), { userId: migrateTargetUserId });
      });
      
      invSnaps.docs.forEach(d => {
        batch.update(doc(db, invoicesPath, d.id), { userId: migrateTargetUserId });
      });

      benSnaps.docs.forEach(d => {
        batch.update(doc(db, beneficiariesPath, d.id), { userId: migrateTargetUserId });
      });
      
      await batch.commit();
      
      if (viewingUserInstance?.id === selectedUser.id) {
        setUserChecks([]);
      }
      
      logAudit(AuditAction.SETTINGS_UPDATE, `Migrados ${checksSnaps.size} cheques, ${invSnaps.size} facturas y ${benSnaps.size} beneficiarios desde ${selectedUser.id} hacia ${migrateTargetUserId}`);
      
      showAlert("Migración Exitosa", `Se han migrado ${checksSnaps.size} cheques, ${invSnaps.size} facturas y ${benSnaps.size} beneficiarios correctamente.`, "success");
      setShowMigrateModal(false);
      setMigratePinValue('');
      setMigrateTargetUserId('');
    } catch (e) {
      console.error("Error crítico migrando data del usuario:", e);
      showToast("Error al migrar la base de datos", "error");
      handleFirestoreError(e, OperationType.WRITE, `admin/migrate/${selectedUser.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVaciarBaseDatos = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      const isValid = await verifyPin(adminPinValue);
      if (!isValid) {
        showAlert("PIN Incorrecto", "El PIN de administrador ingresado es incorrecto o no está configurado.", "error");
        setLoading(false);
        return;
      }

      console.log(`Iniciando vaciado de datos para: ${selectedUser.name} (${selectedUser.id})`);
      
      // Fetch checks
      const checksPath = 'checks';
      const checksQ = query(collection(db, checksPath), where('userId', '==', selectedUser.id));
      const checksSnaps = await getDocs(checksQ);
      console.log(`Encontrados ${checksSnaps.size} cheques para eliminar.`);
      
      // Fetch invoices
      const invoicesPath = 'invoices';
      const invoicesQ = query(collection(db, invoicesPath), where('userId', '==', selectedUser.id));
      const invSnaps = await getDocs(invoicesQ);
      console.log(`Encontradas ${invSnaps.size} facturas para eliminar.`);
      
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      checksSnaps.docs.forEach(d => {
        batch.delete(doc(db, checksPath, d.id));
      });
      
      invSnaps.docs.forEach(d => {
        batch.delete(doc(db, invoicesPath, d.id));
      });
      
      await batch.commit();
      console.log("Batch commit completado exitosamente.");
      
      if (viewingUserInstance?.id === selectedUser.id) {
        setUserChecks([]);
      }
      
      logAudit(AuditAction.DB_VACUUM, `Vaciada base de datos del usuario ${selectedUser.name} (${selectedUser.id}). Se eliminaron ${checksSnaps.size} cheques y ${invSnaps.size} facturas.`);
      
      showAlert("Vaciado Completado", `Se han eliminado ${checksSnaps.size} cheques y ${invSnaps.size} facturas de ${selectedUser.name} exitosamente.`, "success");
      setShowAdminConfirmModal(false);
      setAdminPinValue('');
    } catch (e) {
      console.error("Error crítico eliminando data del usuario:", e);
      showAlert("Error de Vaciado", "Error al vaciar la base de datos. Consulta la consola para más detalles.", "error");
      handleFirestoreError(e, OperationType.WRITE, `admin/cleanup/${selectedUser.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      const isValid = await verifyPin(deleteUserPinValue);
      if (!isValid) {
        showAlert("PIN Incorrecto", "El PIN de administrador ingresado es incorrecto o no está configurado.", "error");
        setLoading(false);
        return;
      }

      console.log(`Iniciando eliminación total del usuario: ${selectedUser.name} (${selectedUser.id})`);
      
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      const checksQ = query(collection(db, 'checks'), where('userId', '==', selectedUser.id));
      const checksSnaps = await getDocs(checksQ);
      checksSnaps.docs.forEach(d => batch.delete(doc(db, 'checks', d.id)));
      
      const invoicesQ = query(collection(db, 'invoices'), where('userId', '==', selectedUser.id));
      const invSnaps = await getDocs(invoicesQ);
      invSnaps.docs.forEach(d => batch.delete(doc(db, 'invoices', d.id)));

      const benQ = query(collection(db, 'beneficiaries'), where('userId', '==', selectedUser.id));
      const benSnaps = await getDocs(benQ);
      benSnaps.docs.forEach(d => batch.delete(doc(db, 'beneficiaries', d.id)));

      batch.delete(doc(db, 'settings', selectedUser.id));
      batch.delete(doc(db, 'userSettings', selectedUser.id));
      batch.delete(doc(db, 'users', selectedUser.id));
      
      await batch.commit();
      
      setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
      
      logAudit(AuditAction.USER_DELETE, `Eliminado permanentemente usuario ${selectedUser.name} (${selectedUser.id}). Se eliminaron todos sus registros.`);
      
      setSelectedUser(null);
      
      if (viewingUserInstance?.id === selectedUser.id) {
        setViewingUserInstance(null);
        setUserChecks([]);
      }
      
      showAlert("Usuario Eliminado", `El usuario ${selectedUser.name} ha sido eliminado permanentemente del sistema con todos sus registros asociados.`, "success");
      setShowDeleteUserConfirmModal(false);
      setDeleteUserPinValue('');
    } catch (e) {
      console.error("Error crítico eliminando usuario:", e);
      showToast("Error al eliminar el usuario", "error");
      handleFirestoreError(e, OperationType.DELETE, `admin/deleteUser/${selectedUser.id}`);
    } finally {
      setLoading(false);
    }
  };

  const viewUserData = async (u: UserData) => {
    setLoading(true);
    setViewingUserInstance(u);
    setCheckSearchTerm('');
    const path = 'checks';
    try {
      const q = query(
        collection(db, path), 
        where('userId', '==', u.id),
        where('status', 'in', ['PENDING', 'PAID']),
        orderBy('dueDate', 'desc')
      );
      const snaps = await getDocs(q);
      setUserChecks(snaps.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      
      const settingsSnap = await getDoc(doc(db, 'settings', u.id));
      if (settingsSnap.exists()) {
        setViewingUserSettings(settingsSnap.data());
      } else {
        setViewingUserSettings(null);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteCheck = async () => {
    if (!checkToDelete) return;
    setLoading(true);
    try {
      const checkRef = doc(db, 'checks', checkToDelete);
      await updateDoc(checkRef, { status: 'DELETED' });
      
      const deletedCheck = userChecks.find(c => c.id === checkToDelete);
      logAudit(AuditAction.CHECK_DELETE, `Cheque ${deletedCheck?.checkNumber} de ${deletedCheck?.beneficiaryName} enviado a papelera`, checkToDelete);
      
      setUserChecks(prev => prev.filter(c => c.id !== checkToDelete));
      setCheckToDelete(null);
      showToast("Registro enviado a la papelera exitosamente", "success");
    } catch (e) {
      console.error("Error deleting check:", e);
      showToast("Error al enviar el registro a la papelera", "error");
      handleFirestoreError(e, OperationType.DELETE, `checks/${checkToDelete}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditCheck = (check: any) => {
    setEditingCheck(check);
    setCheckFormData({
      beneficiaryName: check.beneficiaryName || '',
      checkNumber: check.checkNumber || '',
      concept: check.concept || '',
      amount: check.amount || 0,
      dueDate: check.dueDate || format(new Date(), 'yyyy-MM-dd'),
      status: check.status || 'PENDING',
      bank: check.bank || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheck) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'checks', editingCheck.id), checkFormData);
      setUserChecks(prev => prev.map(c => c.id === editingCheck.id ? { ...c, ...checkFormData } : c));
      setEditingCheck(null);
      showToast("Registro actualizado correctamente", "success");
    } catch (e) {
      console.error("Error updating check:", e);
      showToast("Error al actualizar el registro", "error");
      handleFirestoreError(e, OperationType.UPDATE, `checks/${editingCheck.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingUserInstance) return;
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'checks'), {
        ...checkFormData,
        userId: viewingUserInstance.id,
        createdAt: serverTimestamp()
      });
      setUserChecks(prev => [{ id: docRef.id, ...checkFormData }, ...prev]);
      setIsAddingCheck(false);
      setCheckFormData({
        beneficiaryName: '',
        checkNumber: '',
        concept: '',
        amount: 0,
        dueDate: format(new Date(), 'yyyy-MM-dd'),
        status: 'PENDING',
        bank: '',
      });
      showToast("Pago registrado exitosamente", "success");
    } catch (e) {
      console.error("Error adding check:", e);
      showToast("Error al registrar el pago", "error");
      handleFirestoreError(e, OperationType.CREATE, 'checks');
    } finally {
      setLoading(false);
    }
  };

  const safeFormatDate = (dateStr: string | undefined, formatStr: string = 'dd/MM/yyyy') => {
    if (!dateStr) return 'N/A';
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return 'Inválido';
      return format(d, formatStr);
    } catch (e) {
      return 'Error';
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUserChecks = userChecks.filter(c => 
    c.beneficiaryName?.toLowerCase().includes(checkSearchTerm.toLowerCase()) || 
    c.checkNumber?.toLowerCase().includes(checkSearchTerm.toLowerCase()) ||
    c.concept?.toLowerCase().includes(checkSearchTerm.toLowerCase())
  );

  if (!isSuperAdminEmail(originalUser?.email)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Ban className="w-16 h-16 text-red-500 animate-pulse" />
        <h1 className="text-2xl font-black text-red-600 uppercase tracking-widest">Acceso Denegado</h1>
        <p className="text-neutral-500 font-medium">No tienes permisos para visualizar este panel.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[2px] z-[999] flex items-center justify-center">
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-neutral-900 dark:text-neutral-50">Procesando solicitud...</p>
          </div>
        </div>
      )}
      
      {viewingUserInstance ? (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setViewingUserInstance(null)} 
              className="p-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-2xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Egresos de {viewingUserInstance.name}</h1>
              <p className="text-sm text-neutral-500 flex items-center gap-2"><Mail className="w-3 h-3" /> {viewingUserInstance.email}</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar cheque, beneficiario..."
                value={checkSearchTerm}
                onChange={(e) => setCheckSearchTerm(e.target.value)}
                className="pl-11 pr-4 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 shadow-sm"
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => { setIsAddingCheck(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex items-center px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-indigo-100 dark:shadow-none transition-all hover:scale-[1.02]"
              >
                <Plus className="w-5 h-5 mr-3" /> Añadir Pago
              </button>
              <button 
                onClick={() => {
                  const ws = XLSX.utils.json_to_sheet(userChecks);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Checks");
                  XLSX.writeFile(wb, `Data_${viewingUserInstance.name}.xlsx`);
                }}
                className="flex items-center px-6 py-3 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-emerald-100 dark:shadow-none transition-all hover:scale-[1.02]"
              >
                <Download className="w-5 h-5 mr-3" /> Exportar
              </button>
            </div>
          </div>
        </header>

        {(isAddingCheck || editingCheck) && (
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] border-2 border-indigo-500 dark:border-indigo-400 shadow-xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{editingCheck ? 'Editar Pago' : 'Nuevo Pago Administrativo'}</h2>
              <button 
                onClick={() => { setEditingCheck(null); setIsAddingCheck(false); }}
                className="p-2 text-neutral-400 hover:text-neutral-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={editingCheck ? handleUpdateCheck : handleAddCheck} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Beneficiario</label>
                <input 
                  type="text" 
                  value={checkFormData.beneficiaryName} 
                  onChange={e => setCheckFormData({...checkFormData, beneficiaryName: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50" 
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Identificador / Cheque</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={checkFormData.checkNumber} 
                    onChange={e => setCheckFormData({...checkFormData, checkNumber: e.target.value})}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50" 
                    required
                  />
                  {viewingUserSettings?.banks && viewingUserSettings.banks.length > 0 && (
                    <select
                      value={checkFormData.bank}
                      onChange={e => setCheckFormData({...checkFormData, bank: e.target.value})}
                      className="bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50 w-1/3"
                    >
                      <option value="">(Banco)</option>
                      {viewingUserSettings.banks.map((b: string, i: number) => (
                        <option key={i} value={b}>{b}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Concepto</label>
                <input 
                  type="text" 
                  value={checkFormData.concept} 
                  onChange={e => setCheckFormData({...checkFormData, concept: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Valor</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={checkFormData.amount} 
                  onChange={e => setCheckFormData({...checkFormData, amount: parseFloat(e.target.value) || 0})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50" 
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Fecha Vencimiento</label>
                <input 
                  type="date" 
                  value={checkFormData.dueDate} 
                  onChange={e => setCheckFormData({...checkFormData, dueDate: e.target.value})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50" 
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Estado</label>
                <select 
                  value={checkFormData.status} 
                  onChange={e => setCheckFormData({...checkFormData, status: e.target.value as any})}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50"
                >
                  <option value="PENDING">PENDIENTE</option>
                  <option value="PAID">PAGADO</option>
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-3 pt-4 border-t border-neutral-50 dark:border-neutral-800">
                 <button 
                  type="button"
                  onClick={() => { setEditingCheck(null); setIsAddingCheck(false); }}
                  className="px-6 py-3 text-sm font-bold text-neutral-500 hover:text-neutral-700 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-10 py-3 bg-neutral-900 dark:bg-indigo-600 text-white rounded-2xl text-sm font-black transition-all hover:bg-black dark:hover:bg-indigo-500"
                >
                  {editingCheck ? 'Guardar Cambios' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-neutral-50 dark:divide-neutral-800">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50">
              <tr>
                <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fecha Pago</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Beneficiario</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Identificador</th>
                <th className="px-8 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor</th>
                <th className="px-8 py-4 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
              {filteredUserChecks.map(c => (
                <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                  <td className="px-8 py-4 text-sm font-bold text-neutral-700 dark:text-neutral-300">{safeFormatDate(c.dueDate)}</td>
                  <td className="px-8 py-4 text-sm font-black text-neutral-900 dark:text-neutral-50 uppercase tracking-tight">{c.beneficiaryName}</td>
                  <td className="px-8 py-4 text-sm font-mono text-neutral-400">{c.checkNumber}</td>
                  <td className="px-8 py-4 text-sm font-black text-neutral-900 dark:text-neutral-50 text-right">{formatCurrency(c.amount, settings.currency)}</td>
                  <td className="px-8 py-4 text-center">
                    <span className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm",
                      c.status === 'PAID' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    )}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => startEditCheck(c)}
                        className="p-2 text-neutral-400 hover:text-indigo-600 transition-all"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setCheckToDelete(c.id)}
                        className="p-2 text-neutral-400 hover:text-red-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="max-w-7xl mx-auto space-y-10 pb-20">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-indigo-600 text-white rounded-3xl shadow-xl shadow-indigo-100 dark:shadow-none">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-neutral-900 dark:text-neutral-50 tracking-tighter uppercase italic">Control 360°</h1>
            <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] mb-1">by Trennd</p>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm font-medium">Panel de Control de Membresías y Seguridad.</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Filtrar por nombre o identificación..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-14 pr-6 py-4 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm w-full md:w-96 shadow-sm transition-all"
          />
        </div>
      </header>


      {activeTab === 'USERS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 bg-neutral-50/50 dark:bg-neutral-800/40 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
            <h2 className="font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-3">
              <Users className="w-5 h-5 text-indigo-500" /> Base de Usuarios ({users.length})
            </h2>
            <button onClick={loadUsers} className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline">Sincronizar</button>
          </div>
          <div className="overflow-y-auto max-h-[700px] scrollbar-hide">
            <table className="min-w-full divide-y divide-neutral-50 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-900 sticky top-0 z-10">
                <tr>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Perfil</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Garantía / Estado</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Suscripción</th>
                  
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {filteredUsers.map(u => (
                  <tr 
                    key={u.id} 
                    className={cn(
                      "transition-all cursor-pointer",
                      selectedUser?.id === u.id ? "bg-indigo-50/50 dark:bg-indigo-900/10" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
                    )} 
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-black text-neutral-500 dark:text-neutral-400 uppercase">
                          {u.name.substring(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-900 dark:text-neutral-50 uppercase tracking-tight">{u.name}</div>
                          <div className="text-[10px] text-neutral-400 font-medium">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest",
                        u.status === 'ENABLED' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm"
                      )}>
                        {u.status === 'ENABLED' ? 'Activo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
                        <Clock className="w-3 h-3 text-neutral-400" />
                        {safeFormatDate(u.subscriptionEnd)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4">
          {selectedUser ? (
            <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-xl shadow-indigo-100/10 dark:shadow-none overflow-hidden sticky top-10 animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-600 dark:bg-indigo-900/40 text-white">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{selectedUser.name}</h2>
                <p className="text-sm text-indigo-100 dark:text-indigo-400 font-medium mt-1">{selectedUser.email}</p>
              </div>
              <div className="p-8 space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] block">Comandos de Energía</label>
                  <div className="grid grid-cols-1 gap-3">
                    {isSuperAdminEmail(originalUser?.email) && (
                      <button 
                        onClick={() => {
                          setImpersonateTargetUser(selectedUser);
                          setShowImpersonateModal(true);
                        }}
                        className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:brightness-110 shadow-lg shadow-indigo-100 dark:shadow-none transition-all"
                      >
                        <span>Simular Sesión</span>
                        <Shield className="w-5 h-5" />
                      </button>
                    )}
                    <button 
                      onClick={() => updateUserStatus(selectedUser.id, selectedUser.status === 'ENABLED' ? 'DISABLED' : 'ENABLED')}
                      className={cn(
                        "w-full flex items-center justify-between px-6 py-4 rounded-[1.5rem] transition-all font-black text-xs uppercase tracking-widest",
                        selectedUser.status === 'ENABLED' 
                          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-neutral-900 hover:text-white" 
                          : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-neutral-900 hover:text-white border border-emerald-200 dark:border-emerald-800"
                      )}
                    >
                      <span>{selectedUser.status === 'ENABLED' ? 'Suspender Acceso' : 'Restaurar Acceso'}</span>
                      {selectedUser.status === 'ENABLED' ? <Ban className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                    </button>
                    <button 
                      onClick={() => {
                        setNewPinValue('');
                        setShowPinModal(true);
                      }}
                      className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50 dark:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300 rounded-[1.5rem] font-bold text-xs uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all group"
                    >
                      <span>Gestionar PIN</span>
                      <Lock className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                    </button>
                    {isSuperAdminEmail(user?.email) && (
                      <>
                        <button 
                          onClick={() => {
                            setMigratePinValue('');
                            setMigrateTargetUserId('');
                            setShowMigrateModal(true);
                          }}
                          className="w-full flex items-center justify-between px-6 py-4 bg-orange-50 dark:bg-orange-900/10 text-orange-600 dark:text-orange-400 rounded-[1.5rem] font-bold text-xs uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all group"
                        >
                          <span>Migrar Base de Datos</span>
                          <Users className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                        </button>
                        <button 
                          onClick={() => {
                            setAdminPinValue('');
                            setShowAdminConfirmModal(true);
                          }}
                          className="w-full flex items-center justify-between px-6 py-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-[1.5rem] font-bold text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all group"
                        >
                          <span>Vaciar Base de Datos</span>
                          <Trash2 className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                        </button>
                        <button 
                          onClick={() => {
                            setDeleteUserPinValue('');
                            setShowDeleteUserConfirmModal(true);
                          }}
                          className="w-full flex items-center justify-between px-6 py-4 bg-neutral-900 dark:bg-neutral-800 text-white dark:text-neutral-200 rounded-[1.5rem] font-bold text-xs uppercase tracking-widest hover:bg-black dark:hover:bg-neutral-700 transition-all group"
                        >
                          <span>Eliminar Usuario</span>
                          <Ban className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] block">Extensión de Garantía</label>
                  <div className="flex flex-col gap-2">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800 flex items-center gap-3 mb-2">
                      <Calendar className="w-5 h-5 text-indigo-500" />
                      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-50">{safeFormatDate(selectedUser.subscriptionEnd)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => updateSubscription(selectedUser.id, 'months', 1)} className="px-3 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-all">+1 mes</button>
                      <button onClick={() => updateSubscription(selectedUser.id, 'months', 6)} className="px-3 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-all">+6 mes</button>
                      <button onClick={() => updateSubscription(selectedUser.id, 'years', 1)} className="px-3 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-all">+1 año</button>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-neutral-50 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                    <Shield className="w-3 h-3" /> UID: {selectedUser.id.substring(0, 16)}...
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-[2.5rem] border-2 border-dashed border-neutral-200 dark:border-neutral-800 h-96 flex flex-col items-center justify-center text-center p-12">
               <div className="w-20 h-20 bg-white dark:bg-neutral-800 rounded-[2rem] shadow-sm flex items-center justify-center mb-6">
                 <User className="w-8 h-8 text-neutral-200 dark:text-neutral-700" />
               </div>
               <p className="text-neutral-400 font-bold uppercase tracking-widest text-[10px] px-8">Selecciona un usuario de la base central para gestionar sus credenciales y accesos.</p>
            </div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'HISTORY' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden p-8 lg:p-12">
            <div className="max-w-4xl mx-auto space-y-12">
              <div>
                <h2 className="text-2xl font-black text-neutral-900 dark:text-neutral-50 flex items-center gap-3">
                  <Clock className="w-6 h-6 text-indigo-500" /> Historial de Actualizaciones y Versiones
                </h2>
                <p className="text-neutral-500 mt-2">Detalles técnicos y de plataforma para la administración.</p>
              </div>
              
              {loadingVersions ? (
                <div className="py-20 text-center text-neutral-400 font-bold uppercase tracking-widest text-[10px] animate-pulse">
                  Cargando historial de versiones...
                </div>
              ) : (
                <div className="space-y-12 relative before:absolute before:inset-y-0 before:left-[11px] before:w-0.5 before:bg-neutral-100 dark:before:bg-neutral-800">
                  {dynamicVersions.map((release, index) => (
                    <div key={release.version} className="relative pl-10">
                      <span className="absolute left-0 top-1 w-6 h-6 rounded-full border-[6px] border-white dark:border-neutral-900 bg-indigo-500 shadow-sm" />
                      <div className="mb-2 flex flex-col sm:flex-row sm:items-baseline gap-2">
                        <h3 className="text-lg font-black tracking-tight text-neutral-900 dark:text-neutral-50">
                          Versión {release.version}
                        </h3>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{release.date}</span>
                        {index === 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest ml-0 sm:ml-2">
                            Actual
                          </span>
                        )}
                      </div>
                      <ul className="space-y-3 mt-4">
                        {release.changes.map((change, idx) => (
                          <li key={idx} className="flex gap-3 text-sm text-neutral-700 dark:text-neutral-300 font-medium">
                            <ArrowRight className="w-4 h-4 shrink-0 text-neutral-300 dark:text-neutral-600 mt-0.5" />
                            <span className="leading-relaxed">{change}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'AUDIT' && (
        <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden animate-in fade-in duration-500">
          <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
            <h2 className="font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-500" /> Registros de Actividad Global
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-50 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50">
                <tr>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fecha/Hora</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Acción</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Usuario</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="px-8 py-4 text-xs font-mono text-neutral-400">
                      {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'dd/MM/yy HH:mm:ss') : 'Reciente...'}
                    </td>
                    <td className="px-8 py-4">
                      <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded text-[9px] font-black uppercase tracking-widest">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      {log.userEmail}
                    </td>
                    <td className="px-8 py-4 text-xs text-neutral-500 dark:text-neutral-400 max-w-xs truncate">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'TRASH' && (
        <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden animate-in fade-in duration-500">
          <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-red-50/30 dark:bg-red-900/10">
            <h2 className="font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-red-500" /> Papelera de Reciclaje (Registros Eliminados)
            </h2>
            <p className="text-[10px] text-neutral-400 uppercase mt-1">Registros marcados como eliminados por los usuarios.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-50 dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50">
                <tr>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fecha Venc.</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Beneficiario</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {trashItems.map(item => (
                  <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="px-8 py-4 text-sm font-bold text-neutral-500">{safeFormatDate(item.dueDate)}</td>
                    <td className="px-8 py-4">
                      <div className="text-sm font-black text-neutral-900 dark:text-neutral-50 uppercase">{item.beneficiaryName}</div>
                      <div className="text-[10px] text-neutral-400">ID: {item.userId.substring(0, 8)}...</div>
                    </td>
                    <td className="px-8 py-4 text-sm font-black text-neutral-900 dark:text-neutral-50">
                      {formatCurrency(item.amount, settings.currency)}
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button 
                        onClick={async () => {
                          await updateDoc(doc(db, 'checks', item.id), { status: 'PENDING' });
                          setTrashItems(prev => prev.filter(i => i.id !== item.id));
                          logAudit(AuditAction.CHECK_RESTORE, `Restaurado cheque ${item.checkNumber} de ${item.beneficiaryName}`, item.id);
                        }}
                        className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2 ml-auto"
                      >
                        <RotateCcw className="w-4 h-4" /> <span className="text-[10px] font-black uppercase">Restaurar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trashItems.length === 0 && (
              <div className="p-20 text-center text-neutral-400 font-bold uppercase tracking-widest text-[10px]">La papelera está vacía.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'ENTITIES' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Header Action cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 p-8 shadow-sm flex flex-col justify-between">
              <div>
                <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full">Herramienta de Control</span>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mt-3">Migración Automática de Roles</h3>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-2 leading-relaxed">
                  Actualiza automáticamente a todos los usuarios registrados que no cuenten con un rol específico (o posean el rol legacy de 'USER') para que sean reconocidos oficialmente como una **Empresa Principal (enterprise)**.
                </p>
              </div>
              <div className="mt-6">
                <button
                  onClick={async () => {
                    if (await showConfirm('Migración de Roles', '¿Está seguro de migrar masivamente todos los usuarios genéricos a empresas principales? Se conservarán los roles de ADMINISTRADOR, BODEGUERO o empleados ya asignados.', { type: 'warning' })) {
                      handleRunRoleMigration();
                    }
                  }}
                  className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" /> Ejecutar Migración de Roles
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 p-8 shadow-sm flex flex-col justify-between">
              <div>
                <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full">Gastos y Egresos</span>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mt-3">Vincular Cheques a Almacenes Derick</h3>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-2 leading-relaxed">
                  Todos los cheques, facturas y beneficiarios históricos que se encuentran actualmente sin empresa asociada se vincularán automáticamente a la empresa **Almacenes Derick**.
                </p>
                {unassignedChecksCount !== null && (
                  <div className="mt-3 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 rounded-xl w-fit">
                    Cheques pendientes de vincular: {unassignedChecksCount}
                  </div>
                )}
              </div>
              <div className="mt-6">
                <button
                  onClick={handleMigrateChecksToDerick}
                  disabled={migratingChecks}
                  className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" /> {migratingChecks ? "Migrando..." : "Migrar Egresos a Derick"}
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 p-8 shadow-sm">
              <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full">Estadísticas del Sistema</span>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mt-3">Distribución de Cuentas</h3>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Empresas</div>
                  <div className="text-2xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
                    {users.filter(u => (u as any).role === 'enterprise').length}
                  </div>
                </div>
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Empleados</div>
                  <div className="text-2xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
                    {users.filter(u => (u as any).role === 'employee').length}
                  </div>
                </div>
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Bodegueros</div>
                  <div className="text-2xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
                    {users.filter(u => (u as any).role === 'BODEGUERO').length}
                  </div>
                </div>
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Sin Rol / Otros</div>
                  <div className="text-2xl font-black text-neutral-900 dark:text-neutral-50 mt-1">
                    {users.filter(u => !(u as any).role || (u as any).role === 'USER').length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Herramienta de Migración Integral de Datos */}
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 p-8 lg:p-10 shadow-sm space-y-6">
            <div>
              <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full">Super Admin Console</span>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mt-3">Migración Integral de Personal, Presupuestos y Ventas</h3>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1 leading-relaxed">
                Herramienta crítica para transferir un empleado junto con todos sus registros históricos de ventas, cobranzas y presupuestos asignados hacia otra empresa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] block pl-1">Seleccionar Empleado</label>
                <select
                  value={selectedMigrationEmployee}
                  onChange={(e) => setSelectedMigrationEmployee(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50 font-bold"
                >
                  <option value="">-- Seleccionar Empleado --</option>
                  {migrationEmployees.map((emp) => {
                    const currentEnt = users.find(u => u.id === emp.enterpriseId);
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.lastName} ({currentEnt ? currentEnt.name : 'Sin Empresa'})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] block pl-1">Empresa de Destino</label>
                <select
                  value={selectedMigrationTargetEnterprise}
                  onChange={(e) => setSelectedMigrationTargetEnterprise(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50 font-bold"
                >
                  <option value="">-- Seleccionar Empresa de Destino --</option>
                  {users
                    .filter(u => u.role === 'enterprise')
                    .map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name} ({ent.email})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <button
                  onClick={handleExecuteMigration}
                  disabled={migrating || !selectedMigrationEmployee || !selectedMigrationTargetEnterprise}
                  className={cn(
                    "w-full px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2",
                    (!selectedMigrationEmployee || !selectedMigrationTargetEnterprise)
                      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed shadow-none"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  )}
                >
                  <AlertTriangle className="w-4 h-4" /> {migrating ? "Migrando Datos..." : "Ejecutar Migración"}
                </button>
              </div>
            </div>

            {selectedMigrationEmployee && (
              <div className="p-6 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-[1.5rem] border border-indigo-100/50 dark:border-indigo-900/40 space-y-3 animate-in fade-in duration-300 font-sans">
                <div className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">
                  Registros listos para transferir:
                </div>
                {migrationStats ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800/60 shadow-sm">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Presupuestos</span>
                      <span className="text-lg font-black text-neutral-900 dark:text-neutral-50 mt-1 block">{migrationStats.budgets}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800/60 shadow-sm">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Ventas</span>
                      <span className="text-lg font-black text-neutral-900 dark:text-neutral-50 mt-1 block">{migrationStats.sales}</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800/60 shadow-sm">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Cobranzas</span>
                      <span className="text-lg font-black text-neutral-900 dark:text-neutral-50 mt-1 block">{migrationStats.collections}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider animate-pulse py-2">
                    Calculando registros...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Main List Table */}
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h2 className="font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-3 text-lg">
                  <Users className="w-5 h-5 text-indigo-500" /> Relación y Asignación de Entidades
                </h2>
                <p className="text-xs text-neutral-400 mt-1">Asocie cuentas de empleados y bodegueros a sus respectivas empresas matrices.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Buscar cuenta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11 pr-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl text-xs w-64 outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-800 dark:text-neutral-100 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-50 dark:divide-neutral-800">
                <thead className="bg-neutral-50/50 dark:bg-neutral-800/20">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Identidad de Cuenta</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Rol Asignado</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-neutral-400 uppercase tracking-widest">Asociación Empresarial</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Configurar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                  {users
                    .filter(u => 
                      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                      u.email?.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(u => {
                      const parentEnterprise = (u as any).enterpriseId 
                        ? users.find(parent => parent.id === (u as any).enterpriseId)
                        : null;
                      
                      return (
                        <tr key={u.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/20 transition-colors">
                          <td className="px-8 py-4">
                            <div className="text-sm font-black text-neutral-900 dark:text-neutral-50 uppercase">{u.name || 'Sin nombre'}</div>
                            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">{u.email}</div>
                          </td>
                          <td className="px-8 py-4">
                            {(() => {
                              const r = (u as any).role;
                              if (r === 'ADMIN') return <span className="px-3 py-1 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[10px] font-black rounded-full uppercase">Super Admin</span>;
                              if (r === 'enterprise') return <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-full uppercase">Empresa Matriz</span>;
                              if (r === 'employee') return <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-full uppercase">Empleado</span>;
                              if (r === 'BODEGUERO') return <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[10px] font-black rounded-full uppercase">Bodeguero</span>;
                              return <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-[10px] font-black rounded-full uppercase">Legacy (USER)</span>;
                            })()}
                          </td>
                          <td className="px-8 py-4">
                            {(() => {
                              const r = (u as any).role;
                              if (r === 'ADMIN' || r === 'enterprise') {
                                return <span className="text-xs text-neutral-400 italic">Ninguna (Es Ente Autónomo)</span>;
                              }
                              if (r === 'employee' || r === 'BODEGUERO') {
                                if (parentEnterprise) {
                                  return (
                                    <div>
                                      <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{parentEnterprise.name}</div>
                                      <div className="text-[9px] text-neutral-400 font-mono">{parentEnterprise.email}</div>
                                    </div>
                                  );
                                }
                                return <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] font-black rounded uppercase">⚠️ Sin Empresa Asignada!</span>;
                              }
                              return <span className="text-xs text-neutral-400">No aplica</span>;
                            })()}
                          </td>
                          <td className="px-8 py-4 text-right">
                            <button
                              onClick={() => {
                                setEditingEntityUser(u);
                                setEntityFormData({
                                  role: (u as any).role || 'enterprise',
                                  enterpriseId: (u as any).enterpriseId || ''
                                });
                                setShowEntityModal(true);
                              }}
                              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-black uppercase rounded-xl transition-all"
                            >
                              Relacionar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal assignment dialog */}
          {showEntityModal && editingEntityUser && (
            <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-600 text-white flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold uppercase tracking-tight">Asociación de Entidad</h2>
                    <p className="text-xs opacity-80 mt-1">Configurar rol y pertenencia para la cuenta seleccionada</p>
                  </div>
                  <button onClick={() => { setShowEntityModal(false); setEditingEntityUser(null); }} className="text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                    <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cuenta Activa</div>
                    <div className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mt-1 uppercase">{editingEntityUser.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{editingEntityUser.email}</div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Rol Operativo</label>
                    <select
                      value={entityFormData.role}
                      onChange={(e) => setEntityFormData({ ...entityFormData, role: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl p-4 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-800 dark:text-neutral-100 shadow-inner"
                    >
                      <option value="enterprise">Empresa Principal / Matriz (enterprise)</option>
                      <option value="employee">Empleado Corporativo (employee)</option>
                      <option value="BODEGUERO">Bodeguero de Inventario (BODEGUERO)</option>
                      <option value="SUPERADMIN">Super Administrador Principal (SUPERADMIN)</option>
                      <option value="ADMIN">Super Administrador (ADMIN)</option>
                      <option value="USER">Legacy (USER)</option>
                    </select>
                  </div>

                  {(entityFormData.role === 'employee' || entityFormData.role === 'BODEGUERO') && (
                    <div className="space-y-2 animate-in slide-in-from-top-4 duration-200">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Empresa Principal Asociada</label>
                      <select
                        value={entityFormData.enterpriseId}
                        onChange={(e) => setEntityFormData({ ...entityFormData, enterpriseId: e.target.value })}
                        className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl p-4 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-neutral-800 dark:text-neutral-100 shadow-inner"
                      >
                        <option value="">-- Seleccionar Empresa Matriz --</option>
                        {users
                          .filter(u => (u as any).role === 'enterprise')
                          .map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                      </select>
                      <p className="text-[10px] text-neutral-400">Esta cuenta heredará automáticamente todas las finanzas, cheques, inventarios, y bodegas de la empresa seleccionada.</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <button
                      onClick={() => { setShowEntityModal(false); setEditingEntityUser(null); }}
                      className="flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-2xl"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveEntityRelation}
                      className="flex-1 py-4 bg-indigo-600 text-white text-sm font-black rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Guardar Relación
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )}
      {/* Manage PIN Modal */}
      {showPinModal && selectedUser && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-600 text-white">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold uppercase tracking-tight">Cambiar PIN</h2>
                <button onClick={() => setShowPinModal(false)}><X className="w-6 h-6" /></button>
              </div>
              <p className="text-sm opacity-80 mt-1">Usuario: {selectedUser.name}</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Nuevo PIN de 6 dígitos</label>
                <input 
                  type="text" 
                  maxLength={6}
                  value={newPinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNewPinValue(val);
                  }}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-2xl font-mono text-center tracking-[0.5em] focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-neutral-50 shadow-inner"
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-2xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => resetPin(selectedUser.id)}
                  className="flex-1 py-4 bg-neutral-900 dark:bg-indigo-600 text-white text-sm font-black rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Guardar PIN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Confirm Empty Data Modal */}
      {showAdminConfirmModal && selectedUser && (
        <div className="fixed inset-0 bg-neutral-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border-2 border-red-500 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-red-500 bg-red-600 text-white">
              <div className="flex items-center gap-3">
                <Trash2 className="w-8 h-8" />
                <h2 className="text-xl font-black uppercase tracking-tight">Zona Crítica</h2>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl">
                <p className="text-sm font-bold text-red-600 dark:text-red-400">¿Estás seguro de eliminar TODOS los registros de {selectedUser.name}?</p>
                <p className="text-[10px] text-red-500/80 uppercase mt-1">Esta acción es irreversible y eliminará cheques y facturas.</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Confirma con TU PIN de Administrador</label>
                <input 
                  type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*" 
                  maxLength={6}
                  value={adminPinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setAdminPinValue(val);
                  }}
                  className="w-full bg-neutral-950 border-none rounded-2xl p-4 text-2xl font-mono text-center tracking-[0.5em] focus:ring-2 focus:ring-red-500 outline-none transition-all text-white shadow-inner"
                  placeholder="******"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowAdminConfirmModal(false)}
                  className="flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-2xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleVaciarBaseDatos}
                  className="flex-1 py-4 bg-red-600 text-white text-sm font-black rounded-2xl shadow-lg hover:bg-red-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  VACIAR DATA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Migrate Data Modal */}
      {showMigrateModal && selectedUser && (
        <div className="fixed inset-0 bg-neutral-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border-2 border-orange-500 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-orange-500 bg-orange-600 text-white">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8" />
                <h2 className="text-xl font-black uppercase tracking-tight">Migrar Datos</h2>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-2xl">
                <p className="text-sm font-bold text-orange-600 dark:text-orange-400">Vas a transferir los registros de {selectedUser.name}</p>
                <p className="text-[10px] text-orange-500/80 uppercase mt-1">Los cheques, facturas y beneficiarios pasarán a ser propiedad del usuario destino seleccionado.</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Usuario Destino</label>
                <select 
                  value={migrateTargetUserId}
                  onChange={e => setMigrateTargetUserId(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all dark:text-neutral-50"
                >
                  <option value="">Seleccione un usuario...</option>
                  {users.filter(u => u.id !== selectedUser.id).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Confirma con TU PIN</label>
                <input 
                  type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*" 
                  maxLength={6}
                  value={migratePinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setMigratePinValue(val);
                  }}
                  className="w-full bg-neutral-950 border-none rounded-2xl p-4 text-2xl font-mono text-center tracking-[0.5em] focus:ring-2 focus:ring-orange-500 outline-none transition-all text-white shadow-inner"
                  placeholder="******"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowMigrateModal(false)}
                  className="flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-2xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleMigrateData}
                  className="flex-1 py-4 bg-orange-600 text-white text-sm font-black rounded-2xl shadow-lg hover:bg-orange-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  TRANSFERIR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {checkToDelete && (
        <div className="fixed inset-0 z-[1000] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">¿Eliminar Cheque?</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 font-medium">
              Esta acción es irreversible. ¿Estás seguro de que deseas eliminar este registro?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setCheckToDelete(null)}
                className="flex-1 py-3 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-xl"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteCheck}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-black rounded-xl shadow-lg shadow-red-500/20 hover:bg-red-700 hover:-translate-y-0.5 transition-all"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impersonate User Modal */}
      {showImpersonateModal && impersonateTargetUser && (
        <div className="fixed inset-0 bg-neutral-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border-2 border-indigo-500 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-indigo-500 bg-indigo-600 text-white">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8" />
                <h2 className="text-xl font-black uppercase tracking-tight">Simular Usuario</h2>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-2xl">
                <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Vas a acceder como {impersonateTargetUser.name}</p>
                <p className="text-[10px] text-indigo-500/80 uppercase mt-1">Podrás ver y operar la aplicación exactamente como este usuario lo haría.</p>
              </div>
                
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Confirma con TU PIN de Administrador</label>
                <input 
                  type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*" 
                  maxLength={6}
                  value={impersonatePinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setImpersonatePinValue(val);
                  }}
                  className="w-full bg-neutral-950 border-none rounded-2xl p-4 text-2xl font-mono text-center tracking-[0.5em] focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-white shadow-inner"
                  placeholder="******"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowImpersonateModal(false);
                    setImpersonatePinValue('');
                  }}
                  className="flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-2xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleImpersonate}
                  className="flex-1 py-4 bg-indigo-600 text-white text-sm font-black rounded-2xl shadow-lg hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  SIMULAR SESIÓN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteUserConfirmModal && selectedUser && (
        <div className="fixed inset-0 z-[1000] bg-neutral-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 to-red-800" />
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Ban className="w-10 h-10 text-red-600 dark:text-red-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-50 mb-2 uppercase">ELIMINAR USUARIO</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed font-medium">
                  Estás a punto de <strong className="text-red-600 dark:text-red-400">eliminar permanentemente</strong> la cuenta de {selectedUser.name} y todos sus datos (cheques, facturas, clientes). Esta acción no se puede deshacer.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Confirma con TU PIN</label>
                <input 
                  type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*" 
                  maxLength={6}
                  value={deleteUserPinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setDeleteUserPinValue(val);
                  }}
                  className="w-full bg-neutral-950 border-none rounded-2xl p-4 text-2xl font-mono text-center tracking-[0.5em] focus:ring-2 focus:ring-red-500 outline-none transition-all text-white shadow-inner"
                  placeholder="******"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteUserConfirmModal(false)}
                  className="flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all rounded-2xl"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteUser}
                  className="flex-1 py-4 bg-red-600 text-white text-sm font-black rounded-2xl shadow-lg hover:bg-red-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  ELIMINAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
