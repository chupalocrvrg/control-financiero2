import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ArticlesTab from '../components/inventory/ArticlesTab';
import WarehousesTab from '../components/inventory/WarehousesTab';
import TransfersTab from '../components/inventory/TransfersTab';
import LoansReturnsTab from '../components/inventory/LoansReturnsTab';
import SalesTab from '../components/inventory/SalesTab';

export default function Inventory() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Inventario</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Gestión de artículos, bodegas y transferencias.</p>
      </div>
      <Routes>
        <Route path="/" element={<Navigate to="articles" replace />} />
        <Route path="articles" element={<ArticlesTab />} />
        <Route path="warehouses" element={<WarehousesTab />} />
        <Route path="transfers" element={<TransfersTab />} />
        <Route path="loans-returns" element={<LoansReturnsTab />} />
        <Route path="sales" element={<SalesTab />} />
      </Routes>
    </div>
  );
}
