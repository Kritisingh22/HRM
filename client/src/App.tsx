/* ============================================================
   App — the provider stack and the router.

   Order matters:
     Theme  → toggles `body.theme-light` for every screen, login included
     Toast  → the feedback channel each page writes to
     App    → the HRM dataset, persisted to localStorage
     Router → HashRouter keeps deep links working on static hosts
     Auth   → session state; its Login screen uses router hooks,
              so it must sit inside the router
   ============================================================ */
import { HashRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppProvider } from '@/store/AppContext';
import { AppRoutes } from '@/routes';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          <HashRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </HashRouter>
          <Toaster />
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
