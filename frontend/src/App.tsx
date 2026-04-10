import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import AppLayout from '@cloudscape-design/components/app-layout';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Box from '@cloudscape-design/components/box';
import Navigation from './components/Navigation';
import DashboardPage from './pages/DashboardPage';
import AgentsListPage from './pages/AgentsListPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AgentsPage from './pages/AgentsPage';
import ChatPage from './pages/ChatPage';
import EvaluationsPage from './pages/EvaluationsPage';
import GatewaysPage from './pages/GatewaysPage';
import MemoryPage from './pages/MemoryPage';
import PoliciesPage from './pages/PoliciesPage';

interface AuthUser {
  email: string;
}

function AppContent() {
  const isLocalDev = (import.meta as any).env.VITE_LOCAL_DEV === 'true';
  const navigate = useNavigate();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [AuthModalComponent, setAuthModalComponent] = useState<any>(null);

  useEffect(() => {
    if (isLocalDev) {
      setCheckingAuth(false);
      setUser({ email: 'local-dev@example.com' });
    } else {
      checkAuth();
    }
  }, [isLocalDev]);

  useEffect(() => {
    if (!isLocalDev && showAuthModal && !AuthModalComponent) {
      import('./AuthModal').then((module) => {
        setAuthModalComponent(() => module.default);
      });
    }
  }, [showAuthModal, AuthModalComponent, isLocalDev]);

  const checkAuth = async () => {
    if (isLocalDev) return;
    try {
      const { getCurrentUser } = await import('./auth');
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleSignOut = async () => {
    if (isLocalDev) return;
    try {
      const { signOut } = await import('./auth');
      signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
    setUser(null);
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    await checkAuth();
  };

  if (checkingAuth) {
    return (
      <>
        <TopNavigation
          identity={{ href: '#', title: 'AgentCore Operations' }}
          utilities={[]}
          i18nStrings={{ overflowMenuTriggerText: 'More', overflowMenuTitleText: 'All' }}
        />
        <AppLayout
          navigationHide={true}
          toolsHide={true}
          content={
            <ContentLayout defaultPadding>
              <Box textAlign="center" padding="xxl">
                Loading...
              </Box>
            </ContentLayout>
          }
        />
      </>
    );
  }

  return (
    <>
      {!isLocalDev && AuthModalComponent && (
        <AuthModalComponent
          visible={showAuthModal}
          onDismiss={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
      <TopNavigation
        identity={{
          href: '/',
          title: isLocalDev
            ? 'AgentCore Operations (Local Dev)'
            : 'AgentCore Operations Dashboard',
          onFollow: (e: Event) => {
            e.preventDefault();
            navigate('/');
          },
        }}
        utilities={
          isLocalDev
            ? [{ type: 'button' as const, text: 'Local Development', iconName: 'settings' as const }]
            : [
                {
                  type: 'button' as const,
                  text: user ? `${user.email} | Sign Out` : 'Sign In',
                  iconName: user ? ('user-profile' as const) : ('lock-private' as const),
                  onClick: () => {
                    if (user) {
                      handleSignOut();
                    } else {
                      setShowAuthModal(true);
                    }
                  },
                },
              ]
        }
        i18nStrings={{ overflowMenuTriggerText: 'More', overflowMenuTitleText: 'All' }}
      />
      <AppLayout
        navigation={<Navigation />}
        toolsHide={true}
        contentType="default"
        content={
          <ContentLayout defaultPadding>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/agents/list" element={<AgentsPage />} />
              <Route path="/agents/:agentId" element={<AgentDetailPage />} />
              <Route path="/builder" element={<AgentsListPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/evaluations" element={<EvaluationsPage />} />
              <Route path="/gateways" element={<GatewaysPage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
            </Routes>
          </ContentLayout>
        }
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
