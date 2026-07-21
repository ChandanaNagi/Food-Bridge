import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const DECLINE_REASONS = [
  'At capacity — cannot receive more food',
  'No transportation available for pickup',
  'Food type does not match our needs',
  'Pickup window does not work for us',
  'Other',
]

export default function DonationDetail() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [donation, setDonation] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [otherReason, setOtherReason] = useState('')

  useEffect(() => {
    loadDonation()
  }, [id])

  const loadDonation = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      if (!id) throw new Error('No donation ID was provided.')

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) {
        navigate('/')
        return
      }

      const { data: donationData, error: donationError } = await supabase
        .from('donations')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (donationError) throw donationError
      if (!donationData) throw new Error('Donation not found.')

      setDonation(donationData)

      if (donationData.restaurant_id) {
        const { data: restaurantData, error: restaurantError } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', donationData.restaurant_id)
          .maybeSingle()

        if (restaurantError) {
          console.warn('Restaurant details could not be loaded:', restaurantError)
        } else {
          setRestaurant(restaurantData)
        }
      }
    } catch (error) {
      console.error('Donation detail error:', error)
      setErrorMessage(error.message || 'The donation could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const status = String(donation?.status || 'posted').toLowerCase()

  const statusInfo = useMemo(() => {
    const map = {
      posted: { label: 'Available', background: '#FFF7E6', color: '#9A6700', border: '#F5D38A' },
      confirmed: { label: 'Accepted', background: '#EAF5EA', color: '#245025', border: '#B9D9BA' },
      accepted: { label: 'Accepted', background: '#EAF5EA', color: '#245025', border: '#B9D9BA' },
      declined: { label: 'Declined', background: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
      completed: { label: 'Completed', background: '#E8F3FF', color: '#1D4E89', border: '#B8D8F8' },
      collected: { label: 'Collected', background: '#E8F3FF', color: '#1D4E89', border: '#B8D8F8' },
      expired: { label: 'Expired', background: '#F3F4F6', color: '#4B5563', border: '#D1D5DB' },
    }

    return map[status] || {
      label: titleCase(status),
      background: '#F3F4F6',
      color: '#4B5563',
      border: '#D1D5DB',
    }
  }, [status])

  const canRespond = status === 'posted'
  const estimatedMeals = Number(donation?.quantity) || 0

  const updateAssignmentStatus = async (newStatus) => {
    if (!donation?.assignment_id) return

    const { error } = await supabase
      .from('assignments')
      .update({ status: newStatus })
      .eq('id', donation.assignment_id)

    if (error) throw error
  }

  const handleAccept = async () => {
    if (!donation || !canRespond) return

    setActing(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const { error } = await supabase
        .from('donations')
        .update({ status: 'confirmed', decline_reason: null })
        .eq('id', donation.id)

      if (error) throw error

      await updateAssignmentStatus('confirmed')

      setDonation((current) => ({
        ...current,
        status: 'confirmed',
        decline_reason: null,
      }))
      setSuccessMessage('Donation accepted successfully. Please collect it within the pickup window.')
    } catch (error) {
      console.error('Accept donation error:', error)
      setErrorMessage(error.message || 'The donation could not be accepted.')
    } finally {
      setActing(false)
    }
  }

  const handleDecline = async () => {
    const finalReason = declineReason === 'Other' ? otherReason.trim() : declineReason

    if (!finalReason) {
      setErrorMessage('Please select or enter a reason for declining.')
      return
    }

    setActing(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const { error } = await supabase
        .from('donations')
        .update({ status: 'declined', decline_reason: finalReason })
        .eq('id', donation.id)

      if (error) throw error

      await updateAssignmentStatus('reassigning')

      setDonation((current) => ({
        ...current,
        status: 'declined',
        decline_reason: finalReason,
      }))
      setShowDeclineModal(false)
      setSuccessMessage('Donation declined. The restaurant can now post another surplus offer.')
    } catch (error) {
      console.error('Decline donation error:', error)
      setErrorMessage(error.message || 'The donation could not be declined.')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return <div style={styles.centerPage}>Loading donation details...</div>
  }

  if (errorMessage && !donation) {
    return (
      <div style={styles.centerPage}>
        <div style={styles.errorCard}>
          <div style={styles.errorTitle}>Unable to open donation</div>
          <div style={styles.errorText}>{errorMessage}</div>
          <button type="button" onClick={() => navigate('/shelter')} style={styles.primaryButton}>
            Return to Shelter Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <button type="button" onClick={() => navigate('/shelter')} style={styles.backButton}>
            ← Back to dashboard
          </button>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <div style={styles.headerTitle}>Donation Details</div>
        </div>
      </header>

      <main style={styles.main}>
        {errorMessage && <Message type="error">{errorMessage}</Message>}
        {successMessage && <Message type="success">{successMessage}</Message>}

        <section style={styles.heroCard}>
          <div style={styles.heroTop}>
            <div>
              <div style={styles.eyebrow}>Incoming food donation</div>
              <h1 style={styles.donationTitle}>{donation.food_items || 'Food donation'}</h1>
              <div style={styles.restaurantName}>{restaurant?.name || 'Restaurant'}</div>
            </div>
            <span
              style={{
                ...styles.statusBadge,
                background: statusInfo.background,
                color: statusInfo.color,
                borderColor: statusInfo.border,
              }}
            >
              {statusInfo.label}
            </span>
          </div>

          <div style={styles.impactGrid}>
            <ImpactItem value={donation.quantity || '—'} label="Portions available" />
            <ImpactItem value={estimatedMeals || '—'} label="Estimated meals" />
            <ImpactItem value={donation.pickup_window || 'TBD'} label="Pickup window" compact />
          </div>
        </section>

        <div style={styles.twoColumnGrid}>
          <section style={styles.card}>
            <SectionTitle icon="🍱" title="Food information" />
            <DetailRow label="Food items" value={donation.food_items} />
            <DetailRow label="Quantity" value={donation.quantity ? `${donation.quantity} portions` : 'Not specified'} />
            <DetailRow label="Prepared time" value={donation.prepared_time || 'Not specified'} />
            <DetailRow label="Safe until" value={donation.safe_until || 'Not specified'} />
            <DetailRow label="Temperature" value={donation.temperature_requirement || 'Not specified'} />
            <DetailRow label="Allergens" value={donation.allergen_notes || 'None noted'} last />
          </section>

          <section style={styles.card}>
            <SectionTitle icon="📍" title="Pickup information" />
            <DetailRow label="Restaurant" value={restaurant?.name || 'Not available'} />
            <DetailRow label="Pickup window" value={donation.pickup_window || 'Not specified'} />
            <DetailRow label="Address" value={firstValue(restaurant, ['address', 'street_address', 'location']) || 'Not available'} />
            <DetailRow label="Phone" value={firstValue(restaurant, ['phone', 'phone_number', 'contact_phone']) || 'Not available'} />
            <DetailRow label="Email" value={restaurant?.email || 'Not available'} last />
          </section>
        </div>

        <section style={styles.card}>
          <SectionTitle icon="✓" title="Donation progress" />
          <div style={styles.timeline}>
            <TimelineStep title="Donation posted" active />
            <TimelineConnector active={status !== 'posted'} />
            <TimelineStep
              title={status === 'declined' ? 'Donation declined' : 'Shelter response'}
              active={status !== 'posted'}
              current={status === 'posted'}
            />
            <TimelineConnector active={['completed', 'collected'].includes(status)} />
            <TimelineStep
              title="Pickup completed"
              active={['completed', 'collected'].includes(status)}
              current={['confirmed', 'accepted'].includes(status)}
            />
          </div>

          {donation.decline_reason && (
            <div style={styles.declineBox}>
              <strong>Decline reason:</strong> {donation.decline_reason}
            </div>
          )}
        </section>

        {canRespond && (
          <section style={styles.actionCard}>
            <div>
              <div style={styles.actionTitle}>Can your shelter collect this donation?</div>
              <div style={styles.actionSubtext}>Please respond so the restaurant knows whether to prepare for pickup.</div>
            </div>
            <div style={styles.actionButtons}>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('')
                  setShowDeclineModal(true)
                }}
                disabled={acting}
                style={styles.outlineButton}
              >
                Decline
              </button>
              <button type="button" onClick={handleAccept} disabled={acting} style={styles.primaryButton}>
                {acting ? 'Saving...' : 'Accept Donation'}
              </button>
            </div>
          </section>
        )}

        {!canRespond && (
          <div style={styles.closedNotice}>
            This donation has already been {statusInfo.label.toLowerCase()}.
          </div>
        )}
      </main>

      {showDeclineModal && (
        <div style={styles.modalOverlay} role="presentation" onMouseDown={() => !acting && setShowDeclineModal(false)}>
          <div style={styles.modal} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div style={styles.modalTitle}>Decline donation</div>
            <div style={styles.modalSubtitle}>Select the reason your shelter cannot accept this donation.</div>

            <div style={styles.reasonList}>
              {DECLINE_REASONS.map((reason) => (
                <label key={reason} style={{ ...styles.reasonOption, ...(declineReason === reason ? styles.reasonSelected : {}) }}>
                  <input
                    type="radio"
                    name="declineReason"
                    value={reason}
                    checked={declineReason === reason}
                    onChange={(event) => setDeclineReason(event.target.value)}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            {declineReason === 'Other' && (
              <textarea
                value={otherReason}
                onChange={(event) => setOtherReason(event.target.value)}
                placeholder="Enter the reason"
                rows={3}
                style={styles.textarea}
              />
            )}

            <div style={styles.modalButtons}>
              <button type="button" onClick={() => setShowDeclineModal(false)} disabled={acting} style={styles.outlineButton}>
                Cancel
              </button>
              <button type="button" onClick={handleDecline} disabled={acting} style={styles.dangerButton}>
                {acting ? 'Saving...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon, title }) {
  return (
    <div style={styles.sectionTitle}>
      <span style={styles.sectionIcon}>{icon}</span>
      <span>{title}</span>
    </div>
  )
}

function DetailRow({ label, value, last = false }) {
  return (
    <div style={{ ...styles.detailRow, ...(last ? styles.detailRowLast : {}) }}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value || 'Not specified'}</span>
    </div>
  )
}

function ImpactItem({ value, label, compact = false }) {
  return (
    <div style={styles.impactItem}>
      <div style={{ ...styles.impactValue, ...(compact ? styles.impactValueCompact : {}) }}>{value}</div>
      <div style={styles.impactLabel}>{label}</div>
    </div>
  )
}

function TimelineStep({ title, active = false, current = false }) {
  return (
    <div style={styles.timelineStep}>
      <div style={{ ...styles.timelineDot, ...(active ? styles.timelineDotActive : {}), ...(current ? styles.timelineDotCurrent : {}) }}>
        {active ? '✓' : ''}
      </div>
      <div style={{ ...styles.timelineText, ...(active || current ? styles.timelineTextActive : {}) }}>{title}</div>
    </div>
  )
}

function TimelineConnector({ active = false }) {
  return <div style={{ ...styles.timelineConnector, ...(active ? styles.timelineConnectorActive : {}) }} />
}

function Message({ type, children }) {
  const isError = type === 'error'
  return (
    <div style={{ ...styles.message, ...(isError ? styles.messageError : styles.messageSuccess) }}>
      {children}
    </div>
  )
}

function firstValue(object, keys) {
  if (!object) return null
  for (const key of keys) {
    if (object[key]) return object[key]
  }
  return null
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F3F7F3',
    color: '#172019',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  centerPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: '#F3F7F3',
    color: '#5B665D',
    fontFamily: 'system-ui, sans-serif',
  },
  header: { background: 'linear-gradient(135deg, #214D2A, #34713A)', color: '#fff' },
  headerInner: { maxWidth: 1040, margin: '0 auto', padding: '22px 20px 24px' },
  backButton: { background: 'transparent', border: 0, color: 'rgba(255,255,255,.8)', padding: 0, cursor: 'pointer', fontSize: 13, marginBottom: 13 },
  brand: { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.68)', marginBottom: 3 },
  headerTitle: { fontSize: 24, fontWeight: 750 },
  main: { maxWidth: 1040, margin: '0 auto', padding: '22px 20px 48px' },
  heroCard: { background: '#fff', border: '1px solid #E0E8E1', borderRadius: 18, padding: 22, boxShadow: '0 8px 28px rgba(35,73,41,.08)', marginBottom: 18 },
  heroTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' },
  eyebrow: { color: '#728075', fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.06em' },
  donationTitle: { margin: '5px 0 3px', fontSize: 'clamp(22px, 4vw, 32px)', lineHeight: 1.15, color: '#172019' },
  restaurantName: { color: '#617064', fontSize: 14 },
  statusBadge: { border: '1px solid', borderRadius: 999, padding: '6px 11px', fontSize: 12, fontWeight: 750, whiteSpace: 'nowrap' },
  impactGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 20 },
  impactItem: { background: '#F6F9F6', border: '1px solid #E4EBE5', borderRadius: 12, padding: '14px 15px' },
  impactValue: { color: '#214D2A', fontSize: 25, fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere' },
  impactValueCompact: { fontSize: 17 },
  impactLabel: { color: '#728075', fontSize: 11, marginTop: 4 },
  twoColumnGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 18 },
  card: { background: '#fff', border: '1px solid #E0E8E1', borderRadius: 16, padding: 19, boxShadow: '0 5px 20px rgba(35,73,41,.055)', marginBottom: 18 },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 760, marginBottom: 12, color: '#233127' },
  sectionIcon: { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#EEF5EE', borderRadius: 8, fontSize: 14 },
  detailRow: { display: 'grid', gridTemplateColumns: 'minmax(110px, .7fr) minmax(140px, 1.3fr)', gap: 15, padding: '11px 0', borderBottom: '1px solid #EDF1ED' },
  detailRowLast: { borderBottom: 0, paddingBottom: 0 },
  detailLabel: { color: '#738076', fontSize: 12 },
  detailValue: { color: '#27332A', fontSize: 13, fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' },
  timeline: { display: 'flex', alignItems: 'flex-start', width: '100%', overflowX: 'auto', padding: '8px 2px 5px' },
  timelineStep: { minWidth: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  timelineDot: { width: 28, height: 28, borderRadius: '50%', border: '2px solid #D6DED7', background: '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 },
  timelineDotActive: { background: '#2C6533', borderColor: '#2C6533' },
  timelineDotCurrent: { borderColor: '#D49A22', boxShadow: '0 0 0 4px #FFF4D8' },
  timelineText: { marginTop: 8, color: '#8A958C', fontSize: 12, lineHeight: 1.35 },
  timelineTextActive: { color: '#324137', fontWeight: 650 },
  timelineConnector: { height: 2, background: '#DCE3DD', flex: 1, minWidth: 44, marginTop: 13 },
  timelineConnectorActive: { background: '#2C6533' },
  declineBox: { marginTop: 16, background: '#FFF5F5', border: '1px solid #FED7D7', color: '#8E3030', borderRadius: 10, padding: '11px 13px', fontSize: 13 },
  actionCard: { background: '#244F2B', color: '#fff', borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap', boxShadow: '0 8px 26px rgba(33,77,42,.18)' },
  actionTitle: { fontSize: 16, fontWeight: 750 },
  actionSubtext: { color: 'rgba(255,255,255,.72)', fontSize: 12, marginTop: 4 },
  actionButtons: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  primaryButton: { background: '#2C6533', color: '#fff', border: 0, borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  outlineButton: { background: '#fff', color: '#275B2E', border: '1px solid #BFD1C1', borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  dangerButton: { background: '#B23A3A', color: '#fff', border: 0, borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  closedNotice: { background: '#fff', border: '1px solid #E0E8E1', color: '#5E6D61', borderRadius: 12, padding: 14, textAlign: 'center', fontSize: 13 },
  message: { borderRadius: 10, padding: '11px 13px', marginBottom: 14, fontSize: 13 },
  messageError: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' },
  messageSuccess: { background: '#ECFDF3', border: '1px solid #BBF7D0', color: '#166534' },
  errorCard: { background: '#fff', border: '1px solid #E2E8E3', borderRadius: 15, padding: 22, width: '100%', maxWidth: 430, boxShadow: '0 8px 30px rgba(0,0,0,.07)' },
  errorTitle: { color: '#932F2F', fontWeight: 750, fontSize: 17, marginBottom: 7 },
  errorText: { color: '#68736A', fontSize: 13, marginBottom: 15 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(16,28,19,.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 1000 },
  modal: { width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 17, padding: 21, boxShadow: '0 20px 60px rgba(0,0,0,.24)' },
  modalTitle: { color: '#1E2B21', fontSize: 18, fontWeight: 780 },
  modalSubtitle: { color: '#707C73', fontSize: 13, marginTop: 5, marginBottom: 14 },
  reasonList: { display: 'grid', gap: 8 },
  reasonOption: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #E1E7E2', borderRadius: 10, padding: '10px 11px', fontSize: 13, cursor: 'pointer' },
  reasonSelected: { borderColor: '#71A477', background: '#F0F7F1' },
  textarea: { width: '100%', boxSizing: 'border-box', marginTop: 11, border: '1px solid #D7DFD8', borderRadius: 10, padding: 11, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 },
  modalButtons: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 17 },
}