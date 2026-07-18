import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ShelterDashboard() {
  const navigate = useNavigate()
  const [shelter, setShelter] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [donation, setDonation] = useState(null)
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/'); return }

    const { data: shelt } = await supabase
      .from('shelters').select('*').eq('email', user.email).single()
    setShelter(shelt)

    if (shelt) {
      const today = new Date().toISOString().split('T')[0]
      const { data: assign } = await supabase
        .from('assignments')
        .select('*, restaurants(*)')
        .eq('shelter_id', shelt.id)
        .eq('assignment_date', today)
        .maybeSingle()
      setAssignment(assign)

      if (assign) {
        const { data: don } = await supabase
          .from('donations').select('*').eq('assignment_id', assign.id).single()
        setDonation(don)

        // Create notification if donation is posted and unread
        if (don && don.status === 'posted') {
          const { data: existing } = await supabase
            .from('notifications')
            .select('id')
            .eq('donation_id', don.id)
            .eq('shelter_id', shelt.id)
          
          if (!existing || existing.length === 0) {
            await supabase.from('notifications').insert({
              shelter_id: shelt.id,
              donation_id: don.id,
              title: 'New donation available',
              message: `${assign.restaurants?.name} posted ${don.quantity} portions. Pickup by ${don.pickup_window}.`,
            })
          }
        }
      }

      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('shelter_id', shelt.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setNotifications(notifs || [])

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

  const markAllRead = async () => {
    await supabase.from('notifications')
      .update({ read: true })
      .eq('shelter_id', shelter.id)
    setNotifications(n => n.map(x => ({ ...x, read: true })))
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const unread = notifications.filter(n => !n.read).length

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.headerSub}>FoodBridge Detroit</div>
          <div style={s.headerTitle}>{shelter?.name || 'Shelter Dashboard'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowNotifs(!showNotifs); markAllRead() }} style={s.bellBtn}>
              🔔
              {unread > 0 && (
                <span style={s.badge}>{unread}</span>
              )}
            </button>
            {showNotifs && (
              <div style={s.notifDropdown}>
                <div style={s.notifHeader}>Notifications</div>
                {notifications.length === 0 ? (
                  <div style={s.notifEmpty}>No notifications</div>
                ) : (
                  notifications.map((n, i) => (
                    <div key={i} style={{ ...s.notifItem, background: n.read ? '#fff' : '#F0FDF4' }}>
                      <div style={s.notifTitle}>{n.title}</div>
                      <div style={s.notifMsg}>{n.message}</div>
                      <div style={s.notifTime}>{new Date(n.created_at).toLocaleTimeString()}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div style={s.roleBadge}>Shelter</div>
          <button onClick={handleSignOut} style={s.signOut}>Sign out</button>
        </div>
      </div>

      <div style={s.body}>
        {assignment && donation && (donation.status === 'posted') ? (
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
        ) : donation && donation.status === 'confirmed' ? (
          <div style={{ ...s.card, background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <div style={s.sectionLabel}>Today's Pickup</div>
            <div style={s.restaurantName}>{assignment?.restaurants?.name}</div>
            <div style={s.restaurantSub}>Confirmed · Pickup by {donation.pickup_window}</div>
          </div>
        ) : (
          <div style={s.card}>
            <div style={s.sectionLabel}>Today's Assignment</div>
            <div style={{ color: '#6B7280', fontSize: 14 }}>No assignment for today yet.</div>
          </div>
        )}

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
                  {h.decline_reason && (
                    <div style={{ fontSize: 11, color: '#991B1B', marginTop: 2 }}>Declined: {h.decline_reason}</div>
                  )}
                </div>
                <span style={h.status === 'confirmed' ? s.badgeGreen : h.status === 'declined' ? s.badgeRed : s.badgeAmber}>
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
  roleBadge: { background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#fff' },
  signOut: { background: 'none', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#fff', cursor: 'pointer' },
  bellBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', position: 'relative', padding: '4px 8px' },
  badge: { position: 'absolute', top: 0, right: 0, background: '#DC2626', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notifDropdown: { position: 'absolute', right: 0, top: 40, width: 300, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden' },
  notifHeader: { padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #E5E7EB', color: '#111827' },
  notifEmpty: { padding: '16px 14px', color: '#6B7280', fontSize: 13 },
  notifItem: { padding: '10px 14px', borderBottom: '1px solid #F3F4F6' },
  notifTitle: { fontSize: 12, fontWeight: 600, color: '#111827' },
  notifMsg: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  notifTime: { fontSize: 10, color: '#9CA3AF', marginTop: 3 },
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
  badgeRed: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
}