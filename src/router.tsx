import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { hasPermission } from './api/types';
import { LoginPage } from './components/LoginPage';
import { RequireSession } from './components/auth';
import { Shell, type NavItem } from './components/Shell';
import { AlertsPage } from './pages/AlertsPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { OnboardingQueuePage } from './pages/OnboardingQueuePage';

const NAV: NavItem[] = [
  { section: 'Onboarding' },
  { to: '/onboarding', icon: 'inbox', label: 'Onboarding Queue' },
  { to: '/facilities', icon: 'grid', label: 'Facility Directory' },
  { section: 'Oversight' },
  { to: '/alerts', icon: 'bell', label: 'Alerts' },
];

function Console() {
  return (
    <RequireSession allow={(s) => hasPermission(s, 'platform.admin')}>
      <Shell consoleName="Platform Admin" nav={NAV}>
        <Outlet />
      </Shell>
    </RequireSession>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <LoginPage
        consoleName="Platform Admin console"
        intro="For Emergency Tracka platform administrators. We'll send a one-time code to your email."
        fixedFacilityCode="PLATFORM"
      />
    ),
  },
  {
    path: '/',
    element: <Console />,
    children: [
      { index: true, element: <Navigate to="/onboarding" replace /> },
      { path: 'onboarding', element: <OnboardingQueuePage /> },
      { path: 'facilities', element: <DirectoryPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: '*', element: <Navigate to="/onboarding" replace /> },
    ],
  },
],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
