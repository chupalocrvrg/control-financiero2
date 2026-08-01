import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Save, Plus, Trash2, Shield, Globe, Palette, Monitor, Calculator, Sun, Moon, PaintBucket, Building, User, Database, Download, Upload, AlignLeft, AlignRight, ArrowUp, ArrowDown, Type } from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { logAudit, AuditAction } from '../lib/audit';
import * as OTPAuth from 'otpauth';
import { QRCodeSVG } from 'qrcode.react';

export default function Settings() {
  const { user, profile, updateProfile, verifyPin, impersonatedUser } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'APPEARANCE' | 'SECURITY' | 'FINANCIAL' | 'BACKUP'>('GENERAL');

  const [profileData, setProfileData] = useState({ name: '', phone: '', photoUrl: '' });
  const [securityData, setSecurityData] = useState({ oldPin: '', newPin: '', confirmPin: '', pinInactivityLimit: 60 });
  const [backupPin, setBackupPin] = useState('');
  const [totpSetup, setTotpSetup] = useState<{ secret: OTPAuth.Secret, uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [positionConfirmTimer, setPositionConfirmTimer] = useState<number | null>(null);
  const [previousMenuPosition, setPreviousMenuPosition] = useState(settings.menuPosition);
  const [timeLeft, setTimeLeft] = useState(0);

  const handlePositionChange = (newPos: 'left' | 'right' | 'top' | 'bottom') => {
    if (newPos === (settings.menuPosition || 'left')) return;
    setPreviousMenuPosition(settings.menuPosition || 'left');
    updateSettings({ menuPosition: newPos });
    
    setTimeLeft(15);
    if (positionConfirmTimer) clearInterval(positionConfirmTimer);
    
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setPositionConfirmTimer(interval as any);
  };

  useEffect(() => {
    if (timeLeft === 0 && positionConfirmTimer) {
       clearInterval(positionConfirmTimer);
       setPositionConfirmTimer(null);
       updateSettings({ menuPosition: previousMenuPosition });
       showToast("Se restableció la ubicación anterior", "info");
    }
  }, [timeLeft, positionConfirmTimer, previousMenuPosition, updateSettings, showToast]);

  const confirmPositionChange = () => {
    if (positionConfirmTimer) {
      clearInterval(positionConfirmTimer);
      setPositionConfirmTimer(null);
      setTimeLeft(0);
      showToast("Ubicación guardada", "success");
    }
  };

  const cancelPositionChange = () => {
    if (positionConfirmTimer) {
      clearInterval(positionConfirmTimer);
      setPositionConfirmTimer(null);
      setTimeLeft(0);
      updateSettings({ menuPosition: previousMenuPosition });
      showToast("Se restableció la ubicación anterior", "info");
    }
  };

  useEffect(() => {
    return () => {
      if (positionConfirmTimer) clearInterval(positionConfirmTimer);
    };
  }, [positionConfirmTimer]);


  useEffect(() => {
    if (user && profile) {
      setProfileData({ name: profile.name || '', phone: profile.phone || '', photoUrl: profile.photoUrl || '' });
      setSecurityData({ oldPin: '', newPin: '', confirmPin: '', pinInactivityLimit: profile.pinInactivityLimit || 60 });
    }
  }, [user, profile]);


  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 256;
        const MAX_HEIGHT = 256;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setProfileData({ ...profileData, photoUrl: dataUrl });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!profileData.name.trim()) {
      showToast("El nombre es requerido", "warning");
      return;
    }
    setLoading(true);
    try {
      await updateProfile(profileData);
      showToast("Perfil actualizado correctamente", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  
  const handleSetupTotp = () => {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'Control Financiero',
      label: profile?.email || 'Usuario',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret
    });
    setTotpSetup({ secret, uri: totp.toString() });
    setShowTotpModal(true);
  };

  const handleVerifyAndSaveTotp = async () => {
    if (!totpSetup || !totpCode) return;
    
    const totp = new OTPAuth.TOTP({
      issuer: 'Control Financiero',
      label: profile?.email || 'Usuario',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: totpSetup.secret
    });

    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) {
      showToast('Código incorrecto', 'error');
      return;
    }

    try {
      setLoading(true);
      await updateProfile({ 
        totpSecret: totpSetup.secret.base32,
        totpEnabled: true
      });
      showToast('Autenticador configurado exitosamente', 'success');
      setShowTotpModal(false);
      setTotpSetup(null);
      setTotpCode('');
    } catch (error) {
      showToast('Error al guardar configuración', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTotp = async () => {
    if (!window.confirm('¿Está seguro de que desea eliminar el autenticador de dos pasos? Esto disminuirá la seguridad de su cuenta.')) return;
    try {
      setLoading(true);
      await updateProfile({
        totpSecret: '',
        totpEnabled: false
      });
      showToast('Autenticador removido', 'success');
    } catch (error) {
      showToast('Error al remover el autenticador', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSecurity = async () => {
    if (securityData.newPin || securityData.confirmPin || securityData.oldPin) {
      if (!securityData.oldPin || securityData.oldPin.length !== 6) {
        showToast("Debes ingresar tu PIN actual de 6 dígitos.", "warning");
        return;
      }
      if (securityData.newPin.length !== 6) {
        showToast("El nuevo PIN debe tener 6 dígitos numéricos.", "warning");
        return;
      }
      if (securityData.newPin !== securityData.confirmPin) {
        showToast("El nuevo PIN y su confirmación no coinciden.", "warning");
        return;
      }
      
      setLoading(true);
      try {
        const isOldPinValid = await verifyPin(securityData.oldPin);
        if (!isOldPinValid) {
          showToast("El PIN actual ingresado es incorrecto.", "error");
          setLoading(false);
          return;
        }
      } catch (error) {
        showToast("Error al verificar el PIN actual.", "error");
        setLoading(false);
        return;
      }
    }
    
    setLoading(true);
    try {
      const updateData: any = { pinInactivityLimit: securityData.pinInactivityLimit };
      if (securityData.newPin) {
        updateData.pin = securityData.newPin;
      }
      await updateProfile(updateData);
      setSecurityData(prev => ({ ...prev, oldPin: '', newPin: '', confirmPin: '' }));
      showToast("Seguridad actualizada correctamente", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBank = () => {
    const newBanks = [...(settings.banks || []), ''];
    updateSettings({ banks: newBanks });
  };

  const handleBankChange = (index: number, value: string) => {
    const newBanks = [...(settings.banks || [])];
    newBanks[index] = value;
    updateSettings({ banks: newBanks });
  };

  const handleRemoveBank = (index: number) => {
    const newBanks = [...(settings.banks || [])];
    newBanks.splice(index, 1);
    updateSettings({ banks: newBanks });
  };

  const TABS = [
    { id: 'GENERAL', label: 'General', icon: User },
    { id: 'APPEARANCE', label: 'Personalización', icon: Palette },
    { id: 'SECURITY', label: 'Seguridad', icon: Shield },
    { id: 'FINANCIAL', label: 'Financiero', icon: Calculator },
    { id: 'BACKUP', label: 'Respaldos', icon: Database },
  ] as const;

  const fontOptions = [
    { name: 'Inter (Predeterminada)', value: 'Inter, sans-serif' },
    { name: 'Space Grotesk', value: '"Space Grotesk", sans-serif' },
    { name: 'Playfair Display', value: '"Playfair Display", serif' },
    { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace' }
  ];

  const colorOptions = [
    { name: 'Índigo (Por defecto)', value: 'indigo', hex: '#6366f1' },
    { name: 'Esmeralda', value: 'emerald', hex: '#10b981' },
    { name: 'Violeta', value: 'violet', hex: '#8b5cf6' },
    { name: 'Rosa', value: 'pink', hex: '#ec4899' },
    { name: 'Cian', value: 'cyan', hex: '#06b6d4' },
    { name: 'Ámbar', value: 'amber', hex: '#f59e0b' },
  ];

  const positionOptions = [
    { name: 'Izquierda', value: 'left', icon: AlignLeft },
    { name: 'Derecha', value: 'right', icon: AlignRight },
    { name: 'Arriba', value: 'top', icon: ArrowUp },
    { name: 'Abajo', value: 'bottom', icon: ArrowDown },
  ];

  // Backup handlers
  
  const fetchAllData = async () => {
    const tenantId = impersonatedUser 
      ? impersonatedUser.uid 
      : (profile?.role === 'enterprise' ? user?.uid : (profile?.enterpriseId || user?.uid || ''));
    if (!tenantId) throw new Error("No hay un identificador de empresa/inquilino activo");

    const [
      employees,
      checks,
      sales,
      collections,
      articles,
      invoices,
      beneficiaries,
      budgets,
      warehouses,
      warehouse_inventory,
      loans_returns,
      transfers,
      inventory_sales
    ] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'checks')),
      getDocs(collection(db, 'sales')),
      getDocs(collection(db, 'collections')),
      getDocs(collection(db, 'articles')),
      getDocs(collection(db, 'invoices')),
      getDocs(collection(db, 'beneficiaries')),
      getDocs(collection(db, 'budgets')),
      getDocs(collection(db, 'warehouses')),
      getDocs(collection(db, 'warehouse_inventory')),
      getDocs(collection(db, 'loans_returns')),
      getDocs(collection(db, 'transfers')),
      getDocs(collection(db, 'inventory_sales')),
    ]);

    const filterByTenant = (list: any[]) => {
      return list.filter(d => d.enterpriseId === tenantId || d.userId === tenantId);
    };

    return {
      employees: filterByTenant(employees.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      checks: filterByTenant(checks.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      sales: filterByTenant(sales.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      collections: filterByTenant(collections.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      inventory: filterByTenant(articles.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      invoices: filterByTenant(invoices.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      beneficiaries: filterByTenant(beneficiaries.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      budgets: filterByTenant(budgets.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      warehouses: filterByTenant(warehouses.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      warehouse_inventory: filterByTenant(warehouse_inventory.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      loans_returns: filterByTenant(loans_returns.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      transfers: filterByTenant(transfers.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
      inventory_sales: filterByTenant(inventory_sales.docs.map(d => ({id: d.id, ...(d.data() as any)}))),
    };
  };

  const handleExport = async (format: 'json' | 'excel') => {
    if (!(await verifyPin(backupPin))) {
      showToast("El PIN de acceso es incorrecto", "error");
      return;
    }
    setLoading(true);
    try {
      showToast("Exportando base de datos...", "success");
      const dbData = await fetchAllData();
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(dbData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_control360_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        await logAudit(AuditAction.SENSITIVE_READ, 'Exportación de copia de seguridad (JSON) de la base de datos.');
      } else {
        const wb = XLSX.utils.book_new();
        
        // Empleados
        const empData = dbData.employees.map((e: any) => {
          const empBudgets = dbData.budgets.filter((b: any) => b.employeeId === e.id);
          const lastBudget = empBudgets[empBudgets.length - 1];
          return {
            'nombre': `${e.name || ''} ${e.lastName || ''}`.trim(),
            'Rol (cobrador - vendedor o ambos)': e.role || '',
            'Presupuesto Ventas': lastBudget?.salesBudget || 0,
            'Presupuesto Cobranza': lastBudget?.collectionsBudget || 0
          };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), "empleados");
        
        // Cheques
        const checkData = dbData.checks
          .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
          .map((c: any) => {
            const inv = dbData.invoices.find((i: any) => i.id === c.invoiceId);
            return {
              'Beneficiario': c.beneficiaryName || '',
              '# Factura': inv?.invoiceNumber || c.invoiceId || '',
              'Concepto': c.concept || '',
              '# Cheque': c.checkNumber || '',
              'Fecha Pago': c.dueDate || '',
              'Valor': c.amount || 0,
              'Banco': c.bank || '',
              'Estado': c.status === 'PAID' ? 'PAGADO' : 'PENDIENTE'
            };
          });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checkData), "cheques");
        
        // Ventas
        const salesData = dbData.sales.map((s: any) => ({
          'fecha': s.date || '',
          'vendedor': dbData.employees.find((e: any) => e.id === s.employeeId)?.name || s.employeeId || '',
          'cliente': s.clientName || '',
          'tipo (contado o credito)': s.type || '',
          'articulo/producto detallado': s.article || '',
          'valor final': s.totalValue || 0
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), "ventas");
        
        // Cobranza
        const colData = dbData.collections.map((c: any) => ({
          'Fecha Inicio': c.initialDate || '',
          'Fecha Fin': c.finalDate || '',
          'Cobrador': dbData.employees.find((e: any) => e.id === c.employeeId)?.name || c.employeeId || '',
          'Recibo Inicial': c.initialReceipt || '',
          'Recibo Final': c.finalReceipt || '',
          'Total Cobrado': c.totalCollected || 0,
          'Depósitos': c.depositsTransfers || 0,
          'Efectivo': c.cashFinal || 0
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(colData), "cobranza");
        
        // Inventario
        const invData = dbData.inventory.map((i: any) => {
          const itemInvs = dbData.warehouse_inventory.filter((wi: any) => wi.articleId === i.id);
          const warehousesAssigned = itemInvs.map((wi: any) => {
            const wh = dbData.warehouses.find((w: any) => w.id === wi.warehouseId);
            return wh ? `${wh.name} (${wi.quantity})` : `Bodega ID: ${wi.warehouseId} (${wi.quantity})`;
          }).join(', ');

          return {
            'nombre del articulo': i.name || '',
            'categoria': i.category || '',
            'marca': i.brand || '',
            'modelo': i.model || '',
            'codigo de barras': i.barcode || '',
            'minimo para alerta': i.minStockAlert || 0,
            'Numero de serie': (i.seriesList || []).join(', '),
            'Bodega a la que fue asignada': warehousesAssigned || 'Ninguna'
          };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invData), "inventario");
        
        XLSX.writeFile(wb, `backup_control360_${new Date().toISOString().split('T')[0]}.xlsx`);
        await logAudit(AuditAction.SENSITIVE_READ, 'Exportación de copia de seguridad (Excel) de la base de datos.');
      }
    } catch (e) {
      console.error(e);
      showToast("Error exportando", "error");
    } finally {
      setLoading(false);
      setBackupPin('');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'overwrite' | 'merge') => {
    if (!(await verifyPin(backupPin))) {
      showToast("El PIN de acceso es incorrecto", "error");
      if (e.target) e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const activeUid = impersonatedUser 
        ? impersonatedUser.uid 
        : (profile?.role === 'enterprise' ? user?.uid : (profile?.enterpriseId || user?.uid || ''));
      if (!activeUid) throw new Error("No hay usuario activo");
      
      const fileText = await file.text();
      let importedData;
      if (file.name.endsWith('.json')) {
        importedData = JSON.parse(fileText);
      } else {
         showToast("La importación desde Excel aún no está completamente soportada, use JSON", "error");
         setLoading(false);
         setBackupPin('');
         if (e.target) e.target.value = '';
         return;
      }
      
      const batch = writeBatch(db);
      
      const collectionsMap: any = {
        employees: 'employees',
        checks: 'checks',
        sales: 'sales',
        collections: 'collections',
        inventory: 'articles',
        invoices: 'invoices',
        beneficiaries: 'beneficiaries',
        budgets: 'budgets',
        warehouses: 'warehouses',
        warehouse_inventory: 'warehouse_inventory',
        loans_returns: 'loans_returns',
        transfers: 'transfers',
        inventory_sales: 'inventory_sales'
      };
      
      for (const [key, collectionName] of Object.entries(collectionsMap)) {
        const listName = key === 'inventory' ? 'inventory' : key;
        if (importedData[listName] && Array.isArray(importedData[listName])) {
           for (const item of importedData[listName]) {
             const docId = item.id || crypto.randomUUID();
             const docRef = doc(db, collectionName as string, docId);
             const dataToSave = { ...item };
             delete dataToSave.id;
             
             if (dataToSave.hasOwnProperty('enterpriseId') || collectionName === 'employees' || collectionName === 'sales' || collectionName === 'collections' || collectionName === 'checks' || collectionName === 'budgets') {
               dataToSave.enterpriseId = activeUid;
             }
             if (dataToSave.hasOwnProperty('userId') || collectionName === 'articles' || collectionName === 'warehouses' || collectionName === 'warehouse_inventory' || collectionName === 'loans_returns' || collectionName === 'transfers' || collectionName === 'inventory_sales' || collectionName === 'invoices' || collectionName === 'beneficiaries') {
               dataToSave.userId = activeUid;
             }
             
             batch.set(docRef, dataToSave, { merge: true });
           }
        }
      }
      
      await batch.commit();
      
      showToast(`Base de datos restaurada en modo: ${mode === 'merge' ? 'Fusión' : 'Sobreescritura'}`, "success");
      await logAudit(AuditAction.SETTINGS_UPDATE, `Importación de base de datos completa (${mode})`);
    } catch (err) {
      console.error(err);
      showToast("Error importando", "error");
    } finally {
      setLoading(false);
      setBackupPin('');
      if (e.target) e.target.value = '';
    }
  };


  return (
    <>
      {positionConfirmTimer && (
        <div className={cn(
          "fixed left-1/2 transform -translate-x-1/2 z-[100] bg-neutral-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in",
          settings.menuPosition === 'bottom' 
            ? "top-6 slide-in-from-top-5" 
            : "bottom-6 slide-in-from-bottom-5"
        )}>
          <div>
            <p className="font-bold text-sm">¿Mantener esta ubicación?</p>
            <p className="text-xs text-neutral-400">Restableciendo en {timeLeft}s...</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cancelPositionChange} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-bold transition-colors">Revertir</button>
            <button onClick={confirmPositionChange} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold transition-colors">Mantener</button>
          </div>
        </div>
      )}

    <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8 pb-20 animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Personaliza la experiencia, opciones financieras y seguridad de la plataforma.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
        <div className="w-full md:w-64 shrink-0 space-y-2">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200",
                  isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none"
                    : "bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                )}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === 'GENERAL' && (
            <section className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Perfil del Usuario</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Administra tus datos personales e información básica.</p>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <img 
                      src={profileData.photoUrl || user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.name || 'User')}&background=random`}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-neutral-800 shadow-xl"
                    />
                  </div>
                                    <div className="space-y-3 flex-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Foto de Perfil</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="url"
                        value={profileData.photoUrl}
                        onChange={(e) => setProfileData({ ...profileData, photoUrl: e.target.value })}
                        className="flex-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="URL de la imagen"
                      />
                      <label className="cursor-pointer bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-4 py-3 rounded-xl font-bold text-sm text-center hover:bg-indigo-100 transition-colors whitespace-nowrap">
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        Subir Foto
                      </label>
                      {user?.photoURL && (
                        <button
                          onClick={() => setProfileData({ ...profileData, photoUrl: user.photoURL || '' })}
                          className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-4 py-3 rounded-xl font-bold text-sm hover:bg-neutral-200 transition-colors whitespace-nowrap"
                        >
                          Usar Google
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Nombre Completo</label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Ej: Juan Pérez"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Teléfono Móvil</label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="0999999999"
                    />
                  </div>
                </div>
              </div>

              <div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button onClick={handleSaveProfile} disabled={loading} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2">
                  <Save className="w-4 h-4" /> Guardar Cambios
                </button>
              </div>
            </section>
          )}

          {activeTab === 'APPEARANCE' && (
            <section className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                  <Palette className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Apariencia y Visualización</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Ajusta los colores, temas, tipografía y estilo general.</p>
                </div>
              </div>
              
              <div className="p-8 space-y-8">
                {/* Tema */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Monitor className="w-4 h-4" /> Tema Principal
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { id: 'light', icon: Sun, label: 'Modo Claro' },
                      { id: 'dark', icon: Moon, label: 'Modo Oscuro' },
                      { id: 'system', icon: Monitor, label: 'Sistema' }
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => updateSettings({ theme: t.id as any })}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all font-bold gap-3",
                          settings.theme === t.id
                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300"
                            : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500 hover:border-indigo-200"
                        )}
                      >
                        <t.icon className="w-6 h-6" />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* UI Style */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Estilo de Interfaz
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      onClick={() => updateSettings({ uiStyle: 'classic' })}
                      className={cn(
                        "p-6 rounded-2xl border-2 transition-all font-bold text-left space-y-1",
                        settings.uiStyle === 'classic' ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300" : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500"
                      )}
                    >
                      <div className="text-base">Sólido Moderno</div>
                      <div className="text-xs font-normal opacity-80">Colores sólidos y contrastes limpios.</div>
                    </button>
                    <button
                      onClick={() => updateSettings({ uiStyle: 'glass' })}
                      className={cn(
                        "p-6 rounded-2xl border-2 transition-all font-bold text-left space-y-1 relative overflow-hidden",
                        settings.uiStyle === 'glass' ? "bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300" : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500"
                      )}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none backdrop-blur-sm" />
                      <div className="relative z-10 text-base">Glassmorfismo</div>
                      <div className="relative z-10 text-xs font-normal opacity-80">Transparencias, desenfoques y efectos de cristal.</div>
                    </button>
                    <button
                      onClick={() => updateSettings({ uiStyle: 'liquid-glass' })}
                      className={cn(
                        "p-6 rounded-2xl border-2 transition-all font-bold text-left space-y-1 relative overflow-hidden sm:col-span-2",
                        settings.uiStyle === 'liquid-glass' ? "bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300" : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500"
                      )}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 pointer-events-none backdrop-blur-md" />
                      <div className="relative z-10 text-base">Liquid Glass</div>
                      <div className="relative z-10 text-xs font-normal opacity-80">Efecto avanzado con desenfoques acrílicos, transparencias orgánicas y texturas.</div>
                    </button>

                  </div>
                </div>


                {settings.uiStyle === 'liquid-glass' && (
                  <div className="space-y-4 p-6 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-2xl animate-in slide-in-from-top-2">
                    <label className="text-sm font-bold text-indigo-900 dark:text-indigo-100 uppercase tracking-widest flex items-center gap-2">
                      <PaintBucket className="w-4 h-4" /> Fondo Liquid Glass
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { id: 'gradient', label: 'Gradiente Vibrante' },
                        { id: 'animated', label: 'Fondo Animado' },
                        { id: 'custom', label: 'Fondo Personalizado' }
                      ].map(bg => (
                        <button
                          key={bg.id}
                          onClick={() => updateSettings({ liquidBackgroundType: bg.id as any })}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all font-bold text-center text-sm",
                            (settings.liquidBackgroundType || 'gradient') === bg.id
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white dark:bg-neutral-800 border-transparent text-neutral-600 dark:text-neutral-400 hover:border-indigo-200"
                          )}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                    

                    {settings.liquidBackgroundType === 'custom' && (
                      <div className="mt-4 space-y-2">
                        <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 block">URL de Imagen (o sube un archivo en Firebase)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="url"
                            value={settings.liquidBackgroundValue || ''}
                            onChange={(e) => updateSettings({ liquidBackgroundValue: e.target.value })}
                            className="flex-1 bg-white dark:bg-neutral-800 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                            placeholder="https://ejemplo.com/imagen.jpg"
                          />
                          <label className="p-3 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl cursor-pointer hover:bg-indigo-200 transition-colors">
                            <Upload className="w-5 h-5" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  setLoading(true);
                                  showToast("Subiendo imagen...", "info");
                                  const storageRef = ref(storage, `backgrounds/${user?.uid || 'global'}_${Date.now()}_${file.name}`);
                                  await uploadBytes(storageRef, file);
                                  const url = await getDownloadURL(storageRef);
                                  updateSettings({ liquidBackgroundValue: url });
                                  showToast("Imagen subida y aplicada", "success");
                                } catch (error) {
                                  console.error("Error al subir:", error);
                                  showToast("Error al subir la imagen", "error");
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Opciones de Magnificación del Dock (Solo si liquid-glass está seleccionado) */}
                {settings.uiStyle === 'liquid-glass' && (
                  <div className="space-y-4 p-6 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-2xl animate-in slide-in-from-top-2">
                    <label className="text-sm font-bold text-indigo-900 dark:text-indigo-100 uppercase tracking-widest flex items-center gap-2">
                      <Palette className="w-4 h-4" /> Efecto de Magnificación del Dock (macOS Style)
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Habilita la animación de lupa interactiva en la barra de navegación al pasar el cursor.
                    </p>

                    <div className="flex items-center justify-between p-4 bg-white dark:bg-neutral-800/40 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div>
                        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Activar Magnificación</div>
                        <div className="text-xs text-neutral-500">Aumenta el tamaño del icono bajo el cursor.</div>
                      </div>
                      <button
                        onClick={() => updateSettings({ dockMagnification: !settings.dockMagnification })}
                        className={cn(
                          "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          settings.dockMagnification ? "bg-indigo-600" : "bg-neutral-200 dark:bg-neutral-700"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            settings.dockMagnification ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {settings.dockMagnification && (
                      <>
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-neutral-800/40 rounded-xl border border-neutral-100 dark:border-neutral-800 animate-in fade-in duration-200">
                          <div>
                            <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Efecto de Proximidad</div>
                            <div className="text-xs text-neutral-500">Los iconos vecinos crecen ligeramente (estilo fluido orgánico).</div>
                          </div>
                          <button
                            onClick={() => updateSettings({ dockProximity: !settings.dockProximity })}
                            className={cn(
                              "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              settings.dockProximity ? "bg-indigo-600" : "bg-neutral-200 dark:bg-neutral-700"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                settings.dockProximity ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>

                        <div className="space-y-2 animate-in fade-in duration-200">
                          <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 block">Tipo de Magnificación</label>
                          <div className="grid grid-cols-2 gap-4">
                            {[
                              { id: 'scale', label: 'Escalado Visual (Scale)', desc: 'Efecto de zoom fluido en 2D' },
                              { id: 'size', label: 'Tamaño Físico (Size)', desc: 'Desplaza los elementos vecinos físicamente' }
                            ].map(type => (
                              <button
                                key={type.id}
                                onClick={() => updateSettings({ dockMagnificationType: type.id as any })}
                                className={cn(
                                  "p-4 rounded-xl border-2 transition-all font-bold text-left text-sm flex flex-col justify-between h-20",
                                  settings.dockMagnificationType === type.id
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "bg-white dark:bg-neutral-800 border-transparent text-neutral-600 dark:text-neutral-400 hover:border-indigo-200"
                                )}
                              >
                                <span>{type.label}</span>
                                <span className={cn("text-[10px] font-normal", settings.dockMagnificationType === type.id ? "text-indigo-100" : "text-neutral-400")}>
                                  {type.desc}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Tipografía */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Type className="w-4 h-4" /> Tipo de Letra
                  </label>
                  <select
                    value={settings.fontFamily || ''}
                    onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                    className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {fontOptions.map(font => (
                      <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>
                        {font.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color de Acento */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <PaintBucket className="w-4 h-4" /> Paleta Cromática de Acento
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {colorOptions.map(color => (
                      <button
                        key={color.value}
                        onClick={() => updateSettings({ accentColor: color.value })}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all font-bold",
                          (settings.accentColor || 'indigo') === color.value
                            ? "bg-neutral-50 dark:bg-neutral-900 border-indigo-500 text-neutral-900 dark:text-white"
                            : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500 hover:border-indigo-200"
                        )}
                      >
                        <div className="w-6 h-6 rounded-full shadow-inner" style={{ backgroundColor: color.hex }} />
                        <span className="text-sm">{color.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Posición del menú */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <AlignLeft className="w-4 h-4" /> Ubicación del Panel de Módulos
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    {positionOptions.map(pos => (
                      <button
                        key={pos.value}
                        onClick={() => handlePositionChange(pos.value as any)}
                        className={cn(
                          "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all font-bold gap-3",
                          (settings.menuPosition || 'left') === pos.value
                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300"
                            : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500 hover:border-indigo-200"
                        )}
                      >
                        <pos.icon className="w-6 h-6" />
                        {pos.name}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </section>
          )}

          {activeTab === 'SECURITY' && (
            <section className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-2xl text-red-600 dark:text-red-400">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Control de Accesos</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Protege tu terminal e información sensible.</p>
                </div>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">PIN Actual *</label>
                    <input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*"
                      maxLength={6}
                      value={securityData.oldPin}
                      onChange={(e) => setSecurityData({ ...securityData, oldPin: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono tracking-widest text-lg"
                      placeholder="••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Nuevo PIN (6 dígitos)</label>
                    <input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*"
                      maxLength={6}
                      value={securityData.newPin}
                      onChange={(e) => setSecurityData({ ...securityData, newPin: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono tracking-widest text-lg"
                      placeholder="••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Confirmar Nuevo PIN</label>
                    <input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*"
                      maxLength={6}
                      value={securityData.confirmPin}
                      onChange={(e) => setSecurityData({ ...securityData, confirmPin: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono tracking-widest text-lg"
                      placeholder="••••••"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Sesión Auto-protegida</label>
                  <select
                    value={securityData.pinInactivityLimit}
                    onChange={(e) => setSecurityData({ ...securityData, pinInactivityLimit: parseInt(e.target.value) })}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value={1}>Bloqueo: 1 Minuto</option>
                    <option value={5}>Bloqueo: 5 Minutos</option>
                    <option value={15}>Bloqueo: 15 Minutos</option>
                    <option value={60}>Bloqueo: 1 Hora</option>
                    <option value={1440}>Bloqueo: 24 Horas</option>
                  </select>
                </div>
              </div>
                            <div className="p-8 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-1">Autenticador de Google (2FA)</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Utiliza Google Authenticator para reestablecer tu PIN en caso de olvido.
                    </p>
                  </div>
                  <div>
                    {profile?.totpEnabled ? (
                      <button 
                        onClick={handleRemoveTotp}
                        disabled={loading}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button 
                        onClick={handleSetupTotp}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors"
                      >
                        Configurar
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button onClick={handleSaveSecurity} disabled={loading} className="px-6 py-3 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all flex items-center gap-2">
                  <Save className="w-4 h-4" /> Guardar Seguridad
                </button>
              </div>
            </section>
          )}

          {activeTab === 'FINANCIAL' && profile?.role !== 'BODEGUERO' && (
            <section className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400">
                  <Building className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Finanzas y Bancos</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Configura IVA, moneda y entidades bancarias.</p>
                </div>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Moneda de Visualización
                    </label>
                    <select
                      value={settings.currency}
                      onChange={(e) => updateSettings({ currency: e.target.value as any })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      <option value="USD">Dólar Estadounidense (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                      <option value="ARS">Peso Argentino (ARS)</option>
                      <option value="CLP">Peso Chileno (CLP)</option>
                      <option value="BRL">Real Brasileño (BRL)</option>
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                      <Calculator className="w-4 h-4" /> Configuración de IVA (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={settings.iva}
                      onChange={(e) => updateSettings({ iva: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="15"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-8 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-neutral-900 dark:text-white uppercase tracking-wider text-sm">Entidades Bancarias</h3>
                    <button onClick={handleAddBank} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-xs hover:bg-blue-100 transition-all flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Nuevo Banco
                    </button>

                  </div>
                  {(!settings.banks || settings.banks.length === 0) ? (
                    <p className="text-sm text-neutral-500 italic">No tienes entidades bancarias configuradas.</p>
                  ) : (
                    <div className="space-y-3">
                      {settings.banks.map((bank, idx) => (
                        <div key={idx} className="flex gap-4">
                          <input 
                            type="text" 
                            value={bank}
                            onChange={e => handleBankChange(idx, e.target.value)}
                            className="flex-1 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="Ej: Banco Pichincha"
                          />
                          <button onClick={() => handleRemoveBank(idx)} className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'BACKUP' && (
            <section className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Respaldos y Migración</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Exporta e importa los datos del sistema (Excel/JSON).</p>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-2xl">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-500">Autenticación Requerida</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-1">Para exportar o importar datos, por favor ingresa tu PIN de seguridad actual.</p>
                  <input
                    type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" inputMode="numeric" pattern="[0-9]*"
                    maxLength={6}
                    value={backupPin}
                    onChange={e => setBackupPin(e.target.value.replace(/\D/g, ''))}
                    className="mt-4 w-full md:w-64 bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-amber-500 outline-none font-mono tracking-widest"
                    placeholder="PIN de Acceso"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Exportar */}
                  <div className="border border-neutral-100 dark:border-neutral-800 rounded-3xl p-6 space-y-4 bg-neutral-50/50 dark:bg-neutral-800/20">
                    <div>
                      <h3 className="font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                        <Download className="w-5 h-5 text-indigo-500" /> Exportar Datos
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1">Descarga una copia completa del sistema.</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleExport('json')} disabled={loading || backupPin.length !== 6} className="flex-1 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-bold hover:bg-neutral-50 disabled:opacity-50 transition-all">
                        Formato JSON
                      </button>
                      <button onClick={() => handleExport('excel')} disabled={loading || backupPin.length !== 6} className="flex-1 py-3 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 transition-all">
                        Formato Excel
                      </button>
                    </div>
                  </div>

                  {/* Importar */}
                  <div className="border border-neutral-100 dark:border-neutral-800 rounded-3xl p-6 space-y-4 bg-neutral-50/50 dark:bg-neutral-800/20">
                    <div>
                      <h3 className="font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                        <Upload className="w-5 h-5 text-indigo-500" /> Importar Datos
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1">Restaura la base de datos (Requiere archivo JSON o Excel).</p>
                    </div>
                    <div className="flex gap-3 relative">
                      <input type="file" id="file-overwrite" className="hidden" accept=".json,.xlsx,.xls" onChange={(e) => handleImport(e, 'overwrite')} />
                      <input type="file" id="file-merge" className="hidden" accept=".json,.xlsx,.xls" onChange={(e) => handleImport(e, 'merge')} />
                      
                      <label htmlFor="file-overwrite" className={`flex-1 py-3 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-sm font-bold text-center cursor-pointer hover:bg-red-100 transition-all ${loading || backupPin.length !== 6 ? 'opacity-50 pointer-events-none' : ''}`}>
                        Sobreescribir
                      </label>
                      <label htmlFor="file-merge" className={`flex-1 py-3 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-xl text-sm font-bold text-center cursor-pointer hover:bg-blue-100 transition-all ${loading || backupPin.length !== 6 ? 'opacity-50 pointer-events-none' : ''}`}>
                        Fusionar (Merge)
                      </label>
                    </div>
                    <p className="text-[10px] text-neutral-400 italic">
                      <b>Sobreescribir</b> elimina los datos actuales y carga los nuevos.<br/>
                      <b>Fusionar</b> mantiene los datos actuales y solo añade los que no existan.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>


      {/* 2FA TOTP Setup Modal */}
      {showTotpModal && totpSetup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl relative border border-neutral-100 dark:border-neutral-800">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Configurar Autenticador</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 font-medium">Escanea este código QR con la app de Google Authenticator u otra similar.</p>
            </div>
            
            <div className="flex justify-center bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm mx-auto w-fit mb-6">
              <QRCodeSVG value={totpSetup.uri} size={180} />
            </div>
            
            <div className="text-center mb-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Clave Secreta</p>
              <code className="bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg text-xs font-mono text-neutral-700 dark:text-neutral-300 break-all select-all">
                {totpSetup.secret.base32}
              </code>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block text-center">Código de Verificación (6 dígitos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/D/g, ''))}
                  className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all"
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTotpModal(false); setTotpSetup(null); setTotpCode(''); }}
                  className="flex-1 py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-[1.5rem] font-bold active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleVerifyAndSaveTotp}
                  disabled={loading || totpCode.length !== 6}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all"
                >
                  {loading ? 'Verificando...' : 'Verificar y Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
