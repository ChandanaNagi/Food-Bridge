import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function DonationDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [donation, setDonation] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useEffect(() => { loadDonation() }, [])

  const loadDonation = async () => {
    const { data: don } = await supabase
      .from('donations')
      .select('*, restaurants(*)')
      .eq('id', id)
      .single()
    setDonation(don)
    setRestaurant(don?.restaurants)
    setLoading(false)
  }

  const handleAccept = async () => {
    setActing(true)
    await supabase.from('donations').update({ status: 'confirmed' }).eq('id', id)
    await supabase.from('assignments').update({ status: 'confirmed' }).eq('id', donation.assignment_id)
    navigate('/shelter')
  }

  const handleDecline = async () => {
    setActing(true)
    await supabase.from('donations').update({ status: 'declined' }).eq('id', id)
    await supabase.from('assignments').update({ status: 'reassigning' }).eq('id', donation.assignment_id)
    navigate('/shelter')
  }

  if (loading) return <div style={s.loading}>Loading...</div>
  if (!donation) return <div style={s.loading}>Donation not found.</div>

  const details = [
    ['Restaurant', restaurant?.name],
    ['Food items', donation.food_items],
    ['Quantity', `${donation.quantity} portions`],
    ['Pickup window', donation.pickup_window],
    ['Safe until', donation.safe_until || 'Not specified'],
    ['Allergens', donation.allergen_notes || 'None noted'],
  ]

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate('/shelter')} style={s.back}>← Back</button>
        <div style={s.headerSub}>FoodBridge Detroit</div>
        <div style={s.headerTitle}>Incoming Donation</div>
      </div>

      <div style={s.body}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#6B7280' }}>Today's donation</div>
          <span style={s.badgeAmber}>Pending</span>
        </div>

        <div style={s.card}>
          {details.map(([k, v]) => (
            <div key={k} style={s.row}>
              <span style={s.rowKey}>{k}</span>
              <span style={s.rowVal}>{v}</span>
            </div>
          ))}
        </div>

        <div style={s.alert}>Response window closes in 1 hr 32 min</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button onClick={handleDecline} disabled={acting} style={s.btnOutline}>Decline</button>
          <button onClick={handleAccept} disabled={acting} style={s.btnPrimary}>Accept Donation</button>
        </div>

        <p style={s.note}>Your shelter is responsible for pickup within the stated window.</p>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#F4F8F4', fontFamily: 'system-ui, sans-serif' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B7280' },
  header: { background: '#2C5F2D', padding: '14px 18px' },
  back: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer', padding: '0 0 7px', display: 'block' },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },
  body: { padding: '16px', maxWidth: 480, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 12 },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: 9, fontSize: 13, gap: 12 },
  rowKey: { color: '#6B7280', flexShrink: 0 },
  rowVal: { color: '#111827', fontWeight: 500, textAlign: 'right' },
  alert: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '9px 12px', marginBottom: 14, fontSize: 12, color: '#B45309' },
  btnPrimary: { background: '#2C5F2D', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 2 },
  btnOutline: { background: '#fff', color: '#2C5F2D', border: '1.5px solid #2C5F2D', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 1 },
  note: { fontSize: 11, color: '#6B7280', textAlign: 'center', margin: 0 },
  badgeAmber: { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 },
}