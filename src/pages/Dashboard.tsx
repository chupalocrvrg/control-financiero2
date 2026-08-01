import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { formatCurrency, cn } from '../lib/utils';
import { CURRENT_VERSION } from '../lib/changelog';
import { 
  format, isBefore, isToday, isTomorrow, parseISO, startOfDay, endOfMonth, 
  addMonths, startOfMonth, eachDayOfInterval, getDay, isSameDay, subMonths,
  addDays, subDays
} from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  AlertTriangle, Bell, Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronUp, ChevronDown, 
  ChevronRight, ArrowUpRight, TrendingUp, DollarSign, BarChart3, PieChart
} from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, PieChart as RePieChart, Pie,
  LineChart, Line, Legend
} from 'recharts';
import { logAudit, AuditAction } from '../lib/audit';
import { Target, User, Store, Bike, Receipt } from 'lucide-react';
import InventoryDashboard from '../components/inventory/InventoryDashboard';

interface CommerceData {
  employee: any;
  salesBudget: number;
  collectionsBudget: number;
  totalSales: number;
  totalCollections: number;
  motoUnits: number;
  motoCombustion: number;
  motoElectric: number;
  salesContado: number;
  salesCredito: number;
  motosContado: number;
  motosCredito: number;
}

interface Check {
  id: string;
  beneficiaryName: string;
  concept?: string;
  checkNumber: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'DELETED';
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const { showToast, showAlert } = useNotification();

  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Check[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Interactive Analytical Chart States (Improvement #5)
  const [flujosChartType, setFlujosChartType] = useState<'area' | 'bar' | 'line'>('area');
  const [chartMonthRange, setChartMonthRange] = useState<number>(6); // 3, 6, or 12 months
  const [topDebtorsLimit, setTopDebtorsLimit] = useState<number>(5); // 5 or 10 debtors

  const [reportStartDate, setReportStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [reportEndDate, setReportEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [showCustomReportModal, setShowCustomReportModal] = useState(false);
  const [commerceData, setCommerceData] = useState<CommerceData | null>(null);
  const [allCommerceData, setAllCommerceData] = useState<CommerceData[]>([]);
  const [allSales, setAllSales] = useState<any[]>([]);
  const [allCollections, setAllCollections] = useState<any[]>([]);


  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  
  const loadDashboardData = async () => {
    if (!user) return;
    setLoading(true);
    const path = 'checks';
    const currentEnterpriseId = profile?.enterpriseId || user?.uid;
    try {
      // 1. Fetch checks - query by enterpriseId only and filter status client-side to prevent missing index errors
      const q = query(
        collection(db, path), 
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Check))
        .filter(c => ['PENDING', 'PAID'].includes(c.status));
      setChecks(data);

      // 2. Fetch Commerce Data
      const currentMonth = format(new Date(), 'yyyy-MM');
      
      const empQ = query(collection(db, 'employees'), where('enterpriseId', '==', currentEnterpriseId));
      const empSnap = await getDocs(empQ);
      const employees = empSnap.docs.map(d => ({id: d.id, ...d.data()} as any));
      
      const budgetQ = query(collection(db, 'budgets'), where('enterpriseId', '==', currentEnterpriseId));
      const budgetSnap = await getDocs(budgetQ);
      const budgets = budgetSnap.docs.map(d => d.data()).filter(b => b.month === currentMonth);

      const startOfMonthStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endOfMonthStr = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      const historyStartStr = format(subMonths(startOfMonth(new Date()), 12), 'yyyy-MM-dd');

      // Query by enterpriseId and filter historyStartStr client-side to avoid compound index requirements
      const allSalesQ = query(
        collection(db, 'sales'), 
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const allSalesSnap = await getDocs(allSalesQ);
      const allSalesData = allSalesSnap.docs
        .map(d => d.data())
        .filter(s => s.date && s.date >= historyStartStr);
      setAllSales(allSalesData);

      // Query by enterpriseId and filter historyStartStr client-side to avoid compound index requirements
      const allCollQ = query(
        collection(db, 'collections'), 
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const allCollSnap = await getDocs(allCollQ);
      const allCollsData = allCollSnap.docs
        .map(d => d.data())
        .filter(c => c.initialDate && c.initialDate >= historyStartStr);
      setAllCollections(allCollsData);

      const sales = allSalesData.filter(s => {
        if (!s.date) return false;
        const time = parseISO(s.date).getTime();
        return time >= parseISO(startOfMonthStr).getTime() && time <= parseISO(endOfMonthStr).getTime();
      });
      const colls = allCollsData.filter(c => {
        if (!c.initialDate) return false;
        const time = parseISO(c.initialDate).getTime();
        return time >= parseISO(startOfMonthStr).getTime() && time <= parseISO(endOfMonthStr).getTime();
      });


      // Calcular sumas globales para los supervisores
      const globalSalesBudget = employees.filter(e => !e.role.startsWith('supervisor')).reduce((sum, e) => sum + budgets.filter(b => b.employeeId === e.id).reduce((a, b) => a + (b.salesBudget || 0), 0), 0);
      const globalCollBudget = employees.filter(e => !e.role.startsWith('supervisor')).reduce((sum, e) => sum + budgets.filter(b => b.employeeId === e.id).reduce((a, b) => a + (b.collectionsBudget || 0), 0), 0);
      
      const globalSales = sales.filter(s => !s.isMoto).reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
      const globalSalesContado = sales.filter(s => !s.isMoto && s.type === 'contado').reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
      const globalSalesCredito = sales.filter(s => !s.isMoto && s.type === 'credito').reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
      const globalMotoUnits = sales.filter(s => s.isMoto).length;
      const globalMotoComb = sales.filter(s => s.isMoto && s.motoType === 'combustion').length;
      const globalMotoElec = sales.filter(s => s.isMoto && s.motoType === 'electrico').length;
      const globalMotosCont = sales.filter(s => s.isMoto && s.type === 'contado').length;
      const globalMotosCred = sales.filter(s => s.isMoto && s.type === 'credito').length;
      const globalMotosContVal = sales.filter(s => s.isMoto && s.type === 'contado').reduce((a, c) => a + (c.totalValue || 0), 0);
      const globalMotosCredVal = sales.filter(s => s.isMoto && s.type === 'credito').reduce((a, c) => a + (c.totalValue || 0), 0);
      
      const globalColls = colls.reduce((acc, curr) => acc + (curr.totalCollected || 0), 0);

      const commerceArray = employees.map(emp => {

        const isSupervisor = emp.role && emp.role.startsWith('supervisor');
        const canSell = emp.role === 'vendedor' || emp.role === 'ambos' || emp.role === 'supervisor_ventas' || emp.role === 'supervisor_general';
        const canCollect = emp.role === 'cobrador' || emp.role === 'ambos' || emp.role === 'supervisor_cobranza' || emp.role === 'supervisor_general';

        const empBudgets = budgets.filter(b => b.employeeId === emp.id);
        let sBudget = empBudgets.reduce((acc, curr) => acc + (curr.salesBudget || 0), 0);
        let cBudget = empBudgets.reduce((acc, curr) => acc + (curr.collectionsBudget || 0), 0);

        let totalSales = 0, salesContado = 0, salesCredito = 0;
        let motoUnits = 0, motoCombustion = 0, motoElectric = 0;
        let motosContado = 0, motosCredito = 0, motosContadoVal = 0, motosCreditoVal = 0;
        let totalCollections = 0;

        if (isSupervisor) {
          if (canSell) {
             sBudget = sBudget || globalSalesBudget;
             totalSales = globalSales;
             salesContado = globalSalesContado;
             salesCredito = globalSalesCredito;
             motoUnits = globalMotoUnits;
             motoCombustion = globalMotoComb;
             motoElectric = globalMotoElec;
             motosContado = globalMotosCont;
             motosCredito = globalMotosCred;
             motosContadoVal = globalMotosContVal;
             motosCreditoVal = globalMotosCredVal;
          }
          if (canCollect) {
             cBudget = cBudget || globalCollBudget;
             totalCollections = globalColls;
          }
        } else {
          const empSales = sales.filter(s => s.employeeId === emp.id);
          totalSales = empSales.filter(s => !s.isMoto).reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
          salesContado = empSales.filter(s => !s.isMoto && s.type === 'contado').reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
          salesCredito = empSales.filter(s => !s.isMoto && s.type === 'credito').reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
          motoUnits = empSales.filter(s => s.isMoto).length;
          motoCombustion = empSales.filter(s => s.isMoto && s.motoType === 'combustion').length;
          motoElectric = empSales.filter(s => s.isMoto && s.motoType === 'electrico').length;
          motosContado = empSales.filter(s => s.isMoto && s.type === 'contado').length;
          motosCredito = empSales.filter(s => s.isMoto && s.type === 'credito').length;
          motosContadoVal = empSales.filter(s => s.isMoto && s.type === 'contado').reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
          motosCreditoVal = empSales.filter(s => s.isMoto && s.type === 'credito').reduce((acc, curr) => acc + (curr.totalValue || 0), 0);

          const empColls = colls.filter(c => c.employeeId === emp.id);
          totalCollections = empColls.reduce((acc, curr) => acc + (curr.totalCollected || 0), 0);
        }

        return {
          employee: emp,
          salesBudget: sBudget,
          collectionsBudget: cBudget,
          totalSales,
          totalCollections,
          motoUnits,
          motoCombustion,
          motoElectric,
          salesContado,
          salesCredito,
          motosContado,
          motosCredito,
          motosContadoVal,
          motosCreditoVal,
          isSupervisor
        };
      });

      setAllCommerceData(commerceArray.filter(c => c.salesBudget > 0 || c.collectionsBudget > 0));

      const myEmp = commerceArray.find(c => c.employee.email === user.email);
      setCommerceData(myEmp || null);

    } catch (error) {
      console.error(error);
      handleFirestoreError(error as any, OperationType.LIST, path);
    } finally {
      setLoading(false);
    }
  };


  const safeFormatDate = (dateStr: string | undefined, formatStr: string = 'dd/MM/yyyy') => {
    if (!dateStr) return 'N/A';
    try {
      const parsed = parseISO(dateStr);
      if (isNaN(parsed.getTime())) return 'Fecha Inválida';
      return format(parsed, formatStr, { locale: es });
    } catch (e) {
      return 'Err';
    }
  };

  const handleConfirmPayments = async () => {
    if (!user || selectedChecks.size === 0) return;
    setLoading(true);
    try {
      const promises = Array.from(selectedChecks).map((id: string) => 
        updateDoc(doc(db, 'checks', id), {
          status: 'PAID',
          paidAt: serverTimestamp(),
          paidBy: user.email
        })
      );
      await Promise.all(promises);
      showToast(`¡Se confirmaron ${selectedChecks.size} pagos exitosamente!`, 'success');
      logAudit(AuditAction.CHECK_UPDATE, `Actualizados ${selectedChecks.size} cheques a estado PAGADO`);
      setSelectedChecks(new Set());
      await loadDashboardData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'checks');
      showToast('Error al confirmar pagos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (id: string) => {
    const newSet = new Set(selectedChecks);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedChecks(newSet);
  };

  // --- Data Processing ---
  const today = startOfDay(new Date());

  // Urgent Payments
  const urgentPayments = checks.filter(c => {
    if (c.status === 'PAID' || c.status === 'DELETED') return false;
    const date = startOfDay(parseISO(c.dueDate));
    
    // If a specific date is selected, filter by that date
    if (selectedDate) {
      return isSameDay(date, selectedDate) && c.status === 'PENDING';
    }
    
    return isBefore(date, today) || isToday(date) || isTomorrow(date);
  }).sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());

  const overdueTotal = urgentPayments.filter(c => isBefore(startOfDay(parseISO(c.dueDate)), today)).reduce((acc, c) => acc + c.amount, 0);
  const todayTotal = urgentPayments.filter(c => isToday(startOfDay(parseISO(c.dueDate)))).reduce((acc, c) => acc + c.amount, 0);
  const tomorrowTotal = urgentPayments.filter(c => isTomorrow(startOfDay(parseISO(c.dueDate)))).reduce((acc, c) => acc + c.amount, 0);

  // Top Debtors (Pending, excluding DELETED)
  const pendingByBeneficiary = checks
    .filter(c => c.status === 'PENDING')
    .reduce((acc, c) => {
      acc[c.beneficiaryName] = (acc[c.beneficiaryName] || 0) + c.amount;
      return acc;
    }, {} as Record<string, number>);
  
  const topDebtors = Object.entries(pendingByBeneficiary)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, topDebtorsLimit);

  // Monthly Projection (excluding DELETED)
  const monthlyData = [];
  const startOffset = -Math.floor(chartMonthRange / 2);
  const endOffset = chartMonthRange + startOffset - 1;
  for (let i = startOffset; i <= endOffset; i++) {
    const targetMonth = addMonths(today, i);
    const start = startOfMonth(targetMonth);
    const end = endOfMonth(targetMonth);
    const monthKey = format(targetMonth, 'MMMM   yyyy', { locale: es });
    
    const monthChecks = checks
      .filter(c => c.status !== 'DELETED')
      .filter(c => {
        const d = parseISO(c.dueDate);
        return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
      });

    const total = monthChecks.reduce((acc, c) => acc + c.amount, 0);
    const paid = monthChecks.filter(c => c.status === 'PAID').reduce((acc, c) => acc + c.amount, 0);
    const pending = total - paid;

    const monthSales = allSales.filter(s => {
      const d = parseISO(s.date);
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    });
    const ventas = monthSales.filter(s => !s.isMoto && s.type === 'contado').reduce((acc, s) => acc + (s.totalValue || 0), 0);

    const monthColls = allCollections.filter(c => {
      const d = parseISO(c.initialDate);
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    });
    const cobros = monthColls.reduce((acc, c) => acc + (c.totalCollected || 0), 0);

    if (total > 0 || ventas > 0 || cobros > 0 || i >= startOffset) {
      monthlyData.push({ month: monthKey, total, paid, pending, ventas, cobros });
    }
  }

  // --- Calendar Logic ---
  const calendarStart = startOfMonth(currentDate);
  const calendarEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const startDayOfWeek = getDay(calendarStart);
  const prefixDays = Array.from({ length: startDayOfWeek }).map((_, i) => subDays(calendarStart, startDayOfWeek - i));

  const getDayTotal = (date: Date) => {
    return checks
      .filter(c => isSameDay(parseISO(c.dueDate), date))
      .reduce((acc, c) => acc + c.amount, 0);
  };

  const getDayStatus = (date: Date) => {
    const dayChecks = checks.filter(c => isSameDay(parseISO(c.dueDate), date));
    if (dayChecks.length === 0) return 'none';
    if (dayChecks.every(c => c.status === 'PAID')) return 'paid';
    if (isBefore(startOfDay(date), today)) return 'overdue';
    return 'pending';
  };

  const generatePdfReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Headers
    doc.setFontSize(20);
    doc.text("Reporte de Visibilidad", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth / 2, 30, { align: "center" });

    doc.setFontSize(14);
    doc.text("Resumen de KPIs", 14, 45);

    // KPI tables using autotable
    autoTable(doc, {
      startY: 50,
      head: [["Estado", "Total", "Items Pendientes"]],
      body: [
        ["Total Vencido", formatCurrency(overdueTotal, settings.currency), `${urgentPayments.filter(c => isBefore(startOfDay(parseISO(c.dueDate)), today)).length} Unid.`],
        ["Cobro Hoy", formatCurrency(todayTotal, settings.currency), `${urgentPayments.filter(c => isToday(startOfDay(parseISO(c.dueDate)))).length} Unid.`],
        ["Próximos Cobros", formatCurrency(tomorrowTotal, settings.currency), `${urgentPayments.filter(c => isTomorrow(startOfDay(parseISO(c.dueDate)))).length} Unid.`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    const overdueChecks = urgentPayments.filter(c => isBefore(startOfDay(parseISO(c.dueDate)), today));
    const todayChecks = urgentPayments.filter(c => isToday(startOfDay(parseISO(c.dueDate))));
    const tomorrowChecks = urgentPayments.filter(c => isTomorrow(startOfDay(parseISO(c.dueDate))));

    let currentY = (doc as any).lastAutoTable.finalY + 15;

    // Detailed Tables
    const drawCheckTable = (title: string, data: Check[], color: [number, number, number]) => {
      if (data.length === 0) return;
      
      // Page break check
      if (currentY + 40 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(title, 14, currentY);
      
      autoTable(doc, {
        startY: currentY + 5,
        head: [["Beneficiario", "Cheque #", "Fecha", "Monto"]],
        body: data.map(c => [
          c.beneficiaryName, 
          c.checkNumber, 
          safeFormatDate(c.dueDate), 
          formatCurrency(c.amount, settings.currency)
        ]),
        theme: 'striped',
        headStyles: { fillColor: color }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    };

    drawCheckTable("DETALLE: Cheques Vencidos", overdueChecks, [220, 38, 38]); // Red
    drawCheckTable("DETALLE: Para Cobro Hoy", todayChecks, [234, 88, 12]); // Orange
    drawCheckTable("DETALLE: Próximos Pagos (Mañana)", tomorrowChecks, [79, 70, 229]); // Indigo

    // Footer Watermark and Date
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      const footerText = `REPORTE GENERADO POR SCC by Trennd | Fecha y Hora: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`;
      doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
      
      // Page number
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 20, doc.internal.pageSize.getHeight() - 10, { align: "right" });
    }

    doc.save(`Reporte_SCC_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };


const handleGenerateAdvancedReport = async (reportType: 'pdf' | 'excel') => {
    setLoading(true);
    try {
      const start = startOfDay(parseISO(reportStartDate));
      const end = startOfDay(parseISO(reportEndDate));
      const startMs = start.getTime();
      const endMs = end.getTime();
      
      const currentEnterpriseId = profile?.enterpriseId || user?.uid;

      const checksQ = query(
        collection(db, 'checks'), 
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const checksSnap = await getDocs(checksQ);
      const filteredChecks = checksSnap.docs
        .map(d => ({ id: d.id, ...d.data() }) as any)
        .filter(c => c.dueDate && c.dueDate >= reportStartDate && c.dueDate <= reportEndDate && ['PENDING', 'PAID'].includes(c.status))
        .sort((a, b) => {
           const timeA = a.dueDate ? parseISO(a.dueDate).getTime() : 0;
           const timeB = b.dueDate ? parseISO(b.dueDate).getTime() : 0;
           return timeA - timeB;
        });

      const salesQ = query(
        collection(db, 'sales'), 
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const salesSnap = await getDocs(salesQ);
      const salesData = salesSnap.docs
        .map(d => d.data())
        .filter(s => s.date && s.date >= reportStartDate && s.date <= reportEndDate);

      const collQ = query(
        collection(db, 'collections'), 
        where('enterpriseId', '==', currentEnterpriseId)
      );
      const collSnap = await getDocs(collQ);
      const collsData = collSnap.docs
        .map(d => d.data())
        .filter(c => c.initialDate && c.initialDate >= reportStartDate && c.initialDate <= reportEndDate);

      const empQ = query(collection(db, 'employees'), where('enterpriseId', '==', currentEnterpriseId));
      const empSnap = await getDocs(empQ);
      const employees = empSnap.docs.map(d => ({id: d.id, ...d.data()}));

      const startMonthStr = reportStartDate.substring(0, 7);
      const endMonthStr = reportEndDate.substring(0, 7);
      const budgetQ = query(collection(db, 'budgets'), where('enterpriseId', '==', currentEnterpriseId));
      const budgetSnap = await getDocs(budgetQ);
      const budgetsData = budgetSnap.docs
        .map(d => d.data())
        .filter(b => b.month >= startMonthStr && b.month <= endMonthStr);

      // Variables Globales
      let totalArticulosContado = 0;
      let totalArticulosCredito = 0;
      let totalMotosContadoVal = 0;
      let totalMotosCreditoVal = 0;
      let totalMotosContadoUds = 0;
      let totalMotosCreditoUds = 0;
      let totalCollections = 0;
      let globalSalesBudget = 0;
      let globalCollBudget = 0;

      const empSummary: Record<string, any> = {};
      employees.forEach((emp: any) => {
        empSummary[emp.id] = { 
          name: emp.name + ' ' + emp.lastName, 
          artContado: 0, artCredito: 0,
          motosContUds: 0, motosCredUds: 0, motosContVal: 0, motosCredVal: 0,
          collections: 0, 
          salesBudget: 0, collBudget: 0 
        };
      });

      budgetsData.forEach(b => {
        if (!empSummary[b.employeeId]) return;
        empSummary[b.employeeId].salesBudget += (b.salesBudget || 0);
        empSummary[b.employeeId].collBudget += (b.collectionsBudget || 0);
        globalSalesBudget += (b.salesBudget || 0);
        globalCollBudget += (b.collectionsBudget || 0);
      });

      salesData.forEach(s => {
        if (!empSummary[s.employeeId]) return;
        const val = s.totalValue || 0;
        if (s.isMoto) {
          if (s.type === 'contado') {
            totalMotosContadoVal += val;
            totalMotosContadoUds += 1;
            empSummary[s.employeeId].motosContVal += val;
            empSummary[s.employeeId].motosContUds += 1;
          } else {
            totalMotosCreditoVal += val;
            totalMotosCreditoUds += 1;
            empSummary[s.employeeId].motosCredVal += val;
            empSummary[s.employeeId].motosCredUds += 1;
          }
        } else {
          if (s.type === 'contado') {
            totalArticulosContado += val;
            empSummary[s.employeeId].artContado += val;
          } else {
            totalArticulosCredito += val;
            empSummary[s.employeeId].artCredito += val;
          }
        }
      });

      collsData.forEach(c => {
        if (!empSummary[c.employeeId]) return;
        const val = c.totalCollected || 0;
        totalCollections += val;
        empSummary[c.employeeId].collections += val;
      });

      // Cálculos Hoja 1 - Cuadro 1 (Flujo de Caja General)
      const totalVentasEfectivo = totalArticulosContado + totalMotosContadoVal;
      const totalIngresosEfectivoCobros = totalCollections;
      const pagosChequesRealizados = filteredChecks.filter(c => c.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0);
      const balanceFinal = totalVentasEfectivo + totalIngresosEfectivoCobros - pagosChequesRealizados;

      // Cálculos Hoja 1 - Cuadro 2 (Reporte General de Ventas)
      const totalArticulosAll = totalArticulosContado + totalArticulosCredito;
      const pctGlobalSales = globalSalesBudget > 0 ? ((totalArticulosAll / globalSalesBudget) * 100).toFixed(1) + '%' : '0%';

      if (reportType === 'pdf') {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFontSize(18);
        doc.text("Reporte Comercial Avanzado", pageWidth / 2, 20, { align: "center" });
        doc.setFontSize(11);
        doc.text(`Periodo: ${reportStartDate} a ${reportEndDate}`, pageWidth / 2, 28, { align: "center" });
        
        doc.setFontSize(14);
        doc.text("Cuadro 1: Balance General", 14, 40);
        autoTable(doc, {
          startY: 45,
          head: [["Concepto", "Monto ($)"]],
          body: [
            ["Ventas Totales en Efectivo (Motos + Artículos)", totalVentasEfectivo.toFixed(2)],
            ["Cobros Totales", totalIngresosEfectivoCobros.toFixed(2)],
            ["Pagos de Cheques Realizados", `-${pagosChequesRealizados.toFixed(2)}`],
            ["Balance Final", balanceFinal.toFixed(2)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [46, 204, 113] }
        });

        doc.text("Cuadro 2: Reporte General de Ventas", 14, (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 20,
          head: [["Concepto", "Motos (Uds)", "Monto ($)", "Presupuesto ($)", "% Cump."]],
          body: [
            ["Ventas Contado (Artículos)", "-", totalArticulosContado.toFixed(2), "-", "-"],
            ["Ventas Contado (Motos)", totalMotosContadoUds.toString(), totalMotosContadoVal.toFixed(2), "-", "-"],
            ["Ventas Crédito (Artículos)", "-", totalArticulosCredito.toFixed(2), "-", "-"],
            ["Ventas Crédito (Motos)", totalMotosCreditoUds.toString(), totalMotosCreditoVal.toFixed(2), "-", "-"],
            ["Total Ventas Artículos", "-", totalArticulosAll.toFixed(2), globalSalesBudget.toFixed(2), pctGlobalSales],
          ],
          theme: 'grid'
        });

        doc.addPage();
        doc.setFontSize(14);
        doc.text("Balance de Ventas por Vendedor", 14, 20);
        
        const empVentas = Object.values(empSummary).filter(e => e.artContado > 0 || e.artCredito > 0 || e.motosContVal > 0 || e.motosCredVal > 0 || e.salesBudget > 0).map(e => {
          const tArt = e.artContado + e.artCredito;
          const pctS = e.salesBudget > 0 ? ((tArt / e.salesBudget) * 100).toFixed(1) + '%' : '0%';
          const totalMotosUds = e.motosContUds + e.motosCredUds;
          return [
            e.name,
            totalMotosUds.toString(),
            tArt.toFixed(2),
            e.salesBudget.toFixed(2),
            pctS
          ];
        });

        autoTable(doc, {
          startY: 25,
          head: [["Vendedor", "Motos (uds)", "Total Artículos ($)", "Presupuesto ($)", "% Cump."]],
          body: empVentas,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] }
        });

        doc.text("Balance de Cobranzas por Cobrador", 14, (doc as any).lastAutoTable.finalY + 15);
        const empCobros = Object.values(empSummary).filter(e => e.collections > 0 || e.collBudget > 0).map(e => {
          const pctC = e.collBudget > 0 ? ((e.collections / e.collBudget) * 100).toFixed(1) + '%' : '0%';
          return [
            e.name,
            e.collections.toFixed(2),
            e.collBudget.toFixed(2),
            pctC
          ];
        });
        
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 20,
          head: [["Cobrador", "Total Cobrado ($)", "Presupuesto ($)", "% Cump."]],
          body: empCobros,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] }
        });

        if (filteredChecks.length > 0) {
          doc.addPage();
          doc.setFontSize(14);
          doc.text("Cheques Pagados / Pendientes", 14, 20);
          autoTable(doc, {
            startY: 25,
            head: [["Vencimiento", "Beneficiario / Concepto", "Monto ($)", "Estado"]],
            body: filteredChecks.map(c => [
              c.dueDate,
              (c.beneficiaryName || '-') + (c.concept ? ' - ' + c.concept : ''),
              c.amount.toFixed(2),
              c.status === "PAID" ? "PAGADO" : "PENDIENTE"
            ]),
            theme: 'grid'
          });
        }

        doc.save(`Reporte_Avanzado_${reportStartDate}_${reportEndDate}.pdf`);
      } else {
        // EXCEL
        const wb = XLSX.utils.book_new();
        
        const wsGlobal = XLSX.utils.aoa_to_sheet([
          ["Reporte Comercial Avanzado"],
          [`Periodo: ${reportStartDate} a ${reportEndDate}`],
          [],
          ["Cuadro 1: Balance General"],
          ["Concepto", "Monto ($)"],
          ["Ventas Totales en Efectivo (Motos + Artículos)", totalVentasEfectivo],
          ["Cobros Totales", totalIngresosEfectivoCobros],
          ["Pagos de Cheques Realizados", -pagosChequesRealizados],
          ["Balance Final", balanceFinal],
          [],
          ["Cuadro 2: Reporte General de Ventas"],
          ["Concepto", "Motos (Uds)", "Monto ($)", "Presupuesto ($)", "% Cumplimiento"],
          ["Ventas Contado (Artículos)", "", totalArticulosContado, "", ""],
          ["Ventas Contado (Motos)", totalMotosContadoUds, totalMotosContadoVal, "", ""],
          ["Ventas Crédito (Artículos)", "", totalArticulosCredito, "", ""],
          ["Ventas Crédito (Motos)", totalMotosCreditoUds, totalMotosCreditoVal, "", ""],
          ["Total Ventas Artículos", "", totalArticulosAll, globalSalesBudget, pctGlobalSales]
        ]);
        XLSX.utils.book_append_sheet(wb, wsGlobal, "Reporte General");

        const empVentasData = Object.values(empSummary).filter(e => e.artContado > 0 || e.artCredito > 0 || e.motosContVal > 0 || e.motosCredVal > 0 || e.salesBudget > 0).map(e => {
          const tArt = e.artContado + e.artCredito;
          const pctS = e.salesBudget > 0 ? (tArt / e.salesBudget) : 0;
          return {
            Vendedor: e.name,
            "Motos (uds)": e.motosContUds + e.motosCredUds,
            "Total Artículos ($)": tArt,
            "Presupuesto ($)": e.salesBudget,
            "% Cump.": pctS
          };
        });
        if (empVentasData.length > 0) {
          const wsEmpV = XLSX.utils.json_to_sheet(empVentasData);
          XLSX.utils.book_append_sheet(wb, wsEmpV, "Balance Vendedores");
        }

        const empCobrosData = Object.values(empSummary).filter(e => e.collections > 0 || e.collBudget > 0).map(e => {
          const pctC = e.collBudget > 0 ? (e.collections / e.collBudget) : 0;
          return {
            Cobrador: e.name,
            "Total Cobrado ($)": e.collections,
            "Presupuesto ($)": e.collBudget,
            "% Cump.": pctC
          };
        });
        if (empCobrosData.length > 0) {
          const wsEmpC = XLSX.utils.json_to_sheet(empCobrosData);
          XLSX.utils.book_append_sheet(wb, wsEmpC, "Balance Cobradores");
        }

        if (filteredChecks.length > 0) {
          const chkData = filteredChecks.map(c => ({
            Vencimiento: c.dueDate,
            "Beneficiario / Concepto": (c.beneficiaryName || '-') + (c.concept ? ' - ' + c.concept : ''),
            "Monto ($)": c.amount,
            Estado: c.status === "PAID" ? "PAGADO" : "PENDIENTE"
          }));
          const wsChk = XLSX.utils.json_to_sheet(chkData);
          XLSX.utils.book_append_sheet(wb, wsChk, "Cheques");
        }

        XLSX.writeFile(wb, `Reporte_Avanzado_${reportStartDate}_${reportEndDate}.xlsx`);
        await logAudit(AuditAction.SENSITIVE_READ, `Exportación de reporte avanzado a Excel. Periodo: ${reportStartDate} al ${reportEndDate}.`);
      }
      setShowCustomReportModal(false);
    } catch (e) {
      console.error(e);
      showToast('Error generando el reporte.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const generateCustomReportPdf = async (filteredChecks: Check[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.text("Reporte Personalizado de Pagos", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Periodo: ${safeFormatDate(reportStartDate)} - ${safeFormatDate(reportEndDate)}`, pageWidth / 2, 30, { align: "center" });

    if (filteredChecks.length === 0) {
      doc.setFontSize(14);
      doc.text("No hay pagos en este periodo.", pageWidth / 2, 50, { align: "center" });
    } else {
      const today = startOfDay(new Date());
      const paidChecks = filteredChecks.filter(c => c.status === 'PAID');
      const pendingChecks = filteredChecks.filter(c => c.status === 'PENDING');
      const overdueChecks = pendingChecks.filter(c => isBefore(startOfDay(parseISO(c.dueDate)), today));

      const totalAmount = filteredChecks.reduce((acc, c) => acc + c.amount, 0);
      const totalPaid = paidChecks.reduce((acc, c) => acc + c.amount, 0);
      const totalPending = pendingChecks.reduce((acc, c) => acc + c.amount, 0);
      const totalOverdue = overdueChecks.reduce((acc, c) => acc + c.amount, 0);
      
      // Resumen general
      doc.setFontSize(10);
      doc.text(`Balance General:`, 14, 45);
      doc.setFontSize(9);
      doc.text(`Total Cheques: ${filteredChecks.length} (${formatCurrency(totalAmount, settings.currency)})`, 14, 52);
      doc.text(`Pagados: ${paidChecks.length} (${formatCurrency(totalPaid, settings.currency)})`, 14, 58);
      doc.text(`Pendientes: ${pendingChecks.length} (${formatCurrency(totalPending, settings.currency)})`, 14, 64);
      doc.text(`Vencidos: ${overdueChecks.length} (${formatCurrency(totalOverdue, settings.currency)})`, 14, 70);

      autoTable(doc, {
        startY: 80,
        head: [["Beneficiario", "Cheque #", "Fecha", "Estado", "Monto"]],
        body: filteredChecks.map(c => [
          c.beneficiaryName, 
          c.checkNumber, 
           safeFormatDate(c.dueDate), 
          c.status === 'PAID' ? 'PAGADO' : (overdueChecks.includes(c) ? 'VENCIDO' : 'PENDIENTE'),
          formatCurrency(c.amount, settings.currency)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        foot: [["", "", "", "Total General:", formatCurrency(totalAmount, settings.currency)]],
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
      });
    }

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      const footerText = `REPORTE GENERADO AUTOMATICAMENTE | Fecha y Hora: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`;
      doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
    }

    doc.save(`Reporte_Personalizado_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    await logAudit(AuditAction.SENSITIVE_READ, `Exportación de reporte personalizado a PDF. Periodo: ${reportStartDate} al ${reportEndDate}.`);
  };

  if (profile?.role === 'BODEGUERO') {
    return (
      <div className="space-y-6">
        <header className="mb-4">
          <h1 className="text-3xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight uppercase italic">Dashboard de Inventario</h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Monitoreo general de bodegas y stock</p>
        </header>
        <InventoryDashboard />
      </div>
    );
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Análisis de Egresos</h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Versión v{CURRENT_VERSION} • Inteligencia Financiera</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button 
            onClick={loadDashboardData} 
            className="px-4 py-2 text-sm font-medium bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-sm"
          >
            Sincronizar
          </button>
          <button 
            onClick={() => setShowCustomReportModal(true)}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            Generar Reporte
          </button>
        </div>
      </header>

      {/* KPI Section */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-2">
            <div className="p-1.5 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Prioridad</span>
          </div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Total Vencido</p>
          <p className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mt-0.5">{formatCurrency(overdueTotal, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-2">
            <div className="p-1.5 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
              <Bell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded">Hoy</span>
          </div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Para Cobro Hoy</p>
          <p className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mt-0.5">{formatCurrency(todayTotal, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-2">
            <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">Mañana</span>
          </div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Próximos Cobros</p>
          <p className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mt-0.5">{formatCurrency(tomorrowTotal, settings.currency)}</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-2">
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
              <DollarSign className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded text-right">General</span>
          </div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Checks Pen.</p>
          <p className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mt-0.5">{checks.filter(c => c.status === 'PENDING').length} Unidades</p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Charts Section */}
        <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h3 className="text-sm font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" /> Tendencia de Flujos
              </h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Month Range Select */}
                <select
                  value={chartMonthRange}
                  onChange={(e) => setChartMonthRange(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs font-black bg-neutral-50 dark:bg-neutral-800 border border-neutral-250 dark:border-neutral-750 rounded-xl outline-none text-neutral-600 dark:text-neutral-300"
                >
                  <option value={3}>A 3 meses</option>
                  <option value={6}>A 6 meses</option>
                  <option value={12}>A 12 meses</option>
                </select>
                {/* Chart Type Toggles */}
                <div className="flex border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden text-xs">
                  {(['area', 'bar', 'line'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFlujosChartType(type)}
                      className={cn(
                        "px-2.5 py-1.5 font-bold transition-all capitalize",
                        flujosChartType === type
                          ? "bg-indigo-600 text-white font-black"
                          : "bg-white dark:bg-neutral-900 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                      )}
                    >
                      {type === 'area' ? 'Área' : type === 'bar' ? 'Bar' : 'Línea'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {flujosChartType === 'area' ? (
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" className="dark:stroke-neutral-800" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#9ca3af'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#9ca3af'}} tickFormatter={(val) => formatCurrency(val, settings.currency)} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                      itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}
                      formatter={(value: any) => [formatCurrency(value, settings.currency), 'Total']}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Area name="Gastos (Cheques)" type="monotone" dataKey="total" stroke="#ef4444" fillOpacity={0} strokeWidth={2} />
                    <Area name="Ventas Contado (Almacén)" type="monotone" dataKey="ventas" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} />
                    <Area name="Cobros Realizados" type="monotone" dataKey="cobros" stroke="#10b981" fillOpacity={0} strokeWidth={2} />
                  </AreaChart>
                ) : flujosChartType === 'bar' ? (
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" className="dark:stroke-neutral-800" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#9ca3af'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#9ca3af'}} tickFormatter={(val) => formatCurrency(val, settings.currency)} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                      itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}
                      formatter={(value: any) => [formatCurrency(value, settings.currency), '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar name="Ventas Contado (Almacén)" dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar name="Cobros Realizados" dataKey="cobros" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar name="Gastos (Cheques)" dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" className="dark:stroke-neutral-800" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#9ca3af'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#9ca3af'}} tickFormatter={(val) => formatCurrency(val, settings.currency)} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                      itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}
                      formatter={(value: any) => [formatCurrency(value, settings.currency), '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Line name="Ventas Contado (Almacén)" type="monotone" dataKey="ventas" stroke="#3b82f6" strokeWidth={2} activeDot={{ r: 6 }} />
                    <Line name="Cobros Realizados" type="monotone" dataKey="cobros" stroke="#10b981" strokeWidth={2} activeDot={{ r: 6 }} />
                    <Line name="Gastos (Cheques)" type="monotone" dataKey="total" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 6 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-500" /> Distribución de Egresos
              </h3>
              <select
                value={topDebtorsLimit}
                onChange={(e) => setTopDebtorsLimit(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs font-black bg-neutral-50 dark:bg-neutral-800 border border-neutral-150 dark:border-neutral-750 rounded-xl outline-none text-neutral-600 dark:text-neutral-300"
              >
                <option value={5}>Top 5 Destinos</option>
                <option value={10}>Top 10 Destinos</option>
              </select>
            </div>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={topDebtors.map(([name, value]) => ({ name, value }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {topDebtors.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#3b82f6', '#14b8a6'][index % 10]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value, settings.currency)} />
                </RePieChart>
              </ResponsiveContainer>
              <div className="hidden sm:block space-y-1.5 pr-4 max-h-60 overflow-y-auto">
                {topDebtors.map(([name, value], i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#3b82f6', '#14b8a6'][i % 10] }} />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase truncate w-24" title={`${name}: ${formatCurrency(value as number, settings.currency)}`}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Calendar View */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Calendario de Pagos</h2>
                <p className="text-xl font-bold text-neutral-900 dark:text-neutral-50 capitalize">
                  {format(currentDate, 'MMMM yyyy', { locale: es })}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition-colors">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">Hoy</button>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition-colors">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                <div key={day} className="py-2 text-center text-[10px] font-bold text-neutral-400 uppercase border-r border-neutral-100 dark:border-neutral-800 last:border-0">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-fr">
              {prefixDays.map((date, idx) => (
                <div key={`prefix-${idx}`} className="h-24 p-2 bg-neutral-50/50 dark:bg-neutral-950/20 border-r border-b border-neutral-100 dark:border-neutral-800 last:border-r-0 text-neutral-300 dark:text-neutral-700 text-xs">
                  {format(date, 'd')}
                </div>
              ))}
              {days.map((date) => {
                const total = getDayTotal(date);
                const status = getDayStatus(date);
                const isCurrentToday = isToday(date);
                
                return (
                  <div 
                    key={date.toString()} 
                    onClick={() => {
                      if (selectedDate && isSameDay(selectedDate, date)) {
                        setSelectedDate(null);
                      } else {
                        setSelectedDate(date);
                      }
                    }}
                    className={cn(
                      "relative h-24 p-2 border-r border-b border-neutral-100 dark:border-neutral-800 last:border-r-0 transition-all hover:bg-neutral-50/50 dark:hover:bg-indigo-900/10 group cursor-pointer",
                      isCurrentToday && "bg-indigo-50/30 dark:bg-indigo-900/10",
                      selectedDate && isSameDay(date, selectedDate) && "bg-indigo-600/10 dark:bg-indigo-600/20 ring-2 ring-inset ring-indigo-500"
                    )}
                  >
                    <div className={cn(
                      "text-sm font-medium flex items-center justify-center h-7 w-7 rounded-full",
                      isCurrentToday ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" : 
                      selectedDate && isSameDay(date, selectedDate) ? "bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-400" :
                      "text-neutral-600 dark:text-neutral-400"
                    )}>
                      {format(date, 'd')}
                    </div>
                    {total > 0 && (
                      <div className="mt-2 text-center">
                        <div className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold max-w-full truncate",
                          status === 'paid' && "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
                          status === 'pending' && "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
                          status === 'overdue' && "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        )}>
                          {formatCurrency(total, settings.currency)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Urgent Payments Table */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">
                  {selectedDate ? `Cheques para el ${format(selectedDate, 'dd/MM/yyyy')}` : 'Operativa de Pagos'}
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedDate ? 'Filtrado por fecha seleccionada' : 'Visualización de cheques de alta prioridad'}
                </p>
              </div>
              <button
                onClick={handleConfirmPayments}
                disabled={selectedChecks.size === 0}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 transform active:scale-95 shadow-lg",
                  selectedChecks.size > 0 
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none" 
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed shadow-none"
                )}
              >
                PAGAR SELECCIONADOS ({selectedChecks.size})
              </button>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
              {urgentPayments.length === 0 ? (
                <div className="p-16 text-center text-neutral-400 border-dashed border-2 border-neutral-50 dark:border-neutral-800 m-6 rounded-2xl">
                  <CheckCircle2 className="mx-auto h-16 w-16 text-indigo-100 dark:text-indigo-900/50 mb-4" />
                  <p className="text-lg font-medium">Bandeja despejada</p>
                  <p className="text-sm">No hay pagos pendientes para hoy o vencidos.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-neutral-100 dark:divide-neutral-800">
                  <thead className="bg-white dark:bg-neutral-900">
                    <tr>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Indicador</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Beneficiario</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Fecha</th>
                      <th className="px-6 py-4 text-right text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Monto</th>
                      <th className="px-6 py-4 text-center text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Selección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                    {urgentPayments.map((check) => {
                      const date = startOfDay(parseISO(check.dueDate));
                      let statusNode = null;
                      if (isBefore(date, today)) {
                        statusNode = <span className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded-md text-[10px] font-bold">VENCIDO</span>;
                      } else if (isToday(date)) {
                        statusNode = <span className="bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-1 rounded-md text-[10px] font-bold">HOY</span>;
                      } else {
                        statusNode = <span className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-md text-[10px] font-bold">DIARIO</span>;
                      }

                      return (
                        <tr key={check.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">{statusNode}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{check.beneficiaryName}</p>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-500 font-mono">CHQ#{check.checkNumber}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">{safeFormatDate(check.dueDate)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {formatCurrency(check.amount, settings.currency)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <input
                              type="checkbox"
                              className="h-6 w-6 rounded-lg border-neutral-300 dark:border-neutral-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer transition-all hover:scale-110"
                              checked={selectedChecks.has(check.id)}
                              onChange={() => toggleCheck(check.id)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar widgets */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Top Debts Card */}
          <div className="bg-indigo-600 dark:bg-indigo-500 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 dark:shadow-none">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Top Beneficiarios</h2>
              <ArrowUpRight className="h-5 w-5 opacity-60" />
            </div>
            <div className="space-y-4">
              {topDebtors.map(([name, amount], idx) => (
                <div key={name} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold bg-indigo-500 dark:bg-indigo-400 h-6 w-6 flex items-center justify-center rounded-lg">{idx + 1}</span>
                    <span className="text-sm font-medium opacity-90 truncate max-w-[140px]">{name}</span>
                  </div>
                  <span className="text-sm font-bold">{formatCurrency(amount as number, settings.currency)}</span>
                </div>
              ))}
              {topDebtors.length === 0 && <p className="text-sm opacity-60 italic py-4">Sin registro de deudas.</p>}
            </div>
          </div>

          {/* Monthly Projection */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden p-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-6">Proyección de Gastos</h2>
            <div className="space-y-6">
              {monthlyData.map((row) => (
                <div key={row.month} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    <span>{row.month}</span>
                    <span>{formatCurrency(row.total, settings.currency)}</span>
                  </div>
                  <div className="h-3 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${(row.paid / row.total) * 100}%` }}
                    />
                    <div 
                      className="h-full bg-indigo-500 opacity-60 transition-all duration-1000"
                      style={{ width: `${(row.pending / row.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-emerald-500">Pagado: {formatCurrency(row.paid, settings.currency)}</span>
                    <span className="text-indigo-500">Pendiente: {formatCurrency(row.pending, settings.currency)}</span>
                  </div>
                </div>
              ))}
              {monthlyData.length === 0 && (
                <div className="text-center py-6 text-neutral-400 text-sm">
                  Sin proyecciones disponibles
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
              <button 
                onClick={() => setShowCustomReportModal(true)}
                className="w-full py-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-sm border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
              >
                Crear Reporte Personalizado
              </button>
            </div>
          </div>

        </div>
      </div>

      {showCustomReportModal && (
        <div className="fixed inset-0 z-[1000] bg-neutral-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 bg-indigo-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">Reporte Personalizado</h3>
              <button onClick={() => setShowCustomReportModal(false)} className="opacity-80 hover:opacity-100 transition-opacity text-xl font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-neutral-500">Fecha Inicial</label>
                  <input 
                    type="date" 
                    value={reportStartDate} 
                    onChange={e => setReportStartDate(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 p-3 rounded-xl border-none outline-none dark:text-neutral-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-neutral-500">Fecha Final (Corte)</label>
                  <input 
                    type="date" 
                    value={reportEndDate} 
                    onChange={e => setReportEndDate(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 p-3 rounded-xl border-none outline-none dark:text-neutral-100"
                  />
                </div>
              </div>
              
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                Se filtrarán todos los pagos registrados dentro de las fechas seleccionadas, incluyendo pagos pendientes y confirmados.
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => handleGenerateAdvancedReport('pdf')}
                  className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  Descargar PDF
                </button>
                <button 
                  onClick={() => handleGenerateAdvancedReport('excel')}
                  className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg hover:bg-emerald-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  Descargar Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


{/* Commerce Section */}
      <section className="space-y-6 pt-8 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight flex items-center gap-2">
              <Store className="w-6 h-6 text-indigo-500" />
              Rendimiento Comercial (Mes Actual)
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">Progreso de ventas y cobranzas vs presupuestos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {allCommerceData.map((data, idx) => (
            <CommerceCard key={idx} data={data} />
          ))}
        </div>
      </section>

    </div>
  );


}
function CommerceCard({ data }: { data: any; key?: any }) {
  const salesPct = data.salesBudget > 0 ? (data.totalSales / data.salesBudget) * 100 : 0;
  const collPct = data.collectionsBudget > 0 ? (data.totalCollections / data.collectionsBudget) * 100 : 0;
  
  const canSell = data.employee.role === 'vendedor' || data.employee.role === 'ambos' || data.employee.role === 'supervisor_ventas' || data.employee.role === 'supervisor_general';
  const canCollect = data.employee.role === 'cobrador' || data.employee.role === 'ambos' || data.employee.role === 'supervisor_cobranza' || data.employee.role === 'supervisor_general';
  
  const isSupervisor = data.isSupervisor;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <User className="w-5 h-5 text-neutral-400" />
          {data.employee.name} {data.employee.lastName}
          <span className={"ml-2 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full " + (isSupervisor ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500")}>
            {isSupervisor ? "Supervisor: " : ""}{data.employee.role.replace('supervisor_', '')}
          </span>
        </h3>
      </div>
      <div className="space-y-6">
        {canSell && (
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ventas Netas</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    ${data.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm text-neutral-500">/ ${data.salesBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${salesPct >= 100 ? 'text-emerald-500' : 'text-neutral-900 dark:text-white'}`}>
                  {salesPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${salesPct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                style={{ width: `${Math.min(salesPct, 100)}%` }} 
              />
            </div>
            
            <div className="pt-3 grid grid-cols-2 gap-4 text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border border-neutral-100 dark:border-neutral-800 mt-2 animate-in fade-in slide-in-from-top-2">
              <div>
                <p className="font-semibold text-neutral-500 uppercase">Artículos Netos</p>
                <ul className="mt-1 space-y-0.5">
                  <li>Contado: ${(data.salesContado || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</li>
                  <li>Crédito: ${(data.salesCredito || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-neutral-500 uppercase flex items-center gap-1"><Bike className="w-3 h-3"/> Motos ({data.motoUnits} uds)</p>
                <ul className="mt-1 space-y-0.5">
                  <li>Contado ({data.motosContado}): ${(data.motosContadoVal || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</li>
                  <li>Crédito ({data.motosCredito}): ${(data.motosCreditoVal || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</li>
                  <li>Total: <span className="font-bold text-neutral-900 dark:text-white">${((data.motosContadoVal || 0) + (data.motosCreditoVal || 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {canCollect && (
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cobranzas</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    ${data.totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm text-neutral-500">/ ${data.collectionsBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${collPct >= 100 ? 'text-emerald-500' : 'text-neutral-900 dark:text-white'}`}>
                  {collPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${collPct >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'}`} 
                style={{ width: `${Math.min(collPct, 100)}%` }} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
