import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import './i18n';
import { AuthProvider } from './auth';
import { AppLayout, RequireAdmin } from './AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ActivitiesPage from './pages/ActivitiesPage';
import ScanPage from './pages/ScanPage';
import UsersPage from './pages/UsersPage';
import { installQueueFlushHandler } from './scanQueue';

installQueueFlushHandler();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<ScanPage />} />
            <Route path="dashboard" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
