import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ShelterDashboard() {
  const navigate = useNavigate()
  const [shelter, setShelter] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [donation, setDonation] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [loading, setLoading] = useState(true)
  
  // Right-side flyout menu toggle state
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/'); return }

    const { data: shelt } = await supabase
      .from('shelters').select('*').eq('email', user.email).single()
    setShelter(shelt)

    if (shelt) {
      const today = new Date().toISOString().split('T')[0]
      
      // 1. Fetch Current/Active Assignment
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

      // 2. Fetch Upcoming Assignments (Future Dates)
      const { data: upcm } = await supabase
        .from('assignments')
        .select('*, restaurants(*)')
        .eq('shelter_id', shelt.id)
        .gt('assignment_date', today)
        .order('assignment_date', { ascending: true })
        .limit(3)
      setUpcoming(upcm || [])

      // 3. Fetch Notifications
      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('shelter_id', shelt.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setNotifications(notifs || [])

      // 4. Fetch History / Response Status Records
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

  const handleResponse = async (status, reason = null) => {
    if (!donation) return
    
    const { error } = await supabase
      .from('donations')
      .update({ status: status, decline_reason: reason })
      .eq('id', donation.id)
      
    if (!error) {
      // Reload page state to reflect updated visual flags
      loadDashboard()
    }
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

  if (loading) return <div style={s.loading}>Loading Dashboard...</div>

  return (
    <div style={s.page}>
      
      {/* HEADER */}
      <div style={s.header}>
        <div>
          <div style={s.headerSub}>FoodBridge Detroit</div>
          <div style={s.headerTitle}>{shelter?.name || 'Shelter Dashboard'}</div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowNotifs(!showNotifs); markAllRead() }} style={s.bellBtn}>
              🔔
              {unread > 0 && <span style={s.badge}>{unread}</span>}
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

          <div onClick={() => setMenuOpen(true)} style={s.menuTrigger}>
            Menu ☰
          </div>
        </div>
      </div>

      {/* BODY CONTENT */}
      <div style={s.body}>
        
        {/* ACCOUNT STATUS & STRIKES TRACKER */}
        <div style={s.statusBanner}>
          <div>
            Status: <span style={{ fontWeight: 700, color: '#166534' }}>Active Member</span>
          </div>
          <div style={s.strikeIndicator}>
            Strikes: <span style={{ color: shelter?.strikes > 0 ? '#DC2626' : '#64748B', fontWeight: 700 }}>{shelter?.strikes || 0}/3</span>
          </div>
        </div>

        {/* ACTIVE ASSIGNMENT BOX */}
        {assignment ? (
          <div style={{ 
            ...s.card, 
            border: donation?.status === 'posted' ? '1.5px solid #FDE68A' : '1px solid #E2E8F0', 
            background: donation?.status === 'posted' ? '#FFFBEB' : '#fff',
            marginBottom: 20 
          }}>
            <div style={s.sectionLabel}>
              {donation?.status === 'posted' ? 'Action Required (Pending Response)' : "Today's Assignment"}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={s.restaurantName}>{assignment.restaurants?.name}</div>
                {assignment.restaurants?.address && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.restaurants.address)}`} 
                    target="_blank" 
                    rel="noreferrer"
                    style={s.featureLink}
                  >
                    📍 View Map & Location Directions
                  </a>
                )}
              </div>
              
              <button 
                onClick={() => navigate(`/shelter/restaurant/${assignment.restaurants?.id}/menu`)}
                style={s.secondaryBtn}
              >
                📋 View Listing & Menus
              </button>
            </div>

            {/* ACTION RESPONSES & ESTIMATED WAIT WINDOWS */}
            {donation ? (
              <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
                <div style={s.restaurantSub}>
                  <b>Surplus Offer:</b> {donation.quantity} portions · <b>Response Deadline:</b> {donation.pickup_window}
                </div>
                
                <div style={s.waitEstimateBox}>
                  ⏱️ <b>Estimated Location Wait Time:</b> {donation.estimated_wait_time || "5-10 mins"}
                </div>
                
                {donation.status === 'posted' && (
                  <div style={s.actionRow}>
                    <button style={s.acceptBtn} onClick={() => handleResponse('confirmed')}>
                      Accept Donation
                    </button>
                    <button style={s.declineBtn} onClick={() => {
                      const reason = prompt("Please enter decline reason:");
                      if (reason) handleResponse('declined', reason);
                    }}>
                      Decline Match
                    </button>
                  </div>
                )}
                
                {donation.status === 'confirmed' && (
                  <div style={s.successTag}>✓ Accepted & Confirmed for Drop</div>
                )}
                {donation.status === 'declined' && (
                  <div style={s.dangerTag}>✕ Assignment Declined</div>
                )}
              </div>
            ) : (
              <div style={{ ...s.restaurantSub, marginTop: 10 }}>
                Waiting for restaurant partner to post specific surplus menu counts...
              </div>
            )}
          </div>
        ) : (
          <div style={s.card}>
            <div style={s.sectionLabel}>Today's Assignment</div>
            <div style={{ color: '#64748B', fontSize: 14 }}>No match assigned for today yet.</div>
          </div>
        )}

        {/* UPCOMING SCHEDULED ASSIGNMENTS */}
        <div style={{ marginTop: 24 }}>
          <div style={s.sectionLabel}>Upcoming Scheduled Matches</div>
          {upcoming.length === 0 ? (
            <div style={{ color: '#64748B', fontSize: 13, padding: '4px 0', fontStyle: 'italic' }}>No upcoming matches planned.</div>
          ) : (
            upcoming.map((up, i) => (
              <div key={i} style={s.upcomingRow}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{up.restaurants?.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>📍 {up.restaurants?.address}</div>
                </div>
                <div style={s.dateBadge}>{up.assignment_date}</div>
              </div>
            ))
          )}
        </div>

        {/* HISTORY LOGS */}
        <div style={{ marginTop: 24 }}>
          <div style={s.sectionLabel}>Recent Donation Logs & Statuses</div>
          {history.length === 0 ? (
            <div style={{ color: '#64748B', fontSize: 13, padding: '4px 0' }}>No history entries.</div>
          ) : (
            history.map((h, i) => (
              <div key={i} style={s.historyRow}>
                <div>
                  <div style={s.historyName}>{h.assignments?.restaurants?.name || 'Restaurant Partner'}</div>
                  <div style={s.historySub}>{h.assignments?.assignment_date} · {h.quantity} portions</div>
                  {h.decline_reason && (
                    <div style={{ fontSize: 11, color: '#991B1B', marginTop: 2 }}>Reason: {h.decline_reason}</div>
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

      {/* FLYOUT BACKGROUND DIM OVERLAY */}
      {menuOpen && <div onClick={() => setMenuOpen(false)} style={s.menuOverlay} />}

      {/* RIGHT SIDE MINIMALIST FLYOUT NAVIGATION */}
      <div style={{ ...s.flyoutMenu, right: menuOpen ? "0" : "-400px" }}>
        <div style={s.menuHeader}>
          <button onClick={handleSignOut} style={s.menuSignOutBtn}>
            Sign Out
          </button>
          <button onClick={() => setMenuOpen(false)} style={s.menuCloseBtn}>
            ✕
          </button>
        </div>

        <div style={s.menuList}>
          <button onClick={() => { navigate("/shelter/schedule"); setMenuOpen(false); }} style={s.menuItem}>
            Delivery Schedule
          </button>
          <button onClick={() => { navigate("/shelter/history"); setMenuOpen(false); }} style={s.menuItem}>
            Donation History <span style={s.arrow}>›</span>
          </button>
          <button onClick={() => { navigate("/shelter/profile"); setMenuOpen(false); }} style={s.menuItem}>
            Shelter Settings
          </button>
          <button onClick={() => { navigate("/shelter/support"); setMenuOpen(false); }} style={s.menuItem}>
            Report an Issue <span style={s.arrow}>›</span>
          </button>
        </div>
      </div>

    </div>
  )
}

const s = {
  page: { 
    minHeight: '100vh', 
    background: '#F8FAFC', 
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1E293B',
    overflowX: 'hidden',
    position: 'relative'
  },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748B' },
  header: { background: '#2C5F2D', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#fff' },
  menuTrigger: {
    background: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    padding: '6px 14px',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer'
  },
  bellBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', position: 'relative', padding: '4px' },
  badge: { position: 'absolute', top: -2, right: -4, background: '#DC2626', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notifDropdown: { position: 'absolute', right: 0, top: 40, width: 300, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden', border: '1px solid #E2E8F0' },
  notifHeader: { padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #E5E7EB', color: '#111827' },
  notifEmpty: { padding: '16px 14px', color: '#6B7280', fontSize: 13 },
  notifItem: { padding: '10px 14px', borderBottom: '1px solid #F3F4F6' },
  notifTitle: { fontSize: 12, fontWeight: 600, color: '#111827' },
  notifMsg: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  notifTime: { fontSize: 10, color: '#9CA3AF', marginTop: 3 },
  
  body: { padding: '24px 16px', maxWidth: 480, margin: '0 auto' },
  statusBanner: { background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 16, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500 },
  strikeIndicator: { background: '#FEF2F2', padding: '2px 8px', borderRadius: 6, fontSize: 12 },
  card: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 },
  restaurantName: { fontSize: 16, fontWeight: 700, color: '#0F172A' },
  restaurantSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  
  // Custom Feature Components
  featureLink: { display: 'inline-block', fontSize: 12, color: '#2C5F2D', textDecoration: 'none', fontWeight: 600, marginTop: 6 },
  secondaryBtn: { background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' },
  waitEstimateBox: { background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#334155', marginTop: 10 },
  actionRow: { display: 'flex', gap: 10, marginTop: 14 },
  acceptBtn: { flex: 1, background: '#2C5F2D', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  declineBtn: { flex: 1, background: '#EFF6FF', color: '#991B1B', border: '1.5px solid #FCA5A5', padding: '10px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  successTag: { display: 'block', background: '#DCFCE7', color: '#14532D', textAlign: 'center', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 12 },
  dangerTag: { display: 'block', background: '#FEF2F2', color: '#991B1B', textAlign: 'center', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 12 },
  
  upcomingRow: { background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dateBadge: { background: '#F1F5F9', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#475569' },
  historyRow: { background: '#fff', borderRadius: 12, padding: '14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #E2E8F0' },
  historyName: { fontSize: 14, fontWeight: 600, color: '#0F172A' },
  historySub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  
  badgeGreen: { background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 },
  badgeAmber: { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 },
  badgeRed: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 },

  // FLYOUT DRAWER STYLING
  flyoutMenu: {
    position: 'fixed',
    top: 0,
    width: '360px',
    height: '100vh',
    background: '#fff',
    boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
    zIndex: 1000,
    padding: '40px 30px',
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
    transition: 'right 0.3s ease-in-out'
  },
  menuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.3)',
    zIndex: 999
  },
  menuHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  menuSignOutBtn: {
    background: '#D90429',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 24px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer'
  },
  menuCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    color: '#000',
    cursor: 'pointer'
  },
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 32
  },
  menuItem: {
    background: 'none',
    border: 'none',
    textAlign: 'left',
    fontSize: 22,
    fontWeight: 700,
    color: '#000',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%'
  },
  arrow: {
    fontSize: 24,
    color: '#000',
    fontWeight: 400,
    marginLeft: 10
  }
}