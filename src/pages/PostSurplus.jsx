import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function PostSurplus() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    food_items: '', quantity: '', pickup_window: '', allergen_notes: '', safe_until: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.food_items || !form.quantity || !form.pickup_window) {
      setError('Please fill in food items, quantity, and pickup window.')
      return
    }
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('email', user.email)
      .single()

    const today = new Date().toISOString().split('T')[0]
    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, shelter_id')
      .eq('restaurant_id', restaurant.id)
      .eq('assignment_date', today)
      .single()

    if (!assignment) {
      setError('No assignment found for today.')
      setLoading(false)
      return
    }

    const { error: err } = await supabase.from('donations').insert({
      assignment_id: assignment.id,
      restaurant_id: restaurant.id,
      shelter_id: assignment.shelter_id,
      food_items: form.food_items,
      quantity: parseInt(form.quantity),
      pickup_window: form.pickup_window,
      allergen_notes: form.allergen_notes,
      safe_until: form.safe_until || null,
      status: 'posted',
    })

    if (err) { setError(err.message); setLoading(false); return }

    await supabase
      .from('assignments')
      .update({ status: 'posted' })
      .eq('id', assignment.id)

    navigate('/restaurant')
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate('/restaurant')} style={s.back}>← Back</button>
        <div style={s.headerSub}>FoodBridge Detroit</div>
        <div style={s.headerTitle}>Post Surplus</div>
      </div>

      <div style={s.body}>
        <p style={s.subtext}>For: <strong>Covenant House Detroit</strong> · Today</p>

        {error && <div style={s.error}>{error}</div>}

        <Field label="Food items *" value={form.food_items} onChange={set('food_items')} placeholder="e.g. Grilled chicken, rice, salad" />
        <Field label="Quantity (portions) *" value={form.quantity} onChange={set('quantity')} placeholder="e.g. 35" type="number" />
        <Field label="Pickup window *" value={form.pickup_window} onChange={set('pickup_window')} placeholder="e.g. 5:00–7:00 PM" />
        <Field label="Safe until" value={form.safe_until} onChange={set('safe_until')} placeholder="e.g. 9:00 PM" />
        <Field label="Allergen notes" value={form.allergen_notes} onChange={set('allergen_notes')} placeholder="e.g. Nut-free, gluten-free" />

        <button onClick={handleSubmit} style={s.btn} disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Donation'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', marginBottom: 5 }}>{label}</div>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 11px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13, color: '#111827', background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#F4F8F4', fontFamily: 'system-ui, sans-serif' },
  header: { background: '#2C5F2D', padding: '14px 18px' },
  back: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer', padding: '0 0 7px', display: 'block' },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },
  body: { padding: '16px', maxWidth: 480, margin: '0 auto' },
  subtext: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  error: { background: '#FEF2F2', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 },
  btn: { background: '#2C5F2D', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', marginTop: 6 },
}