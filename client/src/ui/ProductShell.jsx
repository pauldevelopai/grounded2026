// ProductShell — the newsroom product shell (Phase 1 · step 2).
//
// The concept-note-led top bar: wordmark + the five operational sections +
// Profile, wrapping the already-real product pages (Builder, Run, Tracker,
// Awareness, Pulse) so they read as ONE product instead of being scattered
// across the public site and the admin sidebar.
//
// Reads the IA from ui/sections.js so the nav can never drift from the section
// pages or the Hub. The 🔴 sections render an honest in-development state via
// their SectionLanding — never fabricated content.

import { lazy, Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { SECTIONS } from './sections.js';
import { useAuth } from '../context/AuthContext.jsx';
import FeedbackBubble from '../components/FeedbackBubble.jsx';
import QuestionBubble from '../components/QuestionBubble.jsx';
import NewsroomSwitcher from './NewsroomSwitcher.jsx';

export default function ProductShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Grounded — Newsroom-owned AI';
    return () => { document.title = prev; };
  }, []);

  const firstName = user?.name?.split(' ')[0] || user?.email || 'there';
  const nextParam = encodeURIComponent(location.pathname + location.search);
  const isAdmin = user?.role === 'admin';

  return (
    <div className="product-shell">
      <header className="product-topbar">
        <div className="product-topbar-inner">
          <Link to="/sections" className="product-wordmark">
            <span className="wm-name">Grounded</span>
            <span className="wm-sub">Newsroom-owned AI · by Develop&nbsp;AI</span>
          </Link>

          <nav className="product-nav">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.key}
                to={`/sections/${s.key}`}
                className={({ isActive }) => `product-nav-tab ${isActive ? 'active' : ''}`}
                style={{ '--accent': `var(${s.accentVar})` }}
              >
                <span className="tab-dot" />
                {s.label}
              </NavLink>
            ))}
          </nav>

          <div className="product-nav-right">
            <NavLink to="/functions" className="product-nav-link">Functions</NavLink>
            <NavLink to="/settings/newsroom-profile" className="product-nav-link">Profile</NavLink>
            {/* Operator entries — running the product (Admin) and Develop AI's
                own back-office (Studio) — admins only. The switcher lets an
                admin use the product AS a chosen newsroom (dogfooding). */}
            {isAdmin && <NewsroomSwitcher />}
            {isAdmin && <NavLink to="/admin" className="product-nav-link outline">Admin</NavLink>}
            {isAdmin && <NavLink to="/business-admin" className="product-nav-link outline">Be AI Ready</NavLink>}
            {isAdmin && <NavLink to="/dashboard" className="product-nav-link outline">Studio</NavLink>}
            {user ? (
              <button
                className="product-nav-link outline"
                onClick={async () => { await logout(); window.location.reload(); }}
              >
                Sign out
              </button>
            ) : (
              <a className="product-nav-link solid" href={`/login?next=${nextParam}`}>Sign in</a>
            )}
          </div>
        </div>
      </header>

      <main className="product-main">
        <Outlet />
      </main>

      <FeedbackBubble />
      <QuestionBubble />
    </div>
  );
}
