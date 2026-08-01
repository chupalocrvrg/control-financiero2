import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminUsers from './AdminUsers';
import AdminNotifications from './AdminNotifications';

export default function AdminPanel() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Panel de Administración</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Gestión de usuarios y sistema.</p>
      </div>
      <Routes>
        <Route path="/" element={<Navigate to="users" replace />} />
        <Route path="users" element={<AdminUsers mode="USERS" />} />
        <Route path="migration" element={<AdminUsers mode="ENTITIES" />} />
        <Route path="versions" element={<AdminUsers mode="HISTORY" />} />
        <Route path="audit" element={<AdminUsers mode="AUDIT" />} />
        <Route path="trash" element={<AdminUsers mode="TRASH" />} />
        <Route path="notifications" element={<AdminNotifications />} />
      </Routes>
    </div>
  );
}
