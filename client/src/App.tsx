import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { NotificationProvider } from './context/NotificationContext';
import { MorphBarProvider } from './context/MorphBarContext';

import { MorphBar } from './components/morphbar/MorphBar';
import { AppLayout } from './components/layout/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { TasksPage } from './pages/TasksPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { GitHubHubPage } from './pages/GitHubHubPage';
import { ActivityPage } from './pages/ActivityPage';
import { JournalPage } from './pages/JournalPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-eink-bg text-eink-text flex flex-col items-center justify-center font-technical text-xs space-y-2 select-none">
        <div className="w-2.5 h-2.5 rounded-full bg-eink-text animate-pulse" />
        <span className="font-bold tracking-widest text-xs uppercase">SHIORI</span>
        <span className="text-[10px] text-eink-textMuted">Checking session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-eink-bg text-eink-text flex flex-col items-center justify-center font-technical text-xs space-y-2 select-none">
        <div className="w-2.5 h-2.5 rounded-full bg-eink-text animate-pulse" />
        <span className="font-bold tracking-widest text-xs uppercase">SHIORI</span>
        <span className="text-[10px] text-eink-textMuted">Checking session...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    if (!user?.github_connected) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <NotificationProvider>
          <MorphBarProvider>
            <BrowserRouter>
              {/* Universal Floating Dynamic Island Navigation across entire website */}
              <MorphBar />

              <Routes>
                {/* Landing & Welcome Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/welcome" element={<LandingPage />} />
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <LoginPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <PublicOnlyRoute>
                      <RegisterPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <OnboardingPage />
                    </ProtectedRoute>
                  }
                />

                {/* Workspace Protected Routes with AppLayout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/home" element={<DashboardPage />} />
                  <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/todos" element={<TasksPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/repositories" element={<RepositoriesPage />} />
                  <Route path="/projects" element={<Navigate to="/home" replace />} />
                  <Route path="/workspaces" element={<WorkspacesPage />} />
                  <Route path="/connections" element={<ConnectionsPage />} />
                  <Route path="/friends" element={<Navigate to="/connections" replace />} />
                  <Route path="/github" element={<GitHubHubPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/journal" element={<JournalPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                {/* Fallback to Home */}
                <Route path="*" element={<Navigate to="/home" replace />} />
              </Routes>
            </BrowserRouter>
          </MorphBarProvider>
        </NotificationProvider>
      </SocketProvider>
    </AuthProvider>
  );
};
