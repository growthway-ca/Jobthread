import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { Header, Loading } from './components/Layout';
import { SignIn } from './pages/SignIn';
import { Profile } from './pages/Profile';
import { Jobs } from './pages/Jobs';
import { NewJob } from './pages/NewJob';
import { JobThread } from './pages/JobThread';
import { NewChange } from './pages/NewChange';
import { Approve } from './pages/Approve';

export function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: clients never sign in. */}
        <Route path="/a/:token" element={<Approve />} />
        <Route
          path="/*"
          element={
            <AuthProvider>
              <ContractorApp />
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function ContractorApp() {
  const { loading, session, contractor } = useAuth();
  if (loading) {
    return (
      <>
        <Header linkHome={false} />
        <Loading />
      </>
    );
  }
  if (!session) return <SignIn />;
  if (!contractor) return <Profile />;
  return (
    <Routes>
      <Route path="/" element={<Jobs />} />
      <Route path="/jobs/new" element={<NewJob />} />
      <Route path="/jobs/:jobId" element={<JobThread />} />
      <Route path="/jobs/:jobId/changes/new" element={<NewChange />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function NotConfigured() {
  return (
    <>
      <Header linkHome={false} />
      <main className="page narrow">
        <h1>Almost there</h1>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>),
          then restart.
        </p>
      </main>
    </>
  );
}
