import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import './i18n';
import { AuthProvider } from './auth';
import { OrgProvider } from './org';
import { AppLayout, RequireAdmin } from './AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import ActivitiesPage from './pages/ActivitiesPage';
import ScanPage from './pages/ScanPage';
import UsersPage from './pages/UsersPage';
import ParametersPage from './pages/ParametersPage';
import SignupOnboardingPage from './pages/SignupOnboardingPage';
import OrgSettingsPage from './pages/OrgSettingsPage';
import OrgMembersPage from './pages/OrgMembersPage';
import OrgInvitationsPage from './pages/OrgInvitationsPage';
import ProfilePage from './pages/ProfilePage';
import { CookieBanner } from './components/CookieBanner';
import { installQueueFlushHandler } from './scanQueue';

installQueueFlushHandler();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <OrgProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/onboarding" element={<SignupOnboardingPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<ScanPage />} />
              <Route path="dashboard" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
              <Route path="parameters" element={<ParametersPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="org/settings" element={<RequireAdmin><OrgSettingsPage /></RequireAdmin>} />
              <Route path="org/members" element={<RequireAdmin><OrgMembersPage /></RequireAdmin>} />
              <Route path="org/invitations" element={<RequireAdmin><OrgInvitationsPage /></RequireAdmin>} />
            </Route>
          </Routes>
          <CookieBanner />
        </BrowserRouter>
      </OrgProvider>
    </AuthProvider>
  </StrictMode>,
);
