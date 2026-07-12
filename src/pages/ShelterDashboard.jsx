import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ShelterDashboard() {
  const navigate = useNavigate()
  const [shelter, setShelter] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [donation, setDonation] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/'); return }

    const { data: shelt } = await supabase
      .from('shelters')
      .select('*')
      .eq('email', user.email)
      .single()
    setShelter(shelt)

    if (shelt) {
      const today = new Date().toISOString().split('T')[0]
      const { data: assign } = await supabase
        .from('assignments')
        .select('*, restaurants(*)')
        .eq('shelter_id', shelt.id)
        .eq('assignment_date', today)
        .single()
      setAssignment(assign)

      if (assign) {
        const { data: don } = await supabase
          .from('donations')
          .select('*')
          .eq('assignment_id', assign.id)
          .single()
        setDonation(don)
      }

      const { data: hist } = await supabase
        .from('donations')
        .select('*, assignments(assignment_date, restaurants(name))')
        .eq('shelter_id', shelt.id)
        .order('posted_at', { ascending: false })
        .limit(5)
      setHistory(hist || [])
    }
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.headerSub}>FoodBridge Detroit</div>
          <div style={s.headerTitle}>{shelter?.name || 'Shelter Dashboard'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={s.badge}>Shelter</div>
          <button onClick={handleSignOut} style={s.signOut}>Sign out</button>
        </div>
      </div>

      <div style={s.body}>
        {/* Today's incoming donation */}
        {assignment && donation ? (
          <div style={{ ...s.card, border: '1.5px solid #FDE68A', background: '#FFFBEB', marginBottom: 12 }}>
            <div style={s.sectionLabel}>Action Required</div>
            <div style={s.restaurantName}>{assignment.restaurants?.name}</div>
            <div style={s.restaurantSub}>Posted {donation.quantity} portions · Pickup by {donation.pickup_window}</div>
            <button style={s.btn} onClick={() => navigate(`/shelter/donation/${donation.id}`)}>
              Review Donation
            </button>
          </div>
        ) : assignment && !donation ? (
          <div style={s.card}>
            <div style={s.sectionLabel}>Today's Assignment</div>
            <div style={s.restaurantName}>{assignment.restaurants?.name}</div>
            <div style={s.restaurantSub}>Waiting for restaurant to post surplus...</div>
          </div>
        ) : (
          <div style={s.card}>
            <div style={s.sectionLabel}>Today's Assignment</div>
            <div style={{ color: '#6B7280', fontSize: 14 }}>No assignment for today yet.</div>
          </div>
        )}

        {/* History */}
        <div style={{ marginTop: 20 }}>
          <div style={s.sectionLabel}>This Week</div>
          {history.length === 0 ? (
            <div style={{ color: '#6B7280', fontSize: 13 }}>No donations yet.</div>
          ) : (
            history.map((h, i) => (
              <div key={i} style={s.historyRow}>
                <div>
                  <div style={s.historyName}>{h.assignments?.restaurants?.name || 'Restaurant'}</div>
                  <div style={s.historySub}>{h.assignments?.assignment_date} · {h.quantity} portions</div>
                </div>
                <span style={h.status === 'confirmed' ? s.badgeGreen : h.status === 'posted' ? s.badgeAmber : s.badgeGreen}>
                  {h.status}
                </span>
              </div>
            ))
          )}
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
  card: { background: '#fff', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  restaurantName: { fontSize: 15, fontWeight: 700, color: '#111827' },
  restaurantSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  btn: { background: '#2C5F2D', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: 10 },
  historyRow: { background: '#fff', borderRadius: 12, padding: '11px 13px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  historyName: { fontSize: 13, fontWeight: 500, color: '#111827' },
  historySub: { fontSize: 11, color: '#6B7280' },
  badgeGreen: { background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
  badgeAmber: { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
}