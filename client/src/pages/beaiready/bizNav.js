// bizNav — door-aware navigation for the BE AI READY client tools now that they
// render on BOTH doors:
//   • BE AI READY door (business edition): the tools sit under /dashboard/*, hub at /dashboard.
//   • Grounded door (newsrooms): /dashboard is Studio, so the hub moves to /business
//     while the sub-tools keep their /dashboard/* paths (they don't collide).
//
// Sub-tool cross-links (/dashboard/security, /dashboard/governance, …) are identical
// on both doors and need no help. Only the bare "Back to dashboard" hub link differs,
// so bizHome() resolves it by host. Detection mirrors App.jsx's IS_BEAIREADY.
export function isBeAIReadyDoor() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.startsWith('beaiready') ||
    (import.meta.env.DEV && window.sessionStorage.getItem('beaiready') === '1');
}

// Where "the dashboard" lives on the current door.
export function bizHome() {
  return isBeAIReadyDoor() ? '/dashboard' : '/business';
}
