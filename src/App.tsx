import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import { MarketingLayout } from './components/marketing';
import AuthGuard from './auth/AuthGuard';
import OwnerGuard from './auth/OwnerGuard';
import Landing from './pages/Landing';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import RoiCalculator from './pages/RoiCalculator';
import Compare from './pages/Compare';
import Changelog from './pages/Changelog';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Help from './pages/Help';
import HelpArticle from './pages/HelpArticle';
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Security from './pages/Security';
import Status from './pages/Status';
import SitemapPage from './pages/SitemapPage';
import PropertyKb from './pages/PropertyKb';
import WidgetPage from './widget/WidgetPage';
import AppShell from './app/AppShell';
import Welcome from './app/Welcome';
import Inbox from './app/Inbox';
import Visitors from './app/Visitors';
import Contacts from './app/Contacts';
import Analytics from './app/Analytics';
import KnowledgeBase from './app/KnowledgeBase';
import Canned from './app/Canned';
import Triggers from './app/Triggers';
import Flows from './app/Flows';
import Campaigns from './app/Campaigns';
import Tickets from './app/Tickets';
import Settings from './app/Settings';
import Admin from './app/Admin';
import Properties from './app/Properties';
import Branding from './app/Branding';
import Install from './app/Install';
import Team from './app/Team';
import Departments from './app/Departments';
import Categories from './app/Categories';
import Developers from './app/Developers';
import Schedules from './app/Schedules';
import Ratings from './app/Ratings';
import Quality from './app/Quality';
// Worker A creates src/app/Feedback.tsx; the ./app/Feedback path below is
// correct from src/App.tsx (the "../app/Feedback" in the work order assumed a pages/ file).
import Feedback from './app/Feedback';
// Widget extras / customer ticket portal / CSV importer (one self-contained piece).
import TicketPortal from './pages/TicketPortal';
import Import from './app/Import';

/**
 * Title-only SEO for app routes. Worker B must not edit Worker A's app
 * screens, so titles are applied here at the route level.
 */
function Titled({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} — Brix Chat`;
  }, [title]);
  return <>{children}</>;
}

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
            <Route index element={<Titled title="Live chat software for modern teams"><Landing /></Titled>} />
            <Route path="features" element={<Titled title="Features"><Features /></Titled>} />
            <Route path="pricing" element={<Titled title="Pricing"><Pricing /></Titled>} />
            <Route path="roi" element={<Titled title="ROI calculator"><RoiCalculator /></Titled>} />
            <Route path="compare" element={<Titled title="Why teams move on from traditional live chat"><Compare /></Titled>} />
            <Route path="changelog" element={<Titled title="Changelog"><Changelog /></Titled>} />
            <Route path="blog" element={<Titled title="Blog"><Blog /></Titled>} />
            <Route path="blog/:slug" element={<Titled title="Blog"><BlogPost /></Titled>} />
            <Route path="help" element={<Titled title="Help center"><Help /></Titled>} />
            <Route path="help/:slug" element={<Titled title="Help center"><HelpArticle /></Titled>} />
            <Route path="about" element={<Titled title="About"><About /></Titled>} />
            <Route path="contact" element={<Titled title="Contact"><Contact /></Titled>} />
            <Route path="privacy" element={<Titled title="Privacy policy"><Privacy /></Titled>} />
            <Route path="terms" element={<Titled title="Terms of service"><Terms /></Titled>} />
            <Route path="security" element={<Titled title="Security"><Security /></Titled>} />
            <Route path="status" element={<Titled title="Status"><Status /></Titled>} />
            <Route path="sitemap" element={<Titled title="Sitemap"><SitemapPage /></Titled>} />
            <Route path="support" element={<Titled title="Track support ticket"><TicketPortal /></Titled>} />
          </Route>
          <Route path="signup" element={<Titled title="Create workspace"><Signup /></Titled>} />
          <Route path="login" element={<Titled title="Log in"><Login /></Titled>} />
          <Route path="widget" element={<Titled title="Chat"><WidgetPage /></Titled>} />
          <Route path="kb/:propertyKey" element={<Titled title="Help center"><PropertyKb /></Titled>} />
          <Route path="admin" element={<OwnerGuard><Titled title="Platform admin"><Admin /></Titled></OwnerGuard>} />
          <Route path="onboarding" element={<Navigate to="/app/welcome" replace />} />
          <Route path="app" element={<AuthGuard><AppShell /></AuthGuard>}>
            <Route index element={<Titled title="Inbox"><Inbox /></Titled>} />
            <Route path="welcome" element={<Titled title="Welcome"><Welcome /></Titled>} />
            <Route path="visitors" element={<Titled title="Live visitors"><Visitors /></Titled>} />
            <Route path="contacts" element={<Titled title="Contacts"><Contacts /></Titled>} />
            <Route path="analytics" element={<Titled title="Analytics"><Analytics /></Titled>} />
            <Route path="ratings" element={<Titled title="Ratings"><Ratings /></Titled>} />
            <Route path="quality" element={<Titled title="Quality"><Quality /></Titled>} />
            <Route path="knowledge" element={<Titled title="Knowledge base"><KnowledgeBase /></Titled>} />
            <Route path="canned" element={<Titled title="Canned responses"><Canned /></Titled>} />
            <Route path="triggers" element={<Titled title="Triggers"><Triggers /></Titled>} />
            <Route path="flows" element={<Titled title="Chatbot flows"><Flows /></Titled>} />
            <Route path="campaigns" element={<Titled title="Campaigns"><Campaigns /></Titled>} />
            <Route path="tickets" element={<Titled title="Tickets"><Tickets /></Titled>} />
            <Route path="feedback" element={<Titled title="Feedback"><Feedback /></Titled>} />
            <Route path="properties" element={<Titled title="Properties"><Properties /></Titled>} />
            <Route path="branding" element={<Titled title="Branding"><Branding /></Titled>} />
            <Route path="install" element={<Titled title="Install"><Install /></Titled>} />
            <Route path="team" element={<Titled title="Team"><Team /></Titled>} />
            <Route path="departments" element={<Titled title="Departments"><Departments /></Titled>} />
            <Route path="categories" element={<Titled title="Categories"><Categories /></Titled>} />
            <Route path="developers" element={<Titled title="Developers"><Developers /></Titled>} />
            <Route path="schedules" element={<Titled title="Schedules"><Schedules /></Titled>} />
            <Route path="import" element={<Titled title="Import"><Import /></Titled>} />
            <Route path="settings" element={<Titled title="Settings"><Settings /></Titled>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
