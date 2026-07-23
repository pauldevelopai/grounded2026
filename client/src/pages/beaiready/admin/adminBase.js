// adminBase — the BE AI READY admin portal renders under TWO prefixes:
//   • /admin           on the BE AI READY door (business edition)
//   • /business-admin   on the Grounded door (where /admin is Grounded's OWN
//                       platform admin, so the portal is mounted alongside it)
// Deriving the base from the current path lets one shell + one set of pages work
// on both doors without duplicating components. Also exposes the door-appropriate
// public-tracker path (the two doors mount the tracker at different routes).
import { useLocation } from 'react-router-dom';

export function useAdminBase() {
  const { pathname } = useLocation();
  const base = pathname.startsWith('/business-admin') ? '/business-admin' : '/admin';
  return {
    base,
    // Build a base-relative path: p('/client') → '/business-admin/client'.
    p: (sub = '') => `${base}${sub}`,
    // The public tracker lives at /tracker on the BE AI READY door and at the
    // authed /lawsuits tracker on the Grounded door.
    tracker: base === '/business-admin' ? '/lawsuits' : '/tracker',
  };
}
