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
  const [completing, setCompleting] = useState(false)

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
      .maybeSingle()
    setRestaurant(rest)

    if (rest) {
      const today = new Date().toISOString().split('T')[0]
      const { data: assign } = await supabase
        .from('assignments')
        .select('*, shelters(*)')
        .eq('restaurant_id', rest.id)
        .eq('assignment_date', today)
        .maybeSingle()
      setAssignment(assign)

      if (assign) {
        // Fetch the MOST RECENT donation for this assignment, not just "a" donation.
        // This handles the case where a donation was declined and a new one was posted.
        const { data: donRows } = await supabase
          .from('donations')
          .select('*')
          .eq('assignment_id', assign.id)
          .order('posted_at', { ascending: false })
          .limit(1)
        setDonation(donRows && donRows.length > 0 ? donRows[0] : null)
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

  const handleMarkComplete = async () => {
    if (!donation) return
    setCompleting(true)
    await supabase
      .from('donations')
      .update({ status: 'completed', handoff_completed_at: new Date().toISOString() })
      .eq('id', donation.id)
    await loadDashboard()
    setCompleting(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  const canPostSurplus = assignment && (!donation || donation.status === 'declined')
  const showDonationCard = donation && donation.status !== 'declined'

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
                <div style={s.shelterSub}>
                  {donation?.pickup_window ? `Pickup window: ${donation.pickup_window}` : 'Pickup window: TBD'}
                </div>
              </div>
              <span style={badgeStyle(donation?.status)}>
                {donation ? statusLabel(donation.status) : 'Pending'}
              </span>
            </div>
          ) : (
            <div style={{ color: '#6B7280', fontSize: 14 }}>No assignment for today yet.</div>
          )}
        </div>

        {/* Declined notice, with option to repost */}
        {donation && donation.status === 'declined' && (
          <div style={{ ...s.card, background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#991B1B' }}>Donation declined</div>
            <div style={{ fontSize: 12, color: '#991B1B', marginTop: 3, opacity: 0.85 }}>
              {assignment?.shelters?.name} declined this donation
              {donation.decline_reason ? ` — ${donation.decline_reason}` : ''}. You can post a new surplus below.
            </div>
          </div>
        )}

        {/* Donation details, once posted and not declined */}
        {showDonationCard && (
          <div style={s.card}>
            <div style={s.sectionLabel}>Donation Details</div>
            <DetailRow label="Items" value={donation.food_items} />
            <DetailRow label="Quantity" value={`${donation.quantity} portions`} />
            <DetailRow label="Prepared" value={donation.prepared_time || '—'} />
            <DetailRow label="Safe until" value={donation.safe_until || '—'} />
            <DetailRow label="Temperature" value={donation.temperature_requirement || '—'} />
            <DetailRow label="Allergens" value={donation.allergen_notes || '—'} />
          </div>
        )}

        {/* Action Button */}
        {canPostSurplus && (
          <button style={s.btn} onClick={() => navigate('/restaurant/post')}>
            Post Today's Surplus
          </button>
        )}

        {showDonationCard && donation.status !== 'completed' && (
          <button style={s.btn} onClick={handleMarkComplete} disabled={completing}>
            {completing ? 'Marking complete...' : 'Mark Handoff Complete'}
          </button>
        )}

        {showDonationCard && donation.status === 'completed' && (
          <div style={{ ...s.card, background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Handoff complete</div>
            <div style={{ fontSize: 12, color: '#166534', marginTop: 3, opacity: 0.85 }}>
              Completed at {new Date(donation.handoff_completed_at).toLocaleTimeString()}
            </div>
          </div>
        )}

        {showDonationCard && donation.status === 'posted' && (
          <div style={{ ...s.card, background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Donation posted</div>
            <div style={{ fontSize: 12, color: '#166534', marginTop: 3, opacity: 0.85 }}>
              {assignment?.shelters?.name} has been notified.
            </div>
          </div>
        )}

        {/* Recent History / Past Assignments */}
        <div style={{ marginTop: 20 }}>
          <div style={s.sectionLabel}>Recent Assignments</div>
          {history.length === 0 ? (
            <div style={{ color: '#6B7280', fontSize: 13 }}>No donations yet.</div>
          ) : (
            history.map((h, i) => (
              <div key={i} style={s.historyRow}>
                <div>
                  <div style={s.historyName}>{h.assignments?.shelters?.name || 'Shelter'}</div>
                  <div style={s.historySub}>{h.assignments?.assignment_date} · {h.quantity} portions</div>
                </div>
                <span style={badgeStyle(h.status)}>
                  {statusLabel(h.status)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function statusLabel(status) {
  const map = {
    posted: 'Posted',
    confirmed: 'Confirmed',
    completed: 'Completed',
    declined: 'Declined',
  }
  return map[status] || status
}

function badgeStyle(status) {
  if (status === 'completed' || status === 'confirmed') return s.badgeGreen
  if (status === 'declined') return s.badgeRed
  return s.badgeAmber
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value}</span>
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
  badgeRed: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
}