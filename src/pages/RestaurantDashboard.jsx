import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function RestaurantDashboard() {
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [donation, setDonation] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/'); return }

    const { data: rest } = await supabase
      .from('restaurants')
      .select('*')
      .eq('email', user.email)
      .single()
    setRestaurant(rest)

    if (rest) {
      const today = new Date().toISOString().split('T')[0]
      const { data: assign } = await supabase
        .from('assignments')
        .select('*, shelters(*)')
        .eq('restaurant_id', rest.id)
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
        .select('*, assignments(assignment_date, shelters(name))')
        .eq('restaurant_id', rest.id)
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
          <div style={s.headerTitle}>{restaurant?.name || 'Restaurant Dashboard'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={s.badge}>Restaurant</div>
          <button onClick={handleSignOut} style={s.signOut}>Sign out</button>
        </div>
      </div>

      <div style={s.body}>
        {/* Today's Assignment */}
        <div style={s.card}>
          <div style={s.sectionLabel}>Today's Assignment</div>
          {assignment ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={s.shelterName}>{assignment.shelters?.name || 'Assigned Shelter'}</div>
                <div style={s.shelterSub}>Pickup window: 5:00–7:00 PM</div>
              </div>
              <span style={donation ? s.badgeGreen : s.badgeAmber}>
                {donation ? 'Posted' : 'Pending'}
              </span>
            </div>
          ) : (
            <div style={{ color: '#6B7280', fontSize: 14 }}>No assignment for today yet.</div>
          )}
        </div>

        {/* Action Button */}
        {assignment && !donation && (
          <button style={s.btn} onClick={() => navigate('/restaurant/post')}>
            Post Today's Surplus
          </button>
        )}
        {donation && (
          <div style={{ ...s.card, background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Donation posted</div>
            <div style={{ fontSize: 12, color: '#166534', marginTop: 3, opacity: 0.85 }}>
              {assignment?.shelters?.name} has been notified.
            </div>
          </div>
        )}

        {/* Recent History */}
        <div style={{ marginTop: 20 }}>
          <div style={s.sectionLabel}>Recent Donations</div>
          {history.length === 0 ? (
            <div style={{ color: '#6B7280', fontSize: 13 }}>No donations yet.</div>
          ) : (
            history.map((h, i) => (
              <div key={i} style={s.historyRow}>
                <div>
                  <div style={s.historyName}>{h.assignments?.shelters?.name || 'Shelter'}</div>
                  <div style={s.historySub}>{h.assignments?.assignment_date} · {h.quantity} portions</div>
                </div>
                <span style={h.status === 'confirmed' ? s.badgeGreen : s.badgeAmber}>
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
  card: { background: '#fff', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  shelterName: { fontSize: 16, fontWeight: 700, color: '#111827' },
  shelterSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  btn: { background: '#2C5F2D', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 12 },
  historyRow: { background: '#fff', borderRadius: 12, padding: '11px 13px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  historyName: { fontSize: 13, fontWeight: 500, color: '#111827' },
  historySub: { fontSize: 11, color: '#6B7280' },
  badgeGreen: { background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
  badgeAmber: { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
}