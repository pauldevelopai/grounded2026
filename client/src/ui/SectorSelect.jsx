// SectorSelect — the Develop AI sector filter, shared by the operator shells
// (StudioShell + AdminArea). Many back-office pages read selectedSectorId from
// SectorContext; this is the control that sets it. Lifted out of the old admin
// Sidebar so the selector survives the shell split (Phase 1 · steps 4–5).

import { useSectors } from '../context/SectorContext.jsx';

export default function SectorSelect() {
  const { sectors, selectedSectorId, setSelectedSectorId } = useSectors();
  return (
    <div style={{ padding: '12px 16px' }}>
      <select
        value={selectedSectorId || ''}
        onChange={(e) => setSelectedSectorId(e.target.value || null)}
        style={{
          width: '100%', padding: '8px 10px',
          background: 'var(--sidebar-hover)', color: 'var(--sidebar-text)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius)', fontSize: 13,
        }}
      >
        <option value="">All Sectors</option>
        {sectors.filter((s) => s.is_active).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
