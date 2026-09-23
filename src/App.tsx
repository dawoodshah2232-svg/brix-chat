import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import { MarketingLayout } from './components/marketing';
import AuthGuard from './auth/AuthGuard';
import Landing from './pages/Landing';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import Signup from './pages/Signup';
import Login from './pages/Login';
import WidgetPage from './widget/WidgetPage';
import AppShell from './app/AppShell';
import Inbox from './app/Inbox';
import Visitors from './app/Visitors';
import Contacts from './app/Contacts';
import Analytics from './app/Analytics';
import KnowledgeBase from './app/KnowledgeBase';
import Canned from './app/Canned';
import Triggers from './app/Triggers';
import Campaigns from './app/Campaigns';
import Settings from './app/Settings';

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-ink-950 text-white px-6">
      <div className="text-center">
        <div className="font-display text-6xl font-extrabold">404</div>
        <p className="mt-2 text-slate-400">That page drifted off. Let’s get you back.</p>
        <a href={`${import.meta.env.BASE_URL}`} className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-brix-600 font-semibold text-sm hover:bg-brix-700">Go home</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter basename="/brix-chat">
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route index element={<Landing />} />
            <Route path="features" element={<Features />} />
            <Route path="pricing" element={<Pricing />} />
          </Route>
          <Route path="signup" element={<Signup />} />
          <Route path="login" element={<Login />} />
          <Route path="widget" element={<WidgetPage />} />
          <Route path="app" element={<AuthGuard><AppShell /></AuthGuard>}>
            <Route index element={<Inbox />} />
            <Route path="visitors" element={<Visitors />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="canned" element={<Canned />} />
            <Route path="triggers" element={<Triggers />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
