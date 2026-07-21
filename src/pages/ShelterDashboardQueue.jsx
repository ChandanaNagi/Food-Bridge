import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const declineReasons = [
  'Outside our service area',
  'Unable to meet our current capacity',
  'Organization does not meet our requirements',
  'We already have sufficient partners',
  'Not a good operational fit',
  'Other',
]

export default function ShelterOrganizationQueue() {
  const navigate = useNavigate()

  const [shelter, setShelter] = useState(null)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [declineMatch, setDeclineMatch] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineNotes, setDeclineNotes] = useState('')

  useEffect(() => {
    loadPage()
  }, [])

  async function loadPage() {
    try {
      setLoading(true)
      setError('')

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) throw sessionError

      const user = session?.user

      if (!user) {
        navigate('/')
        return
      }

      const { data: shelterRow, error: shelterError } = await supabase
        .from('shelters')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (shelterError) throw shelterError

      if (!shelterRow) {
        throw new Error('No shelter profile was found for this account.')
      }

      setShelter(shelterRow)

      const { data: matchRows, error: matchError } = await supabase
        .from('organization_matches')
        .select('*, restaurants(*)')
        .eq('shelter_id', shelterRow.id)
        .order('created_at', { ascending: false })

      if (matchError) throw matchError

      setMatches(matchRows || [])
    } catch (err) {
      console.error('Shelter organization requests error:', err)
      setError(err.message || 'Organization requests could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const pending = useMemo(
    () =>
      matches.filter(
        (match) =>
          match.status === 'pending' &&
          match.shelter_decision === 'pending'
      ),
    [matches]
  )

  const waiting = useMemo(
    () =>
      matches.filter(
        (match) =>
          match.status === 'pending' &&
          match.shelter_decision === 'accepted'
      ),
    [matches]
  )

  const active = useMemo(
    () => matches.filter((match) => match.status === 'active'),
    [matches]
  )

  const declined = useMemo(
    () =>
      matches.filter(
        (match) =>
          match.status === 'declined' &&
          match.shelter_decision === 'declined'
      ),
    [matches]
  )

  async function acceptMatch(match) {
    try {
      setSavingId(match.id)
      setError('')
      setMessage('')

      const bothAccepted = match.restaurant_decision === 'accepted'

      const { error: updateError } = await supabase
        .from('organization_matches')
        .update({
          shelter_decision: 'accepted',
          shelter_decline_reason: null,
          shelter_decline_notes: null,
          status: bothAccepted ? 'active' : 'pending',
        })
        .eq('id', match.id)
        .eq('shelter_id', shelter.id)

      if (updateError) throw updateError

      setMessage(
        bothAccepted
          ? 'Request accepted. This partnership is now active.'
          : 'Request accepted. The partnership will become active after the restaurant accepts.'
      )

      await loadPage()
    } catch (err) {
      console.error('Accept request error:', err)
      setError(err.message || 'The request could not be accepted.')
    } finally {
      setSavingId(null)
    }
  }

  function openDecline(match) {
    setDeclineMatch(match)
    setDeclineReason('')
    setDeclineNotes('')
    setError('')
    setMessage('')
  }

  function closeDecline() {
    if (savingId) return
    setDeclineMatch(null)
    setDeclineReason('')
    setDeclineNotes('')
  }

  async function submitDecline() {
    if (!declineMatch) return

    if (!declineReason) {
      setError('Please select a decline reason.')
      return
    }

    if (declineReason === 'Other' && !declineNotes.trim()) {
      setError('Please enter additional details when Other is selected.')
      return
    }

    try {
      setSavingId(declineMatch.id)
      setError('')
      setMessage('')

      const { error: updateError } = await supabase
        .from('organization_matches')
        .update({
          shelter_decision: 'declined',
          shelter_decline_reason: declineReason,
          shelter_decline_notes:
            declineReason === 'Other' ? declineNotes.trim() : null,
          status: 'declined',
        })
        .eq('id', declineMatch.id)
        .eq('shelter_id', shelter.id)

      if (updateError) throw updateError

      setDeclineMatch(null)
      setMessage('The organization request was declined.')
      await loadPage()
    } catch (err) {
      console.error('Decline request error:', err)
      setError(err.message || 'The request could not be declined.')
    } finally {
      setSavingId(null)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.logo}>FB</div>
        <h2 style={{ margin: 0 }}>FoodBridge Detroit</h2>
        <p style={styles.muted}>Loading organization requests...</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.backButton} onClick={() => navigate('/shelter')}>
          ← Dashboard
        </button>

        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <div style={styles.role}>Shelter Portal</div>
        </div>

        <button style={styles.signOutButton} onClick={signOut}>
          Sign out
        </button>
      </header>

      <main style={styles.main}>
        <section style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>PARTNERSHIPS</div>
            <h1 style={styles.title}>Organization Requests</h1>
            <p style={styles.subtitle}>
              Review restaurants available to partner with{' '}
              <strong>{shelter?.name || 'your shelter'}</strong>.
            </p>
          </div>

          <div style={styles.stats}>
            <Stat value={pending.length} label="Needs response" />
            <Stat value={waiting.length} label="Waiting on restaurant" />
            <Stat value={active.length} label="Active partners" />
          </div>
        </section>

        {error && <div style={styles.error}>{error}</div>}
        {message && <div style={styles.success}>{message}</div>}

        <Section
          title="Requests awaiting your response"
          description="Accept a restaurant or decline the request and provide a reason."
        >
          {pending.length === 0 ? (
            <Empty text="There are no new restaurant requests right now." />
          ) : (
            <div style={styles.grid}>
              {pending.map((match) => (
                <OrganizationCard
                  key={match.id}
                  organization={match.restaurants}
                  badge="New request"
                  footer={
                    <div style={styles.actions}>
                      <button
                        style={styles.declineButton}
                        disabled={savingId === match.id}
                        onClick={() => openDecline(match)}
                      >
                        Decline
                      </button>

                      <button
                        style={styles.acceptButton}
                        disabled={savingId === match.id}
                        onClick={() => acceptMatch(match)}
                      >
                        {savingId === match.id ? 'Saving...' : 'Accept'}
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Waiting for shelter response"
          description="You accepted these requests. They remain pending until the restaurant also accepts."
        >
          {waiting.length === 0 ? (
            <Empty text="No partnerships are waiting for restaurant approval." />
          ) : (
            <div style={styles.grid}>
              {waiting.map((match) => (
                <OrganizationCard
                  key={match.id}
                  organization={match.restaurants}
                  badge="You accepted"
                  footer={
                    <div style={styles.waitingText}>
                      Waiting for restaurant acceptance
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Partner Restaurants"
          description="These restaurants have active partnerships with your shelter."
        >
          {active.length === 0 ? (
            <Empty text="You do not have any active restaurant partners yet." />
          ) : (
            <div style={styles.grid}>
              {active.map((match) => (
                <OrganizationCard
                  key={match.id}
                  organization={match.restaurants}
                  badge="Active partner"
                  footer={<div style={styles.activeText}>✓ Partnership active</div>}
                />
              ))}
            </div>
          )}
        </Section>

        {declined.length > 0 && (
          <Section
            title="Declined requests"
            description="Requests declined by your shelter are shown here for reference."
          >
            <div style={styles.grid}>
              {declined.map((match) => (
                <OrganizationCard
                  key={match.id}
                  organization={match.restaurants}
                  badge="Declined"
                  footer={
                    <div style={styles.reasonBox}>
                      <strong>Reason:</strong>{' '}
                      {match.shelter_decline_reason || 'Not provided'}
                      {match.shelter_decline_reason === 'Other' &&
                        match.shelter_decline_notes && (
                          <div style={{ marginTop: 6 }}>
                            {match.shelter_decline_notes}
                          </div>
                        )}
                    </div>
                  }
                />
              ))}
            </div>
          </Section>
        )}
      </main>

      {declineMatch && (
        <div style={styles.modalBackdrop} onMouseDown={closeDecline}>
          <div
            style={styles.modal}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.eyebrowDark}>DECLINE REQUEST</div>
                <h2 style={{ margin: '5px 0 0' }}>
                  Decline {declineMatch.restaurants?.name || 'this restaurant'}?
                </h2>
              </div>

              <button style={styles.closeButton} onClick={closeDecline}>
                ×
              </button>
            </div>

            <label style={styles.label}>
              Reason <span style={styles.required}>*</span>
            </label>

            <select
              style={styles.input}
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
            >
              <option value="">Select a reason</option>
              {declineReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>

            {declineReason === 'Other' && (
              <>
                <label style={styles.label}>
                  Additional details <span style={styles.required}>*</span>
                </label>

                <textarea
                  style={{ ...styles.input, minHeight: 110, resize: 'vertical' }}
                  value={declineNotes}
                  onChange={(event) => setDeclineNotes(event.target.value)}
                  placeholder="Explain why your shelter is declining this partnership."
                />
              </>
            )}

            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={closeDecline}>
                Cancel
              </button>

              <button
                style={styles.confirmDeclineButton}
                disabled={savingId === declineMatch.id}
                onClick={submitDecline}
              >
                {savingId === declineMatch.id
                  ? 'Submitting...'
                  : 'Submit decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <p style={styles.sectionDescription}>{description}</p>
      {children}
    </section>
  )
}

function Stat({ value, label }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

function Empty({ text }) {
  return <div style={styles.empty}>{text}</div>
}

function OrganizationCard({ organization, badge, footer }) {
  return (
    <article style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.avatar}>{getInitials(organization?.name)}</div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={styles.badge}>{badge}</div>
          <h3 style={styles.cardTitle}>{organization?.name || 'Restaurant'}</h3>
        </div>
      </div>

      <div style={styles.details}>
        {organization?.address && (
          <Detail label="Address" value={organization.address} />
        )}
        {organization?.phone && (
          <Detail label="Phone" value={organization.phone} />
        )}
        {organization?.email && (
          <Detail label="Email" value={organization.email} />
        )}

        {!organization?.address &&
          !organization?.phone &&
          !organization?.email && (
            <div style={styles.muted}>No additional profile details available.</div>
          )}
      </div>

      {footer}
    </article>
  )
}

function Detail({ label, value }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  )
}

function getInitials(name) {
  if (!name) return 'RT'

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f7f3',
    color: '#18352b',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  loadingPage: {
    minHeight: '100vh',
    display: 'grid',
    placeContent: 'center',
    justifyItems: 'center',
    gap: 10,
    background: '#f5f7f3',
    color: '#18352b',
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 16,
    display: 'grid',
    placeItems: 'center',
    background: '#236b4b',
    color: '#fff',
    fontWeight: 900,
  },
  header: {
    minHeight: 76,
    padding: '0 5vw',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 16,
    background: '#fff',
    borderBottom: '1px solid #dfe7df',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  backButton: {
    justifySelf: 'start',
    border: 0,
    background: 'transparent',
    color: '#236b4b',
    fontWeight: 800,
    cursor: 'pointer',
  },
  brand: { textAlign: 'center', fontWeight: 900, fontSize: 17 },
  role: { textAlign: 'center', fontSize: 12, color: '#6b7d75' },
  signOutButton: {
    justifySelf: 'end',
    border: '1px solid #d8e2da',
    background: '#fff',
    color: '#4a5e55',
    padding: '9px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },
  main: {
    width: 'min(1180px, 92vw)',
    margin: '0 auto',
    padding: '38px 0 70px',
  },
  hero: {
    background: 'linear-gradient(135deg, #164d38, #2b7b57)',
    color: '#fff',
    borderRadius: 24,
    padding: 34,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 28,
    flexWrap: 'wrap',
    boxShadow: '0 16px 45px rgba(24, 83, 59, 0.18)',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.12em',
    opacity: 0.82,
  },
  eyebrowDark: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.12em',
    color: '#39705a',
  },
  title: { margin: '8px 0', fontSize: 'clamp(30px, 5vw, 46px)' },
  subtitle: { margin: 0, maxWidth: 620, lineHeight: 1.6, opacity: 0.92 },
  stats: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: {
    minWidth: 125,
    padding: '16px 18px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.13)',
    border: '1px solid rgba(255,255,255,0.18)',
  },
  statValue: { fontSize: 28, fontWeight: 900 },
  statLabel: { fontSize: 12, opacity: 0.88, marginTop: 3 },
  error: {
    marginTop: 20,
    padding: '13px 16px',
    borderRadius: 12,
    background: '#fff0f0',
    border: '1px solid #f0c5c5',
    color: '#9b2f2f',
  },
  success: {
    marginTop: 20,
    padding: '13px 16px',
    borderRadius: 12,
    background: '#ecf8f0',
    border: '1px solid #bfe1ca',
    color: '#24633e',
  },
  section: { marginTop: 36 },
  sectionTitle: { margin: 0, fontSize: 24 },
  sectionDescription: {
    margin: '6px 0 16px',
    color: '#6a7c74',
    lineHeight: 1.55,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 18,
  },
  card: {
    background: '#fff',
    border: '1px solid #dde5df',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 8px 24px rgba(30, 70, 52, 0.06)',
  },
  cardTop: { display: 'flex', gap: 14, alignItems: 'center' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 15,
    display: 'grid',
    placeItems: 'center',
    background: '#e7f2eb',
    color: '#236b4b',
    fontWeight: 900,
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: 999,
    background: '#edf4ef',
    color: '#396d52',
    fontSize: 11,
    fontWeight: 900,
  },
  cardTitle: { margin: '7px 0 0', fontSize: 19 },
  details: {
    margin: '18px 0',
    padding: 14,
    background: '#f8faf8',
    borderRadius: 12,
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr',
    gap: 10,
    padding: '5px 0',
    fontSize: 13,
  },
  detailLabel: { color: '#75877e', fontWeight: 800 },
  detailValue: { color: '#334b40', overflowWrap: 'anywhere' },
  muted: { color: '#74857d' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  declineButton: {
    padding: '10px 15px',
    borderRadius: 10,
    border: '1px solid #e1b8b8',
    background: '#fff',
    color: '#a13d3d',
    fontWeight: 900,
    cursor: 'pointer',
  },
  acceptButton: {
    padding: '10px 17px',
    borderRadius: 10,
    border: 0,
    background: '#236b4b',
    color: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  waitingText: {
    padding: '10px 12px',
    borderRadius: 10,
    background: '#fff7df',
    color: '#80621f',
    fontWeight: 800,
    fontSize: 13,
  },
  activeText: {
    padding: '10px 12px',
    borderRadius: 10,
    background: '#eaf7ee',
    color: '#2c6b43',
    fontWeight: 900,
    fontSize: 13,
  },
  reasonBox: {
    padding: '10px 12px',
    borderRadius: 10,
    background: '#fff1f1',
    color: '#8b4141',
    fontSize: 13,
    lineHeight: 1.5,
  },
  empty: {
    padding: 28,
    borderRadius: 16,
    border: '1px dashed #ccd8cf',
    background: '#fafcf9',
    color: '#718079',
    textAlign: 'center',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'grid',
    placeItems: 'center',
    padding: 20,
    background: 'rgba(19, 40, 31, 0.55)',
  },
  modal: {
    width: 'min(520px, 100%)',
    boxSizing: 'border-box',
    background: '#fff',
    borderRadius: 20,
    padding: 24,
    boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    marginBottom: 22,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: 0,
    background: '#f0f3f1',
    fontSize: 24,
    cursor: 'pointer',
  },
  label: {
    display: 'block',
    margin: '15px 0 7px',
    fontSize: 13,
    fontWeight: 900,
  },
  required: { color: '#b33f3f' },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    border: '1px solid #ced9d1',
    borderRadius: 11,
    background: '#fff',
    color: '#243d32',
    font: 'inherit',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 22,
  },
  cancelButton: {
    padding: '10px 15px',
    borderRadius: 10,
    border: '1px solid #d4ddd7',
    background: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  confirmDeclineButton: {
    padding: '10px 15px',
    borderRadius: 10,
    border: 0,
    background: '#a64242',
    color: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
  },
}
