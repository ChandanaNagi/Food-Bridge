import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function PostSurplus() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    food_items: '',
    quantity: '',
    pickup_window: '',
    prepared_time: '',
    safe_until: '',
    temperature_requirement: '',
    allergen_notes: '',
  })

  const [restaurant, setRestaurant] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [shelter, setShelter] = useState(null)

  const [pageLoading, setPageLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadRestaurantAndAssignment()
  }, [])

  const setField = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }))
  }

  const getLocalDateString = () => {
    const now = new Date()

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
  }

  const loadRestaurantAndAssignment = async () => {
    setPageLoading(true)
    setError('')

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError

      if (!user) {
        navigate('/')
        return
      }

      const {
        data: restaurantData,
        error: restaurantError,
      } = await supabase
        .from('restaurants')
        .select('id, name, email, status')
        .eq('email', user.email)
        .maybeSingle()

      if (restaurantError) throw restaurantError

      if (!restaurantData) {
        throw new Error(
          `No restaurant profile was found for ${user.email}.`
        )
      }

      setRestaurant(restaurantData)

      const today = getLocalDateString()

      const {
        data: assignmentData,
        error: assignmentError,
      } = await supabase
        .from('assignments')
        .select('id, restaurant_id, shelter_id, assignment_date, status')
        .eq('restaurant_id', restaurantData.id)
        .eq('assignment_date', today)
        .maybeSingle()

      if (assignmentError) throw assignmentError

      if (!assignmentData) {
        setAssignment(null)
        setShelter(null)
        setError('No assignment found for today.')
        return
      }

      setAssignment(assignmentData)

      const {
        data: shelterData,
        error: shelterError,
      } = await supabase
        .from('shelters')
        .select('id, name, email, status')
        .eq('id', assignmentData.shelter_id)
        .maybeSingle()

      if (shelterError) throw shelterError

      setShelter(shelterData || null)
    } catch (loadError) {
      console.error('Unable to load surplus form:', loadError)
      setError(loadError.message || 'Unable to load the surplus form.')
    } finally {
      setPageLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event?.preventDefault()

    if (!form.food_items.trim()) {
      setError('Please enter the food items.')
      return
    }

    if (!form.quantity || Number(form.quantity) <= 0) {
      setError('Please enter a valid quantity.')
      return
    }

    if (!form.pickup_window.trim()) {
      setError('Please enter the pickup window.')
      return
    }

    if (!restaurant) {
      setError('No restaurant profile was loaded.')
      return
    }

    if (!assignment) {
      setError('No assignment found for today.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const donationPayload = {
        assignment_id: assignment.id,
        restaurant_id: restaurant.id,
        shelter_id: assignment.shelter_id,
        food_items: form.food_items.trim(),
        quantity: Number.parseInt(form.quantity, 10),
        pickup_window: form.pickup_window.trim(),
        prepared_time: form.prepared_time.trim() || null,
        safe_until: form.safe_until.trim() || null,
        temperature_requirement:
          form.temperature_requirement.trim() || null,
        allergen_notes: form.allergen_notes.trim() || null,
        status: 'posted',
      }

      const {
        data: donation,
        error: donationError,
      } = await supabase
        .from('donations')
        .insert(donationPayload)
        .select('id')
        .single()

      if (donationError) throw donationError

      const { error: notificationError } = await supabase
  .from('notifications')
  .insert({
    shelter_id: assignment.shelter_id,
    donation_id: donation.id,
    title: 'New donation available',
    message: `${restaurant.name} posted ${form.quantity} portions of ${form.food_items}. Pickup window: ${form.pickup_window}.`,
    read: false,
  })

if (notificationError) {
  throw notificationError
}

      const { error: assignmentUpdateError } = await supabase
        .from('assignments')
        .update({ status: 'posted' })
        .eq('id', assignment.id)

      if (assignmentUpdateError) throw assignmentUpdateError

      setSuccess('Donation submitted successfully.')

      setForm({
        food_items: '',
        quantity: '',
        pickup_window: '',
        prepared_time: '',
        safe_until: '',
        temperature_requirement: '',
        allergen_notes: '',
      })

      setTimeout(() => {
        if (donation?.id) {
          navigate('/restaurant')
        } else {
          navigate('/restaurant')
        }
      }, 900)
    } catch (submitError) {
      console.error('Unable to submit donation:', submitError)
      setError(submitError.message || 'Unable to submit the donation.')
    } finally {
      setSubmitting(false)
    }
  }

  if (pageLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingCard}>Loading donation form...</div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button
          type="button"
          onClick={() => navigate('/restaurant')}
          style={styles.back}
        >
          ← Back
        </button>

        <div style={styles.headerSub}>FoodBridge Detroit</div>
        <div style={styles.headerTitle}>Post Surplus</div>
      </div>

      <form onSubmit={handleSubmit} style={styles.body}>
        <div style={styles.assignmentCard}>
          <div style={styles.assignmentLabel}>Restaurant</div>
          <div style={styles.assignmentValue}>
            {restaurant?.name || restaurant?.email || 'Restaurant'}
          </div>

          <div style={{ ...styles.assignmentLabel, marginTop: 10 }}>
            Assigned shelter
          </div>
          <div style={styles.assignmentValue}>
            {shelter?.name || 'No shelter assigned'}
          </div>

          <div style={styles.assignmentDate}>Today</div>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {!assignment && (
          <button
            type="button"
            onClick={loadRestaurantAndAssignment}
            style={styles.retryButton}
          >
            Check assignment again
          </button>
        )}

        <Field
          label="Food items *"
          value={form.food_items}
          onChange={setField('food_items')}
          placeholder="e.g. Grilled chicken, rice, salad"
          disabled={!assignment || submitting}
        />

        <Field
          label="Quantity (portions) *"
          value={form.quantity}
          onChange={setField('quantity')}
          placeholder="e.g. 35"
          type="number"
          min="1"
          disabled={!assignment || submitting}
        />

        <Field
          label="Pickup window *"
          value={form.pickup_window}
          onChange={setField('pickup_window')}
          placeholder="e.g. 5:00 PM – 7:00 PM"
          disabled={!assignment || submitting}
        />

        <Field
          label="Prepared time"
          value={form.prepared_time}
          onChange={setField('prepared_time')}
          placeholder="e.g. 3:30 PM"
          disabled={!assignment || submitting}
        />

        <Field
          label="Safe until (expiration)"
          value={form.safe_until}
          onChange={setField('safe_until')}
          placeholder="e.g. 9:00 PM"
          disabled={!assignment || submitting}
        />

        <Field
          label="Temperature requirement"
          value={form.temperature_requirement}
          onChange={setField('temperature_requirement')}
          placeholder="e.g. Refrigerated, hot, or room temperature"
          disabled={!assignment || submitting}
        />

        <Field
          label="Allergen notes"
          value={form.allergen_notes}
          onChange={setField('allergen_notes')}
          placeholder="e.g. Nut-free, gluten-free"
          disabled={!assignment || submitting}
        />

        <button
          type="submit"
          style={{
            ...styles.submitButton,
            ...((!assignment || submitting)
              ? styles.submitButtonDisabled
              : {}),
          }}
          disabled={!assignment || submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Donation'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  disabled = false,
}) {
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.label}>{label}</label>

      <input
        type={type}
        min={min}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          ...styles.input,
          ...(disabled ? styles.inputDisabled : {}),
        }}
      />
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F4F8F4',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },

  header: {
    background: '#2C5F2D',
    padding: '16px 20px',
  },

  back: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '0 0 8px',
    display: 'block',
  },

  headerSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 750,
    color: '#FFFFFF',
  },

  body: {
    padding: '22px 16px 36px',
    maxWidth: 540,
    margin: '0 auto',
  },

  loadingCard: {
    maxWidth: 480,
    margin: '80px auto',
    padding: 24,
    background: '#FFFFFF',
    borderRadius: 14,
    textAlign: 'center',
    color: '#4B5563',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
  },

  assignmentCard: {
    position: 'relative',
    padding: '16px 18px',
    marginBottom: 18,
    background: '#FFFFFF',
    border: '1px solid #E2E8E2',
    borderRadius: 12,
    boxShadow: '0 7px 20px rgba(44, 95, 45, 0.06)',
  },

  assignmentLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  assignmentValue: {
    marginTop: 3,
    color: '#1F2937',
    fontSize: 14,
    fontWeight: 700,
  },

  assignmentDate: {
    position: 'absolute',
    top: 16,
    right: 18,
    background: '#EEF7EE',
    color: '#2C5F2D',
    padding: '5px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },

  error: {
    background: '#FEF2F2',
    color: '#991B1B',
    border: '1px solid #FECACA',
    padding: '11px 13px',
    borderRadius: 9,
    fontSize: 13,
    marginBottom: 14,
  },

  success: {
    background: '#ECFDF5',
    color: '#166534',
    border: '1px solid #BBF7D0',
    padding: '11px 13px',
    borderRadius: 9,
    fontSize: 13,
    marginBottom: 14,
  },

  retryButton: {
    width: '100%',
    background: '#FFFFFF',
    color: '#2C5F2D',
    border: '1px solid #A7C7A7',
    borderRadius: 9,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 650,
    cursor: 'pointer',
    marginBottom: 16,
  },

  fieldGroup: {
    marginBottom: 15,
  },

  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 650,
    color: '#111827',
    marginBottom: 6,
  },

  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 9,
    border: '1.5px solid #DDE4DD',
    fontSize: 13,
    color: '#111827',
    background: '#FFFFFF',
    boxSizing: 'border-box',
    outline: 'none',
  },

  inputDisabled: {
    background: '#F3F4F6',
    color: '#9CA3AF',
    cursor: 'not-allowed',
  },

  submitButton: {
    background: '#2C5F2D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 10,
    padding: '13px 16px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  },

  submitButtonDisabled: {
    opacity: 0.58,
    cursor: 'not-allowed',
  },
}
