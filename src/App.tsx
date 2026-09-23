import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import { MarketingLayout } from './components/marketing';
import AuthGuard from './auth/AuthGuard';
import OwnerGuard from './auth/OwnerGuard';
import Landing from './pages/Landing';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
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
import Inbox from './app/Inbox';
import Visitors from './app/Visitors';
import Contacts from './app/Contacts';
import Analytics from './app/Analytics';
import KnowledgeBase from './app/KnowledgeBase';
import Canned from './app/Canned';
import Triggers from './app/Triggers';
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
import Ratings from './app/Ratings';
// Worker A creates src/app/Feedback.tsx; the ./app/Feedback path below is
// correct from src/App.tsx (the "../app/Feedback" in the work order assumed a pages/ file).
import Feedback from './app/Feedback';

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
            <Route index element={<Landing />} />
            <Route path="features" element={<Features />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="blog" element={<Blog />} />
            <Route path="blog/:slug" element={<BlogPost />} />
            <Route path="help" element={<Help />} />
            <Route path="help/:slug" element={<HelpArticle />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="security" element={<Security />} />
            <Route path="status" element={<Status />} />
            <Route path="sitemap" element={<SitemapPage />} />
          </Route>
          <Route path="signup" element={<Signup />} />
          <Route path="login" element={<Login />} />
          <Route path="widget" element={<WidgetPage />} />
          <Route path="kb/:propertyKey" element={<PropertyKb />} />
          <Route path="admin" element={<OwnerGuard><Admin /></OwnerGuard>} />
          <Route path="app" element={<AuthGuard><AppShell /></AuthGuard>}>
            <Route index element={<Titled title="Inbox"><Inbox /></Titled>} />
            <Route path="visitors" element={<Titled title="Live visitors"><Visitors /></Titled>} />
            <Route path="contacts" element={<Titled title="Contacts"><Contacts /></Titled>} />
            <Route path="analytics" element={<Titled title="Analytics"><Analytics /></Titled>} />
            <Route path="ratings" element={<Titled title="Ratings"><Ratings /></Titled>} />
            <Route path="knowledge" element={<Titled title="Knowledge base"><KnowledgeBase /></Titled>} />
            <Route path="canned" element={<Titled title="Canned responses"><Canned /></Titled>} />
            <Route path="triggers" element={<Titled title="Triggers"><Triggers /></Titled>} />
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
            <Route path="settings" element={<Titled title="Settings"><Settings /></Titled>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
