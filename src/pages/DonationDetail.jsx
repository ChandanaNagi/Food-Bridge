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
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  const declineReasons = [
    'At capacity — cannot receive more food',
    'No transportation available for pickup',
    'Food type does not match our needs',
    'Pickup window does not work for us',
    'Other',
  ]

  useEffect(() => { loadDonation() }, [])

  const loadDonation = async () => {
    const { data: don } = await supabase
      .from('donations').select('*, restaurants(*)').eq('id', id).single()
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

  const handleDeclineSubmit = async () => {
    if (!declineReason) return
    setActing(true)
    await supabase.from('donations').update({ status: 'declined', decline_reason: declineReason }).eq('id', id)
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
          <button onClick={() => setShowDeclineModal(true)} disabled={acting} style={s.btnOutline}>Decline</button>
          <button onClick={handleAccept} disabled={acting} style={s.btnPrimary}>Accept Donation</button>
        </div>

        <p style={s.note}>Your shelter is responsible for pickup within the stated window.</p>
      </div>

      {/* Decline Modal */}
      {showDeclineModal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Reason for declining</div>
            <div style={s.modalSub}>Please select a reason so we can improve future matches.</div>
            {declineReasons.map((r, i) => (
              <div key={i} onClick={() => setDeclineReason(r)}
                style={{ ...s.reasonOption, background: declineReason === r ? '#EBF5EB' : '#fff', border: declineReason === r ? '1.5px solid #2C5F2D' : '1.5px solid #E5E7EB' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: declineReason === r ? '#2C5F2D' : '#D1D5DB', background: declineReason === r ? '#2C5F2D' : '#fff', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#111827' }}>{r}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowDeclineModal(false)} style={s.btnOutline}>Cancel</button>
              <button onClick={handleDeclineSubmit} disabled={!declineReason || acting} style={{ ...s.btnPrimary, opacity: !declineReason ? 0.5 : 1 }}>Confirm Decline</button>
            </div>
          </div>
        </div>
      )}
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
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal: { background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  reasonOption: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer' },
}