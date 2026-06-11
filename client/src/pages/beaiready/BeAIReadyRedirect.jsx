// /beaiready on the MAIN Grounded site — a lightweight page that reroutes to
// the dedicated subdomain, so Grounded's own front page is never disturbed
// and any link shared as grounded.developai.co.za/beaiready lands correctly.
// Mount in App.jsx:  <Route path="/beaiready" element={<BeAIReadyRedirect />} />
import { useEffect } from 'react';

export default function BeAIReadyRedirect() {
  useEffect(() => { window.location.replace('https://beaiready.developai.co.za'); }, []);
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', color: '#6b6359' }}>
      <p>Taking you to <strong>Be AI Ready</strong>&hellip;</p>
      <p><a href="https://beaiready.developai.co.za" style={{ color: '#c75b39' }}>
        Continue to beaiready.developai.co.za
      </a></p>
    </div>
  );
}
