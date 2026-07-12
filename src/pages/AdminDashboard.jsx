import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, declined: 0 })
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/'); return }

    const today = new Date().toISOString().split('T')[0]

    const { data: assignments } = await supabase
      .from('assignments')
      .select('*, restaurants(name), shelters(name)')
      .eq('assignment_date', today)

    if (assignments) {
      setPairs(assignments)
      setStats({
        total: assignments.length,
        confirmed: assignments.filter(a => a.status === 'confirmed').length,
        pending: assignments.filter(a => a.status === 'pending' || a.status === 'posted').length,
        declined: assignments.filter(a => a.status === 'declined' || a.status === 'reassigning').length,
      })
    }

    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const statusColor = (status) => {
    if (status === 'confirmed') return s.badgeGreen
    if (status === 'declined' || status === 'reassigning') return s.badgeRed
    return s.badgeAmber
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.headerSub}>FoodBridge Detroit</div>
          <div style={s.headerTitle}>Admin Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={s.badge}>Admin</div>
          <button onClick={handleSignOut} style={s.signOut}>Sign out</button>
        </div>
      </div>

      <div style={s.body}>
        {/* Stats grid */}
        <div style={s.grid}>
          {[
            { label: 'Active pairs', value: stats.total, sub: 'Today' },
            { label: 'Confirmed', value: stats.confirmed, sub: 'Today', color: '#166534' },
            { label: 'Pending', value: stats.pending, sub: 'Today', color: '#B45309' },
            { label: 'Declined', value: stats.declined, sub: 'Today', color: '#991B1B' },
          ].map((s2, i) => (
            <div key={i} style={s.statCard}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s2.color || '#2C5F2D' }}>{s2.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 2 }}>{s2.label}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>{s2.sub}</div>
            </div>
          ))}
        </div>

        {/* Today's pairs */}
        <div style={s.sectionLabel}>Today's Pairs</div>
        {pairs.length === 0 ? (
          <div style={{ color: '#6B7280', fontSize: 13 }}>No assignments for today.</div>
        ) : (
          pairs.map((p, i) => (
            <div key={i} style={s.pairRow}>
              <div>
                <div style={s.pairName}>{p.restaurants?.name}</div>
                <div style={s.pairSub}>→ {p.shelters?.name}</div>
              </div>
              <span style={statusColor(p.status)}>{p.status}</span>
            </div>
          ))
        )}

        {/* Impact card */}
        <div style={s.impactCard}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2C5F2D', marginBottom: 8 }}>Platform Impact</div>
          {[
            ['Total assignments', pairs.length],
            ['Confirmed today', stats.confirmed],
            ['Participation rate', stats.total > 0 ? `${Math.round((stats.confirmed / stats.total) * 100)}%` : 'N/A'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#6B7280' }}>{k}</span>
              <span style={{ fontWeight: 600, color: '#111827' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#F4F8F4', fontFamily: 'system-ui, sans-serif' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B7280' },
  header: { background: '#2C5F2D', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  headerTitle: { fontSize: 16, fontWeight: 700, color: '#fff' },
  badge: { background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#fff' },
  signOut: { background: 'none', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#fff', cursor: 'pointer' },
  body: { padding: '16px', maxWidth: 480, margin: '0 auto' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 },
  statCard: { background: '#fff', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  pairRow: { background: '#fff', borderRadius: 12, padding: '11px 13px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pairName: { fontSize: 13, fontWeight: 500, color: '#111827' },
  pairSub: { fontSize: 11, color: '#6B7280' },
  impactCard: { background: '#EBF5EB', borderRadius: 12, padding: 14, marginTop: 16 },
  badgeGreen: { background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
  badgeAmber: { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
  badgeRed: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
}