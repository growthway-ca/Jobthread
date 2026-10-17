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
import { Proposal } from './pages/Proposal';
import { ClientProject } from './pages/ClientProject';
import { ShareJob } from './pages/ShareJob';
import { Today } from './pages/Today';
import { Grow } from './pages/Grow';
import { Referral } from './pages/Referral';
import { SiteInfo } from './pages/SiteInfo';
import { JobSheetPage } from './pages/JobSheetPage';
import { Subs } from './pages/Subs';
import { BeforeAfter } from './pages/BeforeAfter';
import { Settings } from './pages/Settings';
import { EditJob } from './pages/EditJob';
import { NewDailyLog } from './pages/NewDailyLog';
import { Money } from './pages/Money';
import { Quotes } from './pages/Quotes';
import { QuoteEdit } from './pages/QuoteEdit';
import { QuoteDetail } from './pages/QuoteDetail';

export function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: clients never sign in. */}
        <Route path="/a/:token" element={<Approve />} />
        <Route path="/p/:token" element={<Proposal />} />
        <Route path="/j/:token" element={<ClientProject />} />
        <Route path="/r/:token" element={<Referral />} />
        <Route path="/s/:token" element={<JobSheetPage />} />
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
      <Route path="/" element={<Today />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/grow" element={<Grow />} />
      <Route path="/jobs/new" element={<NewJob />} />
      <Route path="/jobs/:jobId" element={<JobThread />} />
      <Route path="/jobs/:jobId/changes/new" element={<NewChange />} />
      <Route path="/jobs/:jobId/edit" element={<EditJob />} />
      <Route path="/jobs/:jobId/share" element={<ShareJob />} />
      <Route path="/jobs/:jobId/site" element={<SiteInfo />} />
      <Route path="/jobs/:jobId/post" element={<BeforeAfter />} />
      <Route path="/jobs/:jobId/log/new" element={<NewDailyLog />} />
      <Route path="/quotes" element={<Quotes />} />
      <Route path="/quotes/new" element={<QuoteEdit />} />
      <Route path="/quotes/:quoteId" element={<QuoteDetail />} />
      <Route path="/quotes/:quoteId/edit" element={<QuoteEdit />} />
      <Route path="/money" element={<Money />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/subs" element={<Subs />} />
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
