import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Search,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Info,
  Calendar,
  DollarSign,
  Users,
  ChevronRight,
  Sparkles,
  Database,
  Clock,
  Layers,
  ArrowRight,
  Filter,
  Check,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import {
  processBuroFile,
  exportBuroToExcel,
  exportBuroToGjm,
  BuroProcessingResult,
  BuroRecord,
  PhaseAudit
} from '../lib/buroProcessor';
import { SAMPLE_GJM_FILE } from '../lib/sampleGjmData';
import { cn } from '../lib/utils';

export default function Buro() {
  const { user, profile } = useAuth();
  const { showToast } = useNotification();
  const currentEnterpriseId = profile?.enterpriseId || user?.uid;

  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<BuroProcessingResult | null>(null);
  const [activeTab, setActiveTab] = useState<'principal' | 'incompletas' | 'auditoria' | 'historial'>('principal');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load execution history from Firestore
  const fetchHistory = async () => {
    if (!currentEnterpriseId) return;
    try {
      setLoadingHistory(true);
      const q = query(
        collection(db, 'buro_logs'),
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort client-side by date
      docs.sort((a: any, b: any) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA;
      });
      setHistoryLogs(docs);
    } catch (err) {
      console.error('Error fetching buro history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [currentEnterpriseId]);

  // Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    setFileName(file.name);
    const lowerName = file.name.toLowerCase();
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Convert sheet to semicolon-separated text
          const csvText = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
          setFileContent(csvText || '');
          showToast(`Archivo Excel "${file.name}" leído exitosamente`, 'success');
        } catch (err: any) {
          console.error('Error leyendo Excel:', err);
          showToast(`Error al procesar hoja Excel: ${err?.message || 'Formato no soportado'}`, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setFileContent(text || '');
        showToast(`Archivo "${file.name}" cargado exitosamente`, 'success');
      };
      reader.readAsText(file, 'ISO-8859-1'); // Common encoding for Latin systems/GJM
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // Load sample file
  const handleLoadSample = () => {
    setFileName('cartera_ejemplo_equifax.gjm');
    setFileContent(SAMPLE_GJM_FILE);
    showToast('Datos de ejemplo .gjm cargados', 'info');
  };

  // Execute 12-Phase Processing
  const handleRunETL = async () => {
    if (!fileContent.trim()) {
      showToast('Por favor cargue un archivo .gjm o texto antes de procesar', 'error');
      return;
    }

    try {
      setProcessing(true);
      // Simulate pipeline animation
      await new Promise((resolve) => setTimeout(resolve, 600));

      const res = processBuroFile(fileContent);
      setResult(res);
      setActiveTab('principal');

      // Save execution audit log to Firestore
      if (currentEnterpriseId) {
        try {
          await addDoc(collection(db, 'buro_logs'), {
            enterpriseId: currentEnterpriseId,
            userEmail: user?.email || '',
            originalFileName: fileName || 'archivo_cartera.gjm',
            processedAt: Timestamp.now(),
            createdAt: Timestamp.now(),
            stats: res.stats,
            principalFilename: res.principalFilename,
            secondaryFilename: res.secondaryFilename
          });
          fetchHistory();
        } catch (dbErr) {
          console.error('Error saving buro audit log to Firestore:', dbErr);
        }
      }

      showToast(`Procesamiento completado: ${res.stats.validCedulasCount} registros limpios listos`, 'success');
    } catch (err: any) {
      console.error('Error processing buro file:', err);
      showToast('Error durante el procesamiento del archivo: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Download Handlers
  const handleDownloadPrincipal = () => {
    if (!result || result.principalRecords.length === 0) {
      showToast('No hay registros principales para exportar', 'error');
      return;
    }
    exportBuroToExcel(result.principalRecords, result.principalFilename, false);
    showToast(`Descargado ${result.principalFilename}`, 'success');
  };

  const handleDownloadPrincipalGjm = () => {
    if (!result || result.principalRecords.length === 0) {
      showToast('No hay registros principales para exportar', 'error');
      return;
    }
    const gjmName = result.principalFilename.replace(/\.xlsx$/i, '.gjm');
    exportBuroToGjm(result.principalRecords, gjmName);
    showToast(`Descargado ${gjmName}`, 'success');
  };

  const handleDownloadIncompletas = () => {
    if (!result || result.invalidRecords.length === 0) {
      showToast('No hay registros de cédulas incompletas para exportar', 'info');
      return;
    }
    exportBuroToExcel(result.invalidRecords, result.secondaryFilename, true);
    showToast(`Descargado ${result.secondaryFilename}`, 'success');
  };

  // Filter principal records for search
  const filteredPrincipal = (result?.principalRecords || []).filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.cod_id_sujeto || '').toLowerCase().includes(term) ||
      (r.nom_sujeto || '').toLowerCase().includes(term) ||
      (r.num_operacion || '').toLowerCase().includes(term)
    );
  });

  // Filter invalid records for search
  const filteredInvalid = (result?.invalidRecords || []).filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.cod_id_sujeto || '').toLowerCase().includes(term) ||
      (r.nom_sujeto || '').toLowerCase().includes(term) ||
      (r.num_operacion || '').toLowerCase().includes(term) ||
      (r.validation_result?.reason || '').toLowerCase().includes(term)
    );
  });

  const currentMonthDisplay = format(new Date(), "MMMM 'de' yyyy", { locale: es }).toUpperCase();

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/40 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Módulo de Inteligencia de Cartera Equifax
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-indigo-400" />
              Buró de Crédito — Validación de Cartera
            </h1>
            <p className="text-neutral-300 text-sm max-w-2xl">
              Procesamiento automatizado de 12 fases bajo el estándar de Equifax Ecuador.
              Estructura, limpia, valida cédulas mediante Módulo 10 y exporta archivos <code className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-mono">2968_(FECHA_DE_CORTE).xlsx</code> y <code className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-mono">Cedulas_Incompletas.xlsx</code>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white/5 backdrop-blur-md p-3 rounded-2xl border border-white/10">
            <div className="text-left sm:text-right px-2">
              <p className="text-xs text-neutral-400 font-medium">Período de Envío</p>
              <p className="text-sm font-bold text-indigo-300 capitalize">{currentMonthDisplay}</p>
            </div>
            <button
              onClick={handleLoadSample}
              className="px-4 py-2.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" />
              Cargar Archivo Ejemplo
            </button>
          </div>
        </div>
      </div>

      {/* File Upload / Input Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-500" />
              Cargar Archivo Plano Fuente (.gjm / .txt / .csv)
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Seleccione o arrastre el archivo plano con delimitador de punto y coma (;)
            </p>
          </div>
          {fileContent && (
            <button
              onClick={() => {
                setFileContent('');
                setFileName('');
                setResult(null);
              }}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors"
            >
              Limpiar archivo
            </button>
          )}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3",
            dragActive
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 scale-[1.01]"
              : fileContent
              ? "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10"
              : "border-neutral-300 dark:border-neutral-700 hover:border-indigo-400 dark:hover:border-indigo-600 bg-neutral-50/50 dark:bg-neutral-800/30"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".gjm,.txt,.csv,.dat,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform",
            fileContent ? "bg-emerald-500 text-white" : "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
          )}>
            {fileContent ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
          </div>

          {fileContent ? (
            <div className="space-y-1">
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {fileName || 'Archivo cargado'}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                ✓ Contenido preparado ({fileContent.split('\n').filter(Boolean).length} filas detectadas / {(fileContent.length / 1024).toFixed(1)} KB)
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Arrastre su archivo <span className="font-bold text-indigo-600 dark:text-indigo-400">.gjm, .xlsx, .csv</span> aquí o haga clic
              </p>
              <p className="text-xs text-neutral-400">
                Soporta archivos Excel (.xlsx, .xls), archivos Equifax (.gjm), .txt o .csv (delimitado por ;, tabulación o coma)
              </p>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleRunETL}
            disabled={!fileContent || processing}
            className={cn(
              "px-6 py-3 rounded-2xl font-bold text-sm text-white shadow-xl flex items-center gap-2 transition-all duration-200",
              !fileContent || processing
                ? "bg-neutral-300 dark:bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none"
                : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-500/25"
            )}
          >
            {processing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Ejecutando 12 Fases ETL...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Procesar y Validar Cartera Equifax
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Overview & Stats */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Cédulas Válidas
                </p>
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-neutral-900 dark:text-neutral-100 mt-2">
                {result.stats.validCedulasCount}
              </p>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                Destino: {result.principalFilename}
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Cédulas Incompletas
                </p>
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-neutral-900 dark:text-neutral-100 mt-2">
                {result.stats.invalidCedulasCount}
              </p>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-1">
                Destino: {result.secondaryFilename}
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Monto Cartera Limpia
                </p>
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-neutral-900 dark:text-neutral-100 mt-2">
                $ {result.stats.totalDeudaProcessed.toLocaleString('es-EC', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                Suma de saldos activos válidos
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Depuración & Parches
                </p>
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <Filter className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-neutral-900 dark:text-neutral-100 mt-2">
                {result.stats.inactiveAccountsRemoved + result.stats.datesPatchedCount + result.stats.morosityAlignedCount}
              </p>
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mt-1">
                Ajustes automáticos de calidad
              </p>
            </div>
          </div>

          {/* Quick Excel Downloads */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 p-5 rounded-3xl border border-indigo-200 dark:border-indigo-800/50">
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Archivos Listos para Exportación a Equifax
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Generados automáticamente bajo formato .xlsx con formato de texto estricto en identificadores.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadPrincipal}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                title="Descargar en formato Excel (.xlsx)"
              >
                <Download className="w-4 h-4" />
                Excel: {result.principalFilename}
              </button>
              <button
                onClick={handleDownloadPrincipalGjm}
                className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                title="Descargar en formato plano delimitado por punto y coma (.gjm)"
              >
                <Download className="w-4 h-4" />
                .GJM (Texto)
              </button>
              {result.invalidRecords.length > 0 && (
                <button
                  onClick={handleDownloadIncompletas}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Descargar {result.secondaryFilename} ({result.invalidRecords.length})
                </button>
              )}
            </div>
          </div>

          {/* Main Inspection Tabs */}
          <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
            <div className="border-b border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50/50 dark:bg-neutral-800/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Tab Navigation */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-neutral-200/60 dark:bg-neutral-800/80 rounded-2xl">
                <button
                  onClick={() => setActiveTab('principal')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'principal'
                      ? "bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Base Principal ({result.principalRecords.length})
                </button>

                <button
                  onClick={() => setActiveTab('incompletas')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'incompletas'
                      ? "bg-white dark:bg-neutral-900 text-amber-600 dark:text-amber-400 shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                  )}
                >
                  <ShieldAlert className="w-4 h-4" />
                  Cédulas Incompletas ({result.invalidRecords.length})
                </button>

                <button
                  onClick={() => setActiveTab('auditoria')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'auditoria'
                      ? "bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                  )}
                >
                  <Layers className="w-4 h-4" />
                  Informe 12 Fases ({result.audits.length})
                </button>

                <button
                  onClick={() => setActiveTab('historial')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'historial'
                      ? "bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                  )}
                >
                  <Clock className="w-4 h-4" />
                  Historial de Envíos
                </button>
              </div>

              {/* Search Bar for Table Tabs */}
              {(activeTab === 'principal' || activeTab === 'incompletas') && (
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar cédula, cliente u operación..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* TAB 1: Base Principal */}
            {activeTab === 'principal' && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between text-xs text-neutral-500 px-2">
                  <span>Mostrando {filteredPrincipal.length} registros limpios y validados.</span>
                  <span>NDI = 0 inyectado en todos los registros.</span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-100 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 font-bold uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                      <tr>
                        <th className="p-3">Identificación</th>
                        <th className="p-3">Cliente / Sujeto</th>
                        <th className="p-3">N° Operación</th>
                        <th className="p-3">Fec. Corte</th>
                        <th className="p-3 text-right">Por Vencer</th>
                        <th className="p-3 text-right">Vencido</th>
                        <th className="p-3 text-right">Deuda Total</th>
                        <th className="p-3 text-center">Días Mora</th>
                        <th className="p-3 text-center">NDI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200 font-medium">
                      {filteredPrincipal.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-neutral-400">
                            No se encontraron registros que coincidan con la búsqueda.
                          </td>
                        </tr>
                      ) : (
                        filteredPrincipal.map((r, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                            <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {r.cod_id_sujeto}
                            </td>
                            <td className="p-3 max-w-xs truncate font-semibold">
                              {r.nom_sujeto}
                            </td>
                            <td className="p-3 font-mono text-neutral-500">
                              {r.num_operacion}
                            </td>
                            <td className="p-3 whitespace-nowrap text-neutral-500">
                              {r.fec_corte_saldo}
                            </td>
                            <td className="p-3 text-right font-mono">
                              $ {r.val_xvencer.toFixed(2)}
                            </td>
                            <td className={cn("p-3 text-right font-mono", r.val_vencido > 0 ? "text-amber-600 dark:text-amber-400 font-bold" : "text-neutral-500")}>
                              $ {r.val_vencido.toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              $ {(r.deuda_total || 0).toFixed(2)}
                            </td>
                            <td className="p-3 text-center font-mono">
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", r.num_dias_vencido > 0 ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500")}>
                                {r.num_dias_vencido}d
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-neutral-400">
                              {r.VALOR_NDI}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: Cédulas Incompletas */}
            {activeTab === 'incompletas' && (
              <div className="p-4 space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-bold">Segregación Automatizada por Inconsistencia de Identidad</p>
                    <p>
                      Estos registros fallaron la validación matemática del <strong>Módulo 10 del Registro Civil ecuatoriano</strong> (dígito verificador, código de provincia o formato de cédula/RUC).
                      Han sido aislandos de la base principal para prevenir rechazos por parte de Equifax y se exportan en <code className="font-mono font-bold">{result.secondaryFilename}</code>.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-amber-100/50 dark:bg-amber-950/40 text-neutral-800 dark:text-neutral-200 font-bold uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                      <tr>
                        <th className="p-3">Identificación</th>
                        <th className="p-3">Motivo de Fallo</th>
                        <th className="p-3">Cliente / Sujeto</th>
                        <th className="p-3">N° Operación</th>
                        <th className="p-3 text-right">Deuda Total</th>
                        <th className="p-3">Teléfono</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200 font-medium">
                      {filteredInvalid.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-emerald-600 dark:text-emerald-400 font-bold">
                            ✓ ¡Excelente! No existen cédulas incompletas ni erróneas en este lote.
                          </td>
                        </tr>
                      ) : (
                        filteredInvalid.map((r, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors">
                            <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                              {r.cod_id_sujeto || '(Vacío)'}
                            </td>
                            <td className="p-3">
                              <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[11px] font-semibold border border-amber-300 dark:border-amber-800">
                                {r.validation_result?.reason || 'Error de Módulo 10'}
                              </span>
                            </td>
                            <td className="p-3 max-w-xs truncate font-semibold">
                              {r.nom_sujeto}
                            </td>
                            <td className="p-3 font-mono text-neutral-500">
                              {r.num_operacion}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              $ {(r.deuda_total || 0).toFixed(2)}
                            </td>
                            <td className="p-3 font-mono text-neutral-500">
                              {r.telefono}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: Informe de Auditoría 12 Fases */}
            {activeTab === 'auditoria' && (
              <div className="p-6 space-y-4">
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    Desglose de Auditoría Técnica — 12 Fases Secuenciales ETL
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Historial de transformaciones, limpieza y depuración aplicadas a la cartera.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.audits.map((audit) => (
                    <div
                      key={audit.phase}
                      className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold font-mono">
                          FASE {audit.phase}
                        </span>
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide",
                            audit.status === 'COMPLETED'
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                              : audit.status === 'WARNED'
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                              : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                          )}
                        >
                          {audit.status === 'COMPLETED' ? 'Ejecutado OK' : audit.status === 'WARNED' ? 'Ajustes Aplicados' : 'Informativo'}
                        </span>
                      </div>

                      <h5 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        {audit.name}
                      </h5>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {audit.description}
                      </p>

                      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[11px] space-y-1">
                        {audit.details.map((dt, dIdx) => (
                          <div key={dIdx} className="flex items-start gap-1.5 text-neutral-700 dark:text-neutral-300">
                            <ChevronRight className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                            <span>{dt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: Historial de Envíos */}
            {activeTab === 'historial' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      Historial de Lotes Procesados en Firestore
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Registro persistente de validaciones de cartera mensuales.
                    </p>
                  </div>
                  <button
                    onClick={fetchHistory}
                    className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="py-8 text-center text-xs text-neutral-400">
                    Cargando historial de ejecuciones...
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-400">
                    No se han registrado envíos anteriores aún.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyLogs.map((log) => {
                      const logDate = log.processedAt?.toDate
                        ? format(log.processedAt.toDate(), "dd 'de' MMMM yyyy - HH:mm", { locale: es })
                        : 'Fecha desconocida';

                      return (
                        <div
                          key={log.id}
                          className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                                {log.originalFileName || 'cartera.gjm'}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                                {log.principalFilename}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500">
                              Procesado por: {log.userEmail} • {logDate}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            <div className="text-right">
                              <p className="font-bold text-emerald-600 dark:text-emerald-400">
                                {log.stats?.validCedulasCount || 0} Válidas
                              </p>
                              <p className="text-[11px] text-neutral-400">
                                $ {(log.stats?.totalDeudaProcessed || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                              </p>
                            </div>

                            {log.stats?.invalidCedulasCount > 0 && (
                              <div className="text-right border-l border-neutral-200 dark:border-neutral-800 pl-4">
                                <p className="font-bold text-amber-600 dark:text-amber-400">
                                  {log.stats.invalidCedulasCount} Incompletas
                                </p>
                                <p className="text-[11px] text-neutral-400">
                                  {log.secondaryFilename}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
