import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const DECLINE_REASONS = [
  'At capacity — cannot receive more food',
  'No transportation available for pickup',
  'Food type does not match our needs',
  'Pickup window does not work for us',
  'Other',
]

export default function ShelterDashboard() {
  const navigate = useNavigate()

  const [shelter, setShelter] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [donation, setDonation] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])
  const [activeSection, setActiveSection] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(false)
  const [error, setError] = useState('')

  // Decline reason picker state
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [otherReason, setOtherReason] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError('')

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

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
        setError('No shelter profile was found for this account.')
        return
      }

      setShelter(shelterRow)

      const today = getTodayValue()

      const { data: assignmentRow, error: assignmentError } = await supabase
        .from('assignments')
        .select('*, restaurants(*)')
        .eq('shelter_id', shelterRow.id)
        .eq('assignment_date', today)
        .maybeSingle()

      if (assignmentError) throw assignmentError
      setAssignment(assignmentRow || null)

      if (assignmentRow) {
        const { data: donationRows, error: donationError } = await supabase
          .from('donations')
          .select('*')
          .eq('assignment_id', assignmentRow.id)
          .order('posted_at', { ascending: false })
          .limit(1)

        if (donationError) throw donationError

        const latestDonation =
          donationRows && donationRows.length > 0 ? donationRows[0] : null

        setDonation(latestDonation)

        if (latestDonation?.status === 'posted') {
          await ensureDonationNotification({
            shelterId: shelterRow.id,
            donation: latestDonation,
            restaurantName:
              assignmentRow.restaurants?.name || 'A restaurant partner',
          })
        }
      } else {
        setDonation(null)
      }

      const { data: futureRows, error: futureError } = await supabase
        .from('assignments')
        .select('*, restaurants(*)')
        .eq('shelter_id', shelterRow.id)
        .gt('assignment_date', today)
        .order('assignment_date', { ascending: true })
        .limit(8)

      if (futureError) throw futureError
      setUpcoming(futureRows || [])

      const { data: notificationData, error: notificationError } =
        await supabase
          .from('notifications')
          .select('id,shelter_id,donation_id,title,message,read,created_at')
          .eq('shelter_id', shelterRow.id)
          .order('created_at', { ascending: false })
          .limit(20)

      if (notificationError) throw notificationError
      setNotifications(notificationData || [])

      const { data: historyRows, error: historyError } = await supabase
        .from('donations')
        .select('*, assignments(assignment_date, restaurants(name))')
        .eq('shelter_id', shelterRow.id)
        .order('posted_at', { ascending: false })
        .limit(20)

      if (historyError) throw historyError
      setHistory(historyRows || [])
    } catch (err) {
      console.error('Shelter dashboard error:', err)
      setError(err.message || 'The shelter dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const ensureDonationNotification = async ({
    shelterId,
    donation,
    restaurantName,
  }) => {
    const { data: existing, error: existingError } = await supabase
      .from('notifications')
      .select('id')
      .eq('donation_id', donation.id)
      .eq('shelter_id', shelterId)
      .limit(1)

    if (existingError) throw existingError

    if (!existing || existing.length === 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          shelter_id: shelterId,
          donation_id: donation.id,
          title: 'New donation available',
          message: `${restaurantName} posted ${donation.quantity || 0} portions${
            donation.pickup_window
              ? `. Pickup window: ${donation.pickup_window}.`
              : '.'
          }`,
          read: false,
        })

      if (insertError) throw insertError
    }
  }

  const handleResponse = async (status, reason = null) => {
    if (!donation) return

    try {
      setResponding(true)
      setError('')

      const { error: updateError } = await supabase
        .from('donations')
        .update({
          status,
          decline_reason: reason,
        })
        .eq('id', donation.id)

      if (updateError) throw updateError
      await loadDashboard()
    } catch (err) {
      console.error('Donation response error:', err)
      setError(err.message || 'Your response could not be saved.')
    } finally {
      setResponding(false)
    }
  }

  const openDeclineModal = () => {
    setDeclineReason('')
    setOtherReason('')
    setError('')
    setShowDeclineModal(true)
  }

  const closeDeclineModal = () => {
    if (responding) return
    setShowDeclineModal(false)
  }

  const submitDecline = async () => {
    const finalReason =
      declineReason === 'Other' ? otherReason.trim() : declineReason

    if (!finalReason) {
      setError('Please select or enter a reason for declining.')
      return
    }

    await handleResponse('declined', finalReason)
    setShowDeclineModal(false)
  }

  const handleMarkCollected = async () => {
    if (!donation) return

    try {
      setResponding(true)
      setError('')

      const { error: updateError } = await supabase
        .from('donations')
        .update({ status: 'collected' })
        .eq('id', donation.id)

      if (updateError) throw updateError
      await loadDashboard()
    } catch (err) {
      console.error('Collection update error:', err)
      setError(err.message || 'The pickup could not be marked collected.')
    } finally {
      setResponding(false)
    }
  }

  const markAllRead = async () => {
    if (!shelter) return

    try {
      const { error: readError } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('shelter_id', shelter.id)
        .eq('read', false)

      if (readError) throw readError

      setNotifications((current) =>
        current.map((notification) => ({ ...notification, read: true }))
      )
    } catch (err) {
      console.error('Notification update error:', err)
      setError(err.message || 'Notifications could not be marked as read.')
    }
  }

  const openSection = (section) => {
    setActiveSection(section)
    setMenuOpen(false)

    if (section === 'notifications') {
      markAllRead()
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.read
  ).length

  const completedDonations = history.filter(
    (item) => item.status === 'completed'
  )

  const activePickups = history.filter((item) =>
    ['posted', 'confirmed', 'accepted', 'collected'].includes(item.status)
  )

  const portionsReceived = completedDonations.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  )

  const nextAssignment = upcoming[0] || null

  const dashboardNotifications = useMemo(
    () =>
      buildDashboardNotifications({
        assignment,
        donation,
        nextAssignment,
        databaseNotifications: notifications,
      }),
    [assignment, donation, nextAssignment, notifications]
  )

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.loadingLogo}>FB</div>
        <div style={styles.loadingTitle}>FoodBridge Detroit</div>
        <div style={styles.loadingText}>Loading shelter portal...</div>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <style>{responsiveCss}</style>

      <header className="fb-mobile-header" style={styles.mobileHeader}>
        <button
          type="button"
          style={styles.mobileMenuButton}
          onClick={() => setMenuOpen((current) => !current)}
          aria-label="Open navigation"
        >
          ☰
        </button>

        <div>
          <div style={styles.mobileBrand}>FoodBridge</div>
          <div style={styles.mobileRole}>Shelter Portal</div>
        </div>

        <button
          type="button"
          style={styles.mobileNotificationButton}
          onClick={() => openSection('notifications')}
        >
          🔔
          {unreadCount > 0 && (
            <span style={styles.notificationCount}>{unreadCount}</span>
          )}
        </button>
      </header>

      <aside
        className={`fb-sidebar ${menuOpen ? 'fb-sidebar-open' : ''}`}
        style={styles.sidebar}
      >
        <div style={styles.logoRow}>
          <div style={styles.logo}>FB</div>
          <div>
            <div style={styles.brandName}>FoodBridge</div>
            <div style={styles.brandLocation}>Detroit</div>
          </div>
        </div>

        <div style={styles.organizationIdentity}>
          <div style={styles.organizationAvatar}>
            {getInitials(shelter?.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={styles.organizationName}>
              {shelter?.name || 'Shelter'}
            </div>
            <div style={styles.organizationType}>Shelter account</div>
          </div>
        </div>

        <nav style={styles.navigation}>
          <NavButton
            icon="⌂"
            label="Dashboard"
            active={activeSection === 'dashboard'}
            onClick={() => openSection('dashboard')}
          />
          <NavButton
            icon="▣"
            label="Current Pickup"
            active={activeSection === 'pickup'}
            onClick={() => openSection('pickup')}
          />
          <NavButton
            icon="□"
            label="Pickup Schedule"
            active={activeSection === 'schedule'}
            onClick={() => openSection('schedule')}
          />
          <NavButton
            icon="◉"
            label="Assigned Restaurant"
            active={activeSection === 'restaurant'}
            onClick={() => openSection('restaurant')}
          />
          <NavButton
            icon="▥"
            label="Donation History"
            active={activeSection === 'history'}
            onClick={() => openSection('history')}
          />
          <NavButton
            icon="◫"
            label="Notifications"
            active={activeSection === 'notifications'}
            onClick={() => openSection('notifications')}
            count={unreadCount}
          />
          <NavButton
            icon="⚙"
            label="Organization Requests"
            active={false}
            onClick={() => navigate('/shelter/organizations')}
          />
          <NavButton
            icon="⚙"
            label="Shelter Profile"
            active={activeSection === 'profile'}
            onClick={() => openSection('profile')}
          />
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.supportCard}>
            <div style={styles.supportIcon}>?</div>
            <div style={styles.supportTitle}>Pickup problem?</div>
            <div style={styles.supportText}>
              Contact FoodBridge support to report a missed, delayed or unsafe
              donation.
            </div>
            <button type="button" style={styles.supportButton}>
              Contact support
            </button>
          </div>

          <button
            type="button"
            style={styles.signOutButton}
            onClick={handleSignOut}
          >
            ↪ Sign out
          </button>
        </div>
      </aside>

      {menuOpen && (
        <div
          className="fb-overlay"
          style={styles.mobileOverlay}
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main className="fb-main" style={styles.main}>
        <div className="fb-topbar" style={styles.topBar}>
          <div>
            <div style={styles.pageEyebrow}>Shelter management portal</div>
            <h1 style={styles.pageTitle}>{sectionTitle(activeSection)}</h1>
            <p style={styles.pageSubtitle}>
              {sectionSubtitle(activeSection)}
            </p>
          </div>

          <div style={styles.topBarActions}>
            <button
              type="button"
              style={styles.topNotificationButton}
              onClick={() => openSection('notifications')}
            >
              🔔
              {unreadCount > 0 && (
                <span style={styles.notificationCount}>{unreadCount}</span>
              )}
            </button>

            <div style={styles.topProfile}>
              <div style={styles.topProfileAvatar}>
                {getInitials(shelter?.name)}
              </div>
              <div>
                <div style={styles.topProfileName}>{shelter?.name}</div>
                <div style={styles.topProfileRole}>Shelter coordinator</div>
              </div>
            </div>
          </div>
        </div>

        <div className="fb-content" style={styles.content}>
          {error && (
            <div style={styles.errorBanner}>
              <div>
                <strong>Something needs attention.</strong>
                <div style={styles.errorMessage}>{error}</div>
              </div>
              <button
                type="button"
                style={styles.retryButton}
                onClick={loadDashboard}
              >
                Try again
              </button>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <DashboardSection
              shelter={shelter}
              assignment={assignment}
              donation={donation}
              upcoming={upcoming}
              history={history}
              notifications={dashboardNotifications}
              portionsReceived={portionsReceived}
              completedCount={completedDonations.length}
              activeCount={activePickups.length}
              responding={responding}
              onAccept={() => handleResponse('confirmed')}
              onDecline={openDeclineModal}
              onCollected={handleMarkCollected}
              onOpenSection={openSection}
            />
          )}

          {activeSection === 'pickup' && (
            <CurrentPickupSection
              assignment={assignment}
              donation={donation}
              responding={responding}
              onAccept={() => handleResponse('confirmed')}
              onDecline={openDeclineModal}
              onCollected={handleMarkCollected}
            />
          )}

          {activeSection === 'schedule' && (
            <ScheduleSection assignment={assignment} upcoming={upcoming} />
          )}

          {activeSection === 'restaurant' && (
            <RestaurantSection assignment={assignment} />
          )}

          {activeSection === 'history' && (
            <HistorySection history={history} />
          )}

          {activeSection === 'notifications' && (
            <NotificationsSection
              notifications={dashboardNotifications}
              onMarkAllRead={markAllRead}
            />
          )}

          {activeSection === 'profile' && (
            <ProfileSection shelter={shelter} />
          )}
        </div>
      </main>

      {showDeclineModal && (
        <div
          style={styles.declineOverlay}
          onMouseDown={closeDeclineModal}
        >
          <div
            style={styles.declineModal}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={styles.declineModalTitle}>Decline donation</div>
            <div style={styles.declineModalSubtitle}>
              Select the reason your shelter cannot accept this donation.
            </div>

            <div style={styles.reasonList}>
              {DECLINE_REASONS.map((reason) => (
                <label
                  key={reason}
                  style={{
                    ...styles.reasonOption,
                    ...(declineReason === reason
                      ? styles.reasonSelected
                      : {}),
                  }}
                >
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
                style={styles.declineTextarea}
              />
            )}

            <div style={styles.declineModalButtons}>
              <button
                type="button"
                onClick={closeDeclineModal}
                disabled={responding}
                style={styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDecline}
                disabled={responding}
                style={styles.dangerButton}
              >
                {responding ? 'Saving...' : 'Confirm decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardSection({
  shelter,
  assignment,
  donation,
  upcoming,
  history,
  notifications,
  portionsReceived,
  completedCount,
  activeCount,
  responding,
  onAccept,
  onDecline,
  onCollected,
  onOpenSection,
}) {
  return (
    <>
      <section style={styles.welcomeBanner}>
        <div style={styles.welcomeContent}>
          <div style={styles.welcomeLabel}>Welcome back</div>
          <h2 style={styles.welcomeTitle}>
            {shelter?.name || 'Shelter Partner'}
          </h2>
          <p style={styles.welcomeText}>
            Review available food, confirm pickups and manage your weekly
            restaurant rotation from one place.
          </p>
          <div style={styles.welcomeActions}>
            <button
              type="button"
              style={styles.primaryWhiteButton}
              onClick={() => onOpenSection('pickup')}
            >
              View current pickup
            </button>
            <button
              type="button"
              style={styles.secondaryWhiteButton}
              onClick={() => onOpenSection('schedule')}
            >
              View pickup schedule
            </button>
          </div>
        </div>

        <div style={styles.welcomeGraphic}>
          <div style={styles.welcomeGraphicCircle}>♥</div>
          <div style={styles.welcomeGraphicText}>
            Food support for Detroit communities
          </div>
        </div>
      </section>

      <section className="fb-stat-grid" style={styles.statGrid}>
        <StatCard
          icon="◉"
          title="Portions received"
          value={portionsReceived}
          detail="Completed donations"
          tone="green"
        />
        <StatCard
          icon="▣"
          title="Active pickups"
          value={activeCount}
          detail="Awaiting action or completion"
          tone="blue"
        />
        <StatCard
          icon="✓"
          title="Completed pickups"
          value={completedCount}
          detail="Successful collections"
          tone="purple"
        />
        <StatCard
          icon="□"
          title="Upcoming matches"
          value={upcoming.length}
          detail="Scheduled restaurant rotations"
          tone="orange"
        />
      </section>

      <section className="fb-dashboard-grid" style={styles.dashboardGrid}>
        <div style={styles.largeColumn}>
          <CurrentPickupCard
            assignment={assignment}
            donation={donation}
            responding={responding}
            onAccept={onAccept}
            onDecline={onDecline}
            onCollected={onCollected}
          />

          {donation && donation.status !== 'declined' && (
            <DonationDetailsCard donation={donation} />
          )}

          <RecentHistoryCard
            history={history}
            onViewAll={() => onOpenSection('history')}
          />
        </div>

        <div style={styles.smallColumn}>
          <AccountStatusCard shelter={shelter} />

          <QuickActions
            onPickup={() => onOpenSection('pickup')}
            onSchedule={() => onOpenSection('schedule')}
            onRestaurant={() => onOpenSection('restaurant')}
            onHistory={() => onOpenSection('history')}
          />

          <UpcomingScheduleCard
            assignments={upcoming}
            onViewAll={() => onOpenSection('schedule')}
          />

          <NotificationPreview
            notifications={notifications}
            onViewAll={() => onOpenSection('notifications')}
          />
        </div>
      </section>
    </>
  )
}

function CurrentPickupSection({
  assignment,
  donation,
  responding,
  onAccept,
  onDecline,
  onCollected,
}) {
  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Current pickup</h2>
          <p style={styles.sectionDescription}>
            Review today's restaurant assignment and respond to its surplus
            listing.
          </p>
        </div>
      </div>

      <CurrentPickupCard
        assignment={assignment}
        donation={donation}
        responding={responding}
        onAccept={onAccept}
        onDecline={onDecline}
        onCollected={onCollected}
      />

      {donation && donation.status !== 'declined' && (
        <DonationDetailsCard donation={donation} />
      )}
    </div>
  )
}

function CurrentPickupCard({
  assignment,
  donation,
  responding,
  onAccept,
  onDecline,
  onCollected,
}) {
  const restaurant = assignment?.restaurants

  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Current rotation"
        title="Today's restaurant pickup"
        action={
          assignment && (
            <span style={badgeStyle(donation?.status)}>
              {donation ? statusLabel(donation.status) : 'Awaiting listing'}
            </span>
          )
        }
      />

      {!assignment ? (
        <EmptyState
          icon="□"
          title="No pickup scheduled today"
          text="When the rotation is generated, today's restaurant assignment will appear here."
        />
      ) : (
        <>
          <div style={styles.assignmentHero}>
            <div style={styles.restaurantLargeAvatar}>
              {getInitials(restaurant?.name)}
            </div>
            <div style={styles.assignmentHeroContent}>
              <div style={styles.assignmentRestaurantName}>
                {restaurant?.name || 'Restaurant partner'}
              </div>
              <div style={styles.assignmentDate}>
                {formatFullDate(assignment.assignment_date)}
              </div>
              <div style={styles.assignmentMeta}>
                <span>
                  📍 {restaurant?.address || 'Detroit, Michigan'}
                </span>
                <span>
                  🕒 {donation?.pickup_window || 'Pickup time not posted'}
                </span>
              </div>
            </div>
          </div>

          <div style={styles.assignmentProgress}>
            <ProgressStep label="Scheduled" complete />
            <ProgressLine complete={Boolean(donation)} />
            <ProgressStep label="Surplus posted" complete={Boolean(donation)} />
            <ProgressLine
              complete={['confirmed', 'accepted', 'collected', 'completed'].includes(
                donation?.status
              )}
            />
            <ProgressStep
              label="Accepted"
              complete={['confirmed', 'accepted', 'collected', 'completed'].includes(
                donation?.status
              )}
            />
            <ProgressLine
              complete={['collected', 'completed'].includes(donation?.status)}
            />
            <ProgressStep
              label="Collected"
              complete={['collected', 'completed'].includes(donation?.status)}
            />
          </div>

          {!donation && (
            <div style={styles.informationNotice}>
              The restaurant has not posted its available surplus yet.
            </div>
          )}

          {donation?.status === 'posted' && (
            <div style={styles.actionNotice}>
              <div>
                <div style={styles.actionNoticeTitle}>Response required</div>
                <div style={styles.actionNoticeText}>
                  Review the food information below and confirm whether your
                  shelter can collect it.
                </div>
              </div>
              <div style={styles.assignmentActions}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={onAccept}
                  disabled={responding}
                >
                  {responding ? 'Saving...' : 'Accept donation'}
                </button>
                <button
                  type="button"
                  style={styles.dangerButton}
                  onClick={onDecline}
                  disabled={responding}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {['confirmed', 'accepted'].includes(donation?.status) && (
            <div style={styles.successNotice}>
              <div style={styles.noticeIcon}>✓</div>
              <div style={{ flex: 1 }}>
                <div style={styles.noticeTitle}>Pickup confirmed</div>
                <div style={styles.noticeText}>
                  Your shelter accepted this donation. Mark it collected after
                  pickup.
                </div>
              </div>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={onCollected}
                disabled={responding}
              >
                {responding ? 'Updating...' : 'Mark collected'}
              </button>
            </div>
          )}

          {donation?.status === 'collected' && (
            <div style={styles.successNotice}>
              <div style={styles.noticeIcon}>✓</div>
              <div>
                <div style={styles.noticeTitle}>Pickup collected</div>
                <div style={styles.noticeText}>
                  The restaurant can now confirm the final handoff.
                </div>
              </div>
            </div>
          )}

          {donation?.status === 'completed' && (
            <div style={styles.successNotice}>
              <div style={styles.noticeIcon}>✓</div>
              <div>
                <div style={styles.noticeTitle}>Handoff completed</div>
                <div style={styles.noticeText}>
                  This donation was successfully completed.
                </div>
              </div>
            </div>
          )}

          {donation?.status === 'declined' && (
            <div style={styles.declinedNotice}>
              <div style={styles.declinedNoticeTitle}>Donation declined</div>
              <div style={styles.declinedNoticeText}>
                {donation.decline_reason || 'No reason was recorded.'}
              </div>
            </div>
          )}

          <div style={styles.assignmentActions}>
            {restaurant?.phone && (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  window.location.href = `tel:${restaurant.phone}`
                }}
              >
                Call restaurant
              </button>
            )}

            {restaurant?.address && (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      restaurant.address
                    )}`,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                View directions
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function DonationDetailsCard({ donation }) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Available food"
        title="Donation details"
        action={
          <span style={badgeStyle(donation.status)}>
            {statusLabel(donation.status)}
          </span>
        }
      />

      <div className="fb-detail-grid" style={styles.detailGrid}>
        <DetailBox
          label="Food items"
          value={donation.food_items || 'Not provided'}
        />
        <DetailBox
          label="Quantity"
          value={`${donation.quantity || 0} portions`}
        />
        <DetailBox
          label="Pickup window"
          value={donation.pickup_window || 'To be confirmed'}
        />
        <DetailBox
          label="Prepared"
          value={donation.prepared_time || 'Not provided'}
        />
        <DetailBox
          label="Safe until"
          value={donation.safe_until || 'Not provided'}
        />
        <DetailBox
          label="Temperature"
          value={donation.temperature_requirement || 'Not provided'}
        />
        <DetailBox
          label="Allergens"
          value={donation.allergen_notes || 'None reported'}
          wide
        />
      </div>
    </div>
  )
}

function AccountStatusCard({ shelter }) {
  const strikes = Number(shelter?.strikes || 0)

  return (
    <div style={styles.panel}>
      <PanelHeader eyebrow="Membership" title="Account status" />

      <div style={styles.statusRow}>
        <span style={styles.activeStatusDot} />
        <div>
          <div style={styles.statusTitle}>
            {shelter?.status || 'Active Member'}
          </div>
          <div style={styles.statusText}>FoodBridge shelter partner</div>
        </div>
      </div>

      <div style={styles.strikeBox}>
        <div>
          <div style={styles.strikeLabel}>Participation strikes</div>
          <div style={styles.strikeText}>
            Repeated missed pickups may affect account status.
          </div>
        </div>
        <div
          style={{
            ...styles.strikeValue,
            color: strikes > 0 ? '#B43C35' : '#246442',
          }}
        >
          {strikes}/3
        </div>
      </div>
    </div>
  )
}

function QuickActions({
  onPickup,
  onSchedule,
  onRestaurant,
  onHistory,
}) {
  return (
    <div style={styles.panel}>
      <PanelHeader eyebrow="Common tasks" title="Quick actions" />
      <div style={styles.quickActionGrid}>
        <QuickAction
          icon="▣"
          label="Current pickup"
          description="Review today's match"
          onClick={onPickup}
        />
        <QuickAction
          icon="□"
          label="Schedule"
          description="View future pickups"
          onClick={onSchedule}
        />
        <QuickAction
          icon="◉"
          label="Restaurant"
          description="Contact and directions"
          onClick={onRestaurant}
        />
        <QuickAction
          icon="▥"
          label="History"
          description="Past donations"
          onClick={onHistory}
        />
      </div>
    </div>
  )
}

function UpcomingScheduleCard({ assignments, onViewAll }) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Rotation plan"
        title="Upcoming pickups"
        action={
          <button type="button" style={styles.linkButton} onClick={onViewAll}>
            View all
          </button>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon="□"
          title="No upcoming pickups"
          text="Future restaurant matches will appear here."
          compact
        />
      ) : (
        assignments.slice(0, 4).map((item, index) => (
          <div key={item.id || index} style={styles.schedulePreviewRow}>
            <div style={styles.scheduleDateBox}>
              <div style={styles.scheduleMonth}>
                {getMonth(item.assignment_date)}
              </div>
              <div style={styles.scheduleDay}>
                {getDay(item.assignment_date)}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={styles.scheduleRestaurant}>
                {item.restaurants?.name || 'Restaurant assignment'}
              </div>
              <div style={styles.scheduleSub}>
                {formatWeekLabel(item.assignment_date)}
              </div>
            </div>

            <span style={styles.scheduledBadge}>Scheduled</span>
          </div>
        ))
      )}
    </div>
  )
}

function NotificationPreview({ notifications, onViewAll }) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Updates"
        title="Notifications"
        action={
          <button type="button" style={styles.linkButton} onClick={onViewAll}>
            View all
          </button>
        }
      />

      {notifications.slice(0, 3).map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
        />
      ))}
    </div>
  )
}

function RecentHistoryCard({ history, onViewAll }) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Recent activity"
        title="Donation history"
        action={
          <button type="button" style={styles.linkButton} onClick={onViewAll}>
            View all
          </button>
        }
      />

      {history.length === 0 ? (
        <EmptyState
          icon="▥"
          title="No donations recorded"
          text="Accepted and completed pickups will appear here."
        />
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Restaurant</th>
                <th style={styles.tableHeader}>Date</th>
                <th style={styles.tableHeader}>Food</th>
                <th style={styles.tableHeader}>Quantity</th>
                <th style={styles.tableHeader}>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 5).map((item) => (
                <tr key={item.id}>
                  <td style={styles.tableCellStrong}>
                    {item.assignments?.restaurants?.name || 'Restaurant'}
                  </td>
                  <td style={styles.tableCell}>
                    {formatShortDate(
                      item.assignments?.assignment_date || item.posted_at
                    )}
                  </td>
                  <td style={styles.tableCell}>
                    {item.food_items || 'Food donation'}
                  </td>
                  <td style={styles.tableCell}>
                    {item.quantity || 0} portions
                  </td>
                  <td style={styles.tableCell}>
                    <span style={badgeStyle(item.status)}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScheduleSection({ assignment, upcoming }) {
  const assignments = assignment ? [assignment, ...upcoming] : upcoming

  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Pickup schedule</h2>
          <p style={styles.sectionDescription}>
            View the restaurants assigned to your shelter over the next several
            rotations.
          </p>
        </div>
      </div>

      <div style={styles.panel}>
        {assignments.length === 0 ? (
          <EmptyState
            icon="□"
            title="No pickup schedule available"
            text="An administrator must create restaurant assignments for this shelter."
          />
        ) : (
          <div className="fb-rotation-grid" style={styles.rotationGrid}>
            {assignments.map((item, index) => (
              <div
                key={item.id || index}
                style={{
                  ...styles.rotationCard,
                  ...(isToday(item.assignment_date)
                    ? styles.rotationCardToday
                    : {}),
                }}
              >
                <div style={styles.rotationTop}>
                  <span style={styles.rotationWeek}>
                    {isToday(item.assignment_date)
                      ? 'Current pickup'
                      : `Rotation ${index + 1}`}
                  </span>
                  {isToday(item.assignment_date) && (
                    <span style={styles.todayBadge}>Today</span>
                  )}
                </div>

                <div style={styles.rotationDate}>
                  {formatFullDate(item.assignment_date)}
                </div>

                <div style={styles.rotationRestaurantRow}>
                  <div style={styles.rotationAvatar}>
                    {getInitials(item.restaurants?.name)}
                  </div>
                  <div>
                    <div style={styles.rotationRestaurantName}>
                      {item.restaurants?.name || 'Restaurant assignment'}
                    </div>
                    <div style={styles.rotationAddress}>
                      {item.restaurants?.address || 'Detroit, Michigan'}
                    </div>
                  </div>
                </div>

                <div style={styles.rotationFooter}>
                  <span style={styles.scheduledBadge}>Scheduled</span>
                  {item.restaurants?.address && (
                    <button
                      type="button"
                      style={styles.linkButton}
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            item.restaurants.address
                          )}`,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                    >
                      Directions
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RestaurantSection({ assignment }) {
  const restaurant = assignment?.restaurants

  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Assigned restaurant</h2>
          <p style={styles.sectionDescription}>
            View today's restaurant contact and pickup information.
          </p>
        </div>
      </div>

      {!restaurant ? (
        <div style={styles.panel}>
          <EmptyState
            icon="◉"
            title="No restaurant assigned today"
            text="Restaurant details will appear here when an assignment is created."
          />
        </div>
      ) : (
        <div className="fb-profile-grid" style={styles.profileGrid}>
          <div style={styles.panel}>
            <div style={styles.profileHeader}>
              <div style={styles.profileAvatar}>
                {getInitials(restaurant.name)}
              </div>
              <div>
                <div style={styles.profileName}>{restaurant.name}</div>
                <div style={styles.profileStatus}>
                  <span style={styles.activeStatusDot} />
                  Active FoodBridge restaurant
                </div>
              </div>
            </div>

            <div className="fb-info-grid" style={styles.informationGrid}>
              <InformationItem
                label="Address"
                value={restaurant.address || 'Address not provided'}
              />
              <InformationItem
                label="Phone"
                value={restaurant.phone || 'Phone not provided'}
              />
              <InformationItem
                label="Email"
                value={restaurant.email || 'Email not provided'}
              />
              <InformationItem
                label="Pickup date"
                value={formatFullDate(assignment.assignment_date)}
              />
            </div>

            <div style={styles.assignmentActions}>
              {restaurant.phone && (
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => {
                    window.location.href = `tel:${restaurant.phone}`
                  }}
                >
                  Call restaurant
                </button>
              )}
              {restaurant.address && (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        restaurant.address
                      )}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  View directions
                </button>
              )}
            </div>
          </div>

          <div style={styles.panel}>
            <PanelHeader eyebrow="Pickup checklist" title="Before collection" />
            <ChecklistItem
              complete={Boolean(restaurant.address)}
              title="Confirm location"
              text="Check the restaurant address before departure."
            />
            <ChecklistItem
              complete={false}
              title="Bring suitable containers"
              text="Prepare insulated or food-safe transportation containers."
            />
            <ChecklistItem
              complete={false}
              title="Review allergens"
              text="Check allergen information before accepting the donation."
            />
            <ChecklistItem
              complete={false}
              title="Confirm collection"
              text="Mark the donation collected after pickup."
            />
          </div>
        </div>
      )}
    </div>
  )
}

function HistorySection({ history }) {
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredHistory =
    statusFilter === 'all'
      ? history
      : history.filter((item) => item.status === statusFilter)

  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Donation history</h2>
          <p style={styles.sectionDescription}>
            Review previous restaurant matches, responses and pickups.
          </p>
        </div>

        <select
          style={styles.filterSelect}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="posted">Posted</option>
          <option value="confirmed">Confirmed</option>
          <option value="accepted">Accepted</option>
          <option value="collected">Collected</option>
          <option value="completed">Completed</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      <div style={styles.panel}>
        {filteredHistory.length === 0 ? (
          <EmptyState
            icon="▥"
            title="No matching donations"
            text="No donation records match the selected status."
          />
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeader}>Restaurant</th>
                  <th style={styles.tableHeader}>Date</th>
                  <th style={styles.tableHeader}>Food</th>
                  <th style={styles.tableHeader}>Quantity</th>
                  <th style={styles.tableHeader}>Pickup window</th>
                  <th style={styles.tableHeader}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.tableCellStrong}>
                      {item.assignments?.restaurants?.name || 'Restaurant'}
                    </td>
                    <td style={styles.tableCell}>
                      {formatShortDate(
                        item.assignments?.assignment_date || item.posted_at
                      )}
                    </td>
                    <td style={styles.tableCell}>
                      {item.food_items || 'Food donation'}
                    </td>
                    <td style={styles.tableCell}>
                      {item.quantity || 0} portions
                    </td>
                    <td style={styles.tableCell}>
                      {item.pickup_window || 'Not provided'}
                    </td>
                    <td style={styles.tableCell}>
                      <span style={badgeStyle(item.status)}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function NotificationsSection({ notifications, onMarkAllRead }) {
  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Notifications</h2>
          <p style={styles.sectionDescription}>
            Review new donation alerts, pickup reminders and status updates.
          </p>
        </div>

        <button
          type="button"
          style={styles.secondaryButton}
          onClick={onMarkAllRead}
        >
          Mark all read
        </button>
      </div>

      <div style={styles.panel}>
        {notifications.length === 0 ? (
          <EmptyState
            icon="◫"
            title="You're all caught up"
            text="New restaurant and pickup updates will appear here."
          />
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              expanded
            />
          ))
        )}
      </div>
    </div>
  )
}

function ProfileSection({ shelter }) {
  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Shelter profile</h2>
          <p style={styles.sectionDescription}>
            Review the organization information associated with this account.
          </p>
        </div>

        <button type="button" style={styles.secondaryButton}>
          Request profile update
        </button>
      </div>

      <div className="fb-profile-grid" style={styles.profileGrid}>
        <div style={styles.panel}>
          <div style={styles.profileHeader}>
            <div style={styles.largeProfileAvatar}>
              {getInitials(shelter?.name)}
            </div>
            <div>
              <div style={styles.largeProfileName}>
                {shelter?.name || 'Shelter'}
              </div>
              <div style={styles.profileType}>FoodBridge shelter partner</div>
              <span style={styles.approvedBadge}>
                {shelter?.status || 'Approved'}
              </span>
            </div>
          </div>

          <div className="fb-info-grid" style={styles.informationGrid}>
            <InformationItem
              label="Shelter name"
              value={shelter?.name || 'Not provided'}
            />
            <InformationItem
              label="Email address"
              value={shelter?.email || 'Not provided'}
            />
            <InformationItem
              label="Phone number"
              value={shelter?.phone || 'Not provided'}
            />
            <InformationItem
              label="Address"
              value={shelter?.address || 'Not provided'}
            />
            <InformationItem
              label="Contact person"
              value={
                shelter?.contact_name ||
                shelter?.contact_person ||
                'Not provided'
              }
            />
            <InformationItem
              label="Pickup availability"
              value={
                shelter?.pickup_availability ||
                shelter?.availability ||
                'Not provided'
              }
            />
          </div>
        </div>

        <div style={styles.panel}>
          <PanelHeader eyebrow="Account readiness" title="Profile checklist" />
          <ChecklistItem
            complete={Boolean(shelter?.name)}
            title="Organization name"
            text="Displayed throughout the shelter portal."
          />
          <ChecklistItem
            complete={Boolean(shelter?.email)}
            title="Account email"
            text="Used for sign-in and FoodBridge communication."
          />
          <ChecklistItem
            complete={Boolean(shelter?.phone)}
            title="Contact phone"
            text="Helps restaurants coordinate pickups."
          />
          <ChecklistItem
            complete={Boolean(shelter?.address)}
            title="Shelter address"
            text="Supports rotation planning and route coordination."
          />
        </div>
      </div>
    </div>
  )
}

function NavButton({ icon, label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.navButton,
        ...(active ? styles.navButtonActive : {}),
      }}
    >
      <span
        style={{
          ...styles.navIcon,
          ...(active ? styles.navIconActive : {}),
        }}
      >
        {icon}
      </span>
      <span style={styles.navLabel}>{label}</span>
      {count > 0 && <span style={styles.navCount}>{count}</span>}
    </button>
  )
}

function StatCard({ icon, title, value, detail, tone }) {
  const toneStyles = {
    green: { background: '#ECFDF3', color: '#137A45' },
    blue: { background: '#EFF6FF', color: '#2563EB' },
    purple: { background: '#F5F3FF', color: '#7C3AED' },
    orange: { background: '#FFF7ED', color: '#EA580C' },
  }

  return (
    <div style={styles.statCard}>
      <div
        style={{
          ...styles.statIcon,
          ...(toneStyles[tone] || toneStyles.green),
        }}
      >
        {icon}
      </div>
      <div>
        <div style={styles.statTitle}>{title}</div>
        <div style={styles.statValue}>{value}</div>
        <div style={styles.statDetail}>{detail}</div>
      </div>
    </div>
  )
}

function PanelHeader({ eyebrow, title, action }) {
  return (
    <div style={styles.panelHeader}>
      <div>
        <div style={styles.panelEyebrow}>{eyebrow}</div>
        <div style={styles.panelTitle}>{title}</div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

function ProgressStep({ label, complete }) {
  return (
    <div style={styles.progressStep}>
      <div
        style={{
          ...styles.progressDot,
          ...(complete ? styles.progressDotComplete : {}),
        }}
      >
        {complete ? '✓' : ''}
      </div>
      <div
        style={{
          ...styles.progressLabel,
          ...(complete ? styles.progressLabelComplete : {}),
        }}
      >
        {label}
      </div>
    </div>
  )
}

function ProgressLine({ complete }) {
  return (
    <div
      style={{
        ...styles.progressLine,
        ...(complete ? styles.progressLineComplete : {}),
      }}
    />
  )
}

function DetailBox({ label, value, wide }) {
  return (
    <div
      style={{
        ...styles.detailBox,
        ...(wide ? styles.detailBoxWide : {}),
      }}
    >
      <div style={styles.detailBoxLabel}>{label}</div>
      <div style={styles.detailBoxValue}>{value}</div>
    </div>
  )
}

function QuickAction({ icon, label, description, onClick }) {
  return (
    <button
      type="button"
      style={styles.quickAction}
      onClick={onClick}
    >
      <div style={styles.quickActionIcon}>{icon}</div>
      <div style={styles.quickActionLabel}>{label}</div>
      <div style={styles.quickActionDescription}>{description}</div>
    </button>
  )
}

function NotificationItem({ notification, expanded = false }) {
  return (
    <div
      style={{
        ...styles.notificationItem,
        ...(expanded ? styles.notificationItemExpanded : {}),
        ...(!notification.read ? styles.notificationUnread : {}),
      }}
    >
      <div
        style={{
          ...styles.notificationTypeIcon,
          ...(notification.tone === 'success'
            ? styles.notificationSuccess
            : notification.tone === 'warning'
            ? styles.notificationWarning
            : styles.notificationInformation),
        }}
      >
        {notification.icon || '◫'}
      </div>

      <div style={{ flex: 1 }}>
        <div style={styles.notificationTitle}>
          {notification.title || 'FoodBridge update'}
        </div>
        <div style={styles.notificationText}>
          {notification.text || notification.message || ''}
        </div>
        {expanded && (
          <div style={styles.notificationTime}>
            {notification.time ||
              (notification.created_at
                ? formatDateTime(notification.created_at)
                : 'Current update')}
          </div>
        )}
      </div>
    </div>
  )
}

function InformationItem({ label, value }) {
  return (
    <div style={styles.informationItem}>
      <div style={styles.informationLabel}>{label}</div>
      <div style={styles.informationValue}>{value}</div>
    </div>
  )
}

function ChecklistItem({ complete, title, text }) {
  return (
    <div style={styles.checklistItem}>
      <div
        style={{
          ...styles.checklistIcon,
          ...(complete ? styles.checklistIconComplete : {}),
        }}
      >
        {complete ? '✓' : '•'}
      </div>
      <div>
        <div style={styles.checklistTitle}>{title}</div>
        <div style={styles.checklistText}>{text}</div>
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div
      style={{
        ...styles.emptyState,
        ...(compact ? styles.emptyStateCompact : {}),
      }}
    >
      <div style={styles.emptyStateIcon}>{icon}</div>
      <div style={styles.emptyStateTitle}>{title}</div>
      <div style={styles.emptyStateText}>{text}</div>
      {actionLabel && onAction && (
        <button
          type="button"
          style={styles.primaryButton}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function buildDashboardNotifications({
  assignment,
  donation,
  nextAssignment,
  databaseNotifications,
}) {
  const generated = []

  if (assignment && !donation) {
    generated.push({
      id: 'waiting-for-listing',
      icon: '□',
      tone: 'information',
      title: 'Waiting for surplus listing',
      text: `${
        assignment.restaurants?.name || "Today's restaurant"
      } has not posted its available food yet.`,
      time: 'Today',
      read: true,
    })
  }

  if (donation?.status === 'posted') {
    generated.push({
      id: 'response-required',
      icon: '!',
      tone: 'warning',
      title: 'Donation response required',
      text: `${
        assignment?.restaurants?.name || 'A restaurant partner'
      } posted ${donation.quantity || 0} portions. Review and respond.`,
      time: 'Current pickup',
      read: false,
    })
  }

  if (['confirmed', 'accepted'].includes(donation?.status)) {
    generated.push({
      id: 'pickup-confirmed',
      icon: '✓',
      tone: 'success',
      title: 'Pickup confirmed',
      text: `Your shelter accepted the donation from ${
        assignment?.restaurants?.name || 'the assigned restaurant'
      }.`,
      time: 'Current pickup',
      read: true,
    })
  }

  if (donation?.status === 'collected') {
    generated.push({
      id: 'pickup-collected',
      icon: '✓',
      tone: 'success',
      title: 'Donation collected',
      text: 'The restaurant can now complete the final handoff.',
      time: 'Current pickup',
      read: true,
    })
  }

  if (nextAssignment) {
    generated.push({
      id: 'upcoming-rotation',
      icon: '□',
      tone: 'information',
      title: 'Upcoming restaurant match',
      text: `Your next pickup is from ${
        nextAssignment.restaurants?.name || 'a restaurant'
      } on ${formatFullDate(nextAssignment.assignment_date)}.`,
      time: 'Upcoming',
      read: true,
    })
  }

  const databaseItems = databaseNotifications.map((item) => ({
    ...item,
    icon: item.icon || '◫',
    tone: item.tone || 'information',
    text: item.message || item.text,
    time: item.created_at ? formatDateTime(item.created_at) : 'Recent',
  }))

  const combined = [...generated, ...databaseItems]
  const seen = new Set()

  return combined.filter((item) => {
    const key = `${item.title}-${item.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sectionTitle(section) {
  const titles = {
    dashboard: 'Dashboard',
    pickup: 'Current pickup',
    schedule: 'Pickup schedule',
    restaurant: 'Assigned restaurant',
    history: 'Donation history',
    notifications: 'Notifications',
    profile: 'Shelter profile',
  }

  return titles[section] || 'Shelter portal'
}

function sectionSubtitle(section) {
  const subtitles = {
    dashboard:
      "Track today's pickup, restaurant rotations and shelter impact.",
    pickup:
      'Review and respond to the current restaurant donation.',
    schedule:
      'Review upcoming restaurant-to-shelter assignments.',
    restaurant:
      "View the restaurant assigned for today's pickup.",
    history:
      'Review previous donations and pickup outcomes.',
    notifications:
      'Stay updated on restaurant listings and pickup activity.',
    profile:
      'Review your FoodBridge shelter account information.',
  }

  return subtitles[section] || ''
}

function statusLabel(status) {
  const labels = {
    posted: 'Response required',
    confirmed: 'Confirmed',
    accepted: 'Accepted',
    collected: 'Collected',
    completed: 'Completed',
    declined: 'Declined',
    cancelled: 'Cancelled',
    expired: 'Expired',
  }

  return labels[status] || status || 'Pending'
}

function badgeStyle(status) {
  if (
    ['completed', 'confirmed', 'accepted', 'collected'].includes(status)
  ) {
    return styles.badgeGreen
  }

  if (['declined', 'cancelled', 'expired'].includes(status)) {
    return styles.badgeRed
  }

  return styles.badgeAmber
}

function getTodayValue() {
  const now = new Date()
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60 * 1000
  )
  return localDate.toISOString().split('T')[0]
}

function getInitials(name) {
  if (!name) return 'FB'

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function parseDate(value) {
  if (!value) return null

  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return new Date(`${value}T00:00:00`)
  }

  return new Date(value)
}

function formatFullDate(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return 'Date not available'

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortDate(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getMonth(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''

  return date
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase()
}

function getDay(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.getDate()
}

function formatWeekLabel(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return 'Upcoming rotation'

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function isToday(value) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return false

  const today = new Date()

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

const responsiveCss = `
  @media (max-width: 900px) {
    .fb-mobile-header {
      display: flex !important;
    }

    .fb-sidebar {
      transform: translateX(-105%);
      transition: transform 0.22s ease;
    }

    .fb-sidebar-open {
      transform: translateX(0) !important;
    }

    .fb-main {
      margin-left: 0 !important;
      padding-top: 66px;
    }

    .fb-topbar {
      display: none !important;
    }

    .fb-content {
      padding: 18px !important;
    }

    .fb-stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .fb-dashboard-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .fb-profile-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }

  @media (max-width: 620px) {
    .fb-stat-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .fb-detail-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .fb-detail-grid > div {
      grid-column: auto !important;
    }

    .fb-rotation-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .fb-info-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }
`

const styles = {
  app: {
    minHeight: '100vh',
    background: '#F3F6F4',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#17211A',
  },
  loadingPage: {
    minHeight: '100vh',
    background: '#F3F6F4',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    background: '#205C3B',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 14,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#183D2B',
  },
  loadingText: {
    marginTop: 6,
    fontSize: 13,
    color: '#708078',
  },
  mobileHeader: {
    display: 'none',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: 66,
    padding: '0 18px',
    background: '#FFFFFF',
    borderBottom: '1px solid #E2E8E4',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 50,
  },
  mobileMenuButton: {
    border: 0,
    background: 'transparent',
    fontSize: 23,
    cursor: 'pointer',
  },
  mobileBrand: {
    fontWeight: 800,
    color: '#205C3B',
  },
  mobileRole: {
    fontSize: 10,
    color: '#7B8981',
    textAlign: 'center',
  },
  mobileNotificationButton: {
    position: 'relative',
    border: 0,
    background: 'transparent',
    fontSize: 20,
    cursor: 'pointer',
  },
  notificationCount: {
    position: 'absolute',
    top: -7,
    right: -8,
    minWidth: 17,
    height: 17,
    padding: '0 4px',
    borderRadius: 20,
    background: '#D94A43',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    padding: '24px 18px',
    background: '#153D2A',
    color: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    zIndex: 100,
    boxSizing: 'border-box',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 8px',
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    background: '#78BD77',
    color: '#113321',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 900,
  },
  brandName: {
    fontSize: 19,
    fontWeight: 800,
  },
  brandLocation: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.58)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  organizationIdentity: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    marginTop: 28,
    padding: 12,
    borderRadius: 14,
    background: 'rgba(255,255,255,0.08)',
  },
  organizationAvatar: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 12,
    background: '#FFFFFF',
    color: '#205C3B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 12,
  },
  organizationName: {
    fontSize: 13,
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  organizationType: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 10,
  },
  navigation: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    marginTop: 24,
  },
  navButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '10px 11px',
    border: 0,
    borderRadius: 10,
    background: 'transparent',
    color: 'rgba(255,255,255,0.72)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  navButtonActive: {
    background: '#FFFFFF',
    color: '#17452E',
    fontWeight: 700,
  },
  navIcon: {
    width: 25,
    height: 25,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'inherit',
    fontSize: 14,
  },
  navIconActive: {
    background: '#EAF6EE',
    color: '#205C3B',
  },
  navLabel: {
    flex: 1,
    fontSize: 12,
  },
  navCount: {
    minWidth: 20,
    height: 20,
    padding: '0 5px',
    borderRadius: 20,
    background: '#D8EEDD',
    color: '#205C3B',
    fontSize: 9,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarFooter: {
    marginTop: 'auto',
    paddingTop: 24,
  },
  supportCard: {
    borderRadius: 14,
    padding: 14,
    background: 'rgba(255,255,255,0.08)',
  },
  supportIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    background: '#78BD77',
    color: '#143B29',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  supportTitle: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 800,
  },
  supportText: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.62)',
  },
  supportButton: {
    marginTop: 11,
    width: '100%',
    padding: '8px 10px',
    border: 0,
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#17452E',
    fontSize: 10,
    fontWeight: 800,
    cursor: 'pointer',
  },
  signOutButton: {
    marginTop: 12,
    width: '100%',
    padding: '10px 12px',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 9,
    background: 'transparent',
    color: '#FFFFFF',
    fontSize: 11,
    cursor: 'pointer',
  },
  mobileOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,20,14,0.5)',
    zIndex: 90,
  },
  main: {
    minHeight: '100vh',
    marginLeft: 260,
  },
  topBar: {
    minHeight: 82,
    padding: '18px 28px',
    background: '#FFFFFF',
    borderBottom: '1px solid #E1E8E3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
  },
  pageEyebrow: {
    color: '#7B8981',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pageTitle: {
    margin: '3px 0 0',
    fontSize: 22,
    lineHeight: 1.2,
    color: '#183D2B',
  },
  pageSubtitle: {
    margin: '5px 0 0',
    color: '#708078',
    fontSize: 11,
  },
  topBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 17,
  },
  topNotificationButton: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: 11,
    border: '1px solid #E0E7E2',
    background: '#FFFFFF',
    cursor: 'pointer',
  },
  topProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  topProfileAvatar: {
    width: 37,
    height: 37,
    borderRadius: 11,
    background: '#E7F3EA',
    color: '#205C3B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
  },
  topProfileName: {
    fontSize: 11,
    fontWeight: 800,
    color: '#24352B',
  },
  topProfileRole: {
    marginTop: 2,
    fontSize: 9,
    color: '#819087',
  },
  content: {
    padding: 28,
    maxWidth: 1450,
    margin: '0 auto',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    padding: 14,
    marginBottom: 18,
    border: '1px solid #F0B8B5',
    borderRadius: 12,
    background: '#FFF1F0',
    color: '#9A2F2A',
    fontSize: 12,
  },
  errorMessage: {
    marginTop: 3,
    fontSize: 11,
  },
  retryButton: {
    border: 0,
    borderRadius: 8,
    padding: '8px 12px',
    background: '#9A2F2A',
    color: '#FFFFFF',
    fontWeight: 700,
    cursor: 'pointer',
  },
  welcomeBanner: {
    minHeight: 210,
    padding: '30px 34px',
    borderRadius: 20,
    background:
      'linear-gradient(120deg, #1B5A38 0%, #2E784D 70%, #4A9162 100%)',
    color: '#FFFFFF',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  welcomeContent: {
    position: 'relative',
    zIndex: 2,
    maxWidth: 600,
  },
  welcomeLabel: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.68)',
  },
  welcomeTitle: {
    margin: '7px 0 0',
    fontSize: 30,
    lineHeight: 1.15,
  },
  welcomeText: {
    maxWidth: 510,
    margin: '10px 0 0',
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.78)',
  },
  welcomeActions: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  primaryWhiteButton: {
    border: 0,
    borderRadius: 10,
    padding: '10px 15px',
    background: '#FFFFFF',
    color: '#1D5B3A',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryWhiteButton: {
    border: '1px solid rgba(255,255,255,0.38)',
    borderRadius: 10,
    padding: '10px 15px',
    background: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  },
  welcomeGraphic: {
    width: 210,
    height: 150,
    flexShrink: 0,
    borderRadius: 26,
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'rotate(-3deg)',
  },
  welcomeGraphicCircle: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.16)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 34,
  },
  welcomeGraphicText: {
    marginTop: 9,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 14,
    marginTop: 18,
  },
  statCard: {
    padding: 17,
    borderRadius: 15,
    background: '#FFFFFF',
    border: '1px solid #E3E9E5',
    display: 'flex',
    gap: 13,
    boxShadow: '0 5px 20px rgba(25,55,37,0.04)',
  },
  statIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  statTitle: {
    fontSize: 10,
    color: '#76847B',
    fontWeight: 700,
  },
  statValue: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: 850,
    color: '#203A2A',
  },
  statDetail: {
    marginTop: 2,
    fontSize: 9,
    color: '#94A099',
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.7fr) minmax(310px, 0.8fr)',
    gap: 18,
    alignItems: 'start',
    marginTop: 18,
  },
  largeColumn: {
    minWidth: 0,
  },
  smallColumn: {
    minWidth: 0,
  },
  panel: {
    padding: 20,
    marginBottom: 16,
    borderRadius: 16,
    background: '#FFFFFF',
    border: '1px solid #E2E8E4',
    boxShadow: '0 5px 22px rgba(25,55,37,0.035)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 15,
    marginBottom: 18,
  },
  panelEyebrow: {
    fontSize: 8,
    fontWeight: 850,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#8B9890',
  },
  panelTitle: {
    marginTop: 3,
    fontSize: 16,
    fontWeight: 800,
    color: '#213A2B',
  },
  assignmentHero: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 14,
    background: '#F4F8F5',
  },
  restaurantLargeAvatar: {
    width: 54,
    height: 54,
    flexShrink: 0,
    borderRadius: 15,
    background: '#DCEFE1',
    color: '#1E6340',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 850,
  },
  assignmentHeroContent: {
    flex: 1,
    minWidth: 0,
  },
  assignmentRestaurantName: {
    fontSize: 17,
    fontWeight: 850,
    color: '#1F3829',
  },
  assignmentDate: {
    marginTop: 3,
    fontSize: 11,
    color: '#728077',
  },
  assignmentMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '7px 16px',
    marginTop: 9,
    fontSize: 10,
    color: '#66756C',
  },
  assignmentProgress: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    margin: '24px 4px 20px',
  },
  progressStep: {
    width: 83,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  progressDot: {
    width: 25,
    height: 25,
    borderRadius: '50%',
    border: '2px solid #D8E0DB',
    background: '#FFFFFF',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
    boxSizing: 'border-box',
  },
  progressDotComplete: {
    borderColor: '#2E7A4C',
    background: '#2E7A4C',
  },
  progressLabel: {
    marginTop: 6,
    fontSize: 8,
    color: '#9AA59E',
    textAlign: 'center',
  },
  progressLabelComplete: {
    color: '#2E6745',
    fontWeight: 750,
  },
  progressLine: {
    flex: 1,
    height: 2,
    minWidth: 25,
    marginTop: 12,
    background: '#DFE5E1',
  },
  progressLineComplete: {
    background: '#61A878',
  },
  assignmentActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  primaryButton: {
    border: 0,
    borderRadius: 9,
    padding: '10px 14px',
    background: '#205C3B',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid #D7E0DA',
    borderRadius: 9,
    padding: '9px 14px',
    background: '#FFFFFF',
    color: '#28513A',
    fontSize: 10,
    fontWeight: 750,
    cursor: 'pointer',
  },
  dangerButton: {
    border: '1px solid #EDB8B4',
    borderRadius: 9,
    padding: '9px 14px',
    background: '#FFF3F2',
    color: '#A53B35',
    fontSize: 10,
    fontWeight: 800,
    cursor: 'pointer',
  },
  informationNotice: {
    padding: 12,
    borderRadius: 11,
    background: '#F2F6F3',
    color: '#637269',
    fontSize: 10,
  },
  actionNotice: {
    padding: 14,
    marginTop: 12,
    borderRadius: 12,
    background: '#FFF8E8',
    border: '1px solid #F1DCA9',
  },
  actionNoticeTitle: {
    fontSize: 11,
    fontWeight: 850,
    color: '#9A610B',
  },
  actionNoticeText: {
    marginTop: 3,
    fontSize: 9,
    color: '#A47A3C',
  },
  successNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 15,
    padding: 12,
    borderRadius: 11,
    background: '#EDF9F0',
    border: '1px solid #BFE3C8',
  },
  noticeIcon: {
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: '50%',
    background: '#2F7E4E',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
  },
  noticeTitle: {
    fontSize: 10,
    fontWeight: 850,
    color: '#23613D',
  },
  noticeText: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 1.5,
    color: '#558067',
  },
  declinedNotice: {
    marginTop: 14,
    padding: 13,
    borderRadius: 11,
    background: '#FFF1F0',
    border: '1px solid #F0C0BC',
  },
  declinedNoticeTitle: {
    fontSize: 10,
    fontWeight: 850,
    color: '#9D352F',
  },
  declinedNoticeText: {
    marginTop: 3,
    fontSize: 9,
    color: '#AD625D',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
  },
  detailBox: {
    padding: 12,
    borderRadius: 11,
    background: '#F7F9F7',
    border: '1px solid #E5EAE6',
  },
  detailBoxWide: {
    gridColumn: 'span 3',
  },
  detailBoxLabel: {
    fontSize: 8,
    color: '#89958D',
    fontWeight: 750,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  detailBoxValue: {
    marginTop: 5,
    fontSize: 11,
    color: '#24392C',
    fontWeight: 700,
    wordBreak: 'break-word',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  activeStatusDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: '#3DA263',
  },
  statusTitle: {
    fontSize: 11,
    fontWeight: 850,
    color: '#294132',
    textTransform: 'capitalize',
  },
  statusText: {
    marginTop: 2,
    fontSize: 8,
    color: '#86938B',
  },
  strikeBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 15,
    marginTop: 15,
    padding: 12,
    borderRadius: 11,
    background: '#F7F9F7',
  },
  strikeLabel: {
    fontSize: 9,
    fontWeight: 850,
    color: '#32493A',
  },
  strikeText: {
    marginTop: 2,
    fontSize: 7,
    color: '#8B9790',
  },
  strikeValue: {
    fontSize: 18,
    fontWeight: 900,
  },
  quickActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 9,
  },
  quickAction: {
    padding: 12,
    border: '1px solid #E0E7E2',
    borderRadius: 11,
    background: '#FAFBFA',
    textAlign: 'left',
    cursor: 'pointer',
  },
  quickActionIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    background: '#E5F2E8',
    color: '#256442',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  quickActionLabel: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: 850,
    color: '#263D2F',
  },
  quickActionDescription: {
    marginTop: 2,
    fontSize: 8,
    color: '#8B9790',
  },
  schedulePreviewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid #EDF1EE',
  },
  scheduleDateBox: {
    width: 40,
    height: 43,
    flexShrink: 0,
    borderRadius: 9,
    background: '#EDF6EF',
    color: '#246442',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleMonth: {
    fontSize: 7,
    fontWeight: 900,
  },
  scheduleDay: {
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 900,
  },
  scheduleRestaurant: {
    fontSize: 10,
    fontWeight: 800,
    color: '#263D2F',
  },
  scheduleSub: {
    marginTop: 2,
    fontSize: 8,
    color: '#8C9991',
  },
  scheduledBadge: {
    display: 'inline-flex',
    padding: '4px 7px',
    borderRadius: 20,
    background: '#EFF5FF',
    color: '#3565A5',
    border: '1px solid #D5E3F7',
    fontSize: 7,
    fontWeight: 800,
  },
  linkButton: {
    border: 0,
    padding: 0,
    background: 'transparent',
    color: '#276743',
    fontSize: 9,
    fontWeight: 800,
    cursor: 'pointer',
  },
  notificationItem: {
    display: 'flex',
    gap: 9,
    padding: '9px',
    borderBottom: '1px solid #EDF1EE',
    borderRadius: 9,
  },
  notificationItemExpanded: {
    padding: '15px 10px',
  },
  notificationUnread: {
    background: '#F2FAF4',
  },
  notificationTypeIcon: {
    width: 29,
    height: 29,
    flexShrink: 0,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
  },
  notificationSuccess: {
    background: '#EAF7EE',
    color: '#2B764A',
  },
  notificationWarning: {
    background: '#FFF5E5',
    color: '#B56A0A',
  },
  notificationInformation: {
    background: '#EDF4FD',
    color: '#3E6DA4',
  },
  notificationTitle: {
    fontSize: 9,
    fontWeight: 850,
    color: '#293D30',
  },
  notificationText: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 1.45,
    color: '#7C8981',
  },
  notificationTime: {
    marginTop: 5,
    fontSize: 7,
    fontWeight: 750,
    color: '#A2ACA6',
    textTransform: 'uppercase',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 680,
  },
  tableHeader: {
    padding: '9px 10px',
    borderBottom: '1px solid #DFE6E1',
    color: '#849087',
    fontSize: 8,
    fontWeight: 850,
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableCell: {
    padding: '12px 10px',
    borderBottom: '1px solid #EEF2EF',
    color: '#647168',
    fontSize: 9,
  },
  tableCellStrong: {
    padding: '12px 10px',
    borderBottom: '1px solid #EEF2EF',
    color: '#263D2F',
    fontSize: 9,
    fontWeight: 800,
  },
  sectionToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    marginBottom: 18,
  },
  sectionHeading: {
    margin: 0,
    fontSize: 21,
    color: '#1D3E2B',
  },
  sectionDescription: {
    margin: '5px 0 0',
    fontSize: 11,
    color: '#75837A',
  },
  rotationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  rotationCard: {
    padding: 15,
    border: '1px solid #E0E7E2',
    borderRadius: 13,
    background: '#FAFBFA',
  },
  rotationCardToday: {
    borderColor: '#70B487',
    background: '#F1FAF4',
  },
  rotationTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
  },
  rotationWeek: {
    fontSize: 8,
    fontWeight: 850,
    textTransform: 'uppercase',
    color: '#7C8981',
    letterSpacing: 0.7,
  },
  todayBadge: {
    padding: '3px 7px',
    borderRadius: 20,
    background: '#DDF1E3',
    color: '#226541',
    fontSize: 7,
    fontWeight: 850,
  },
  rotationDate: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 800,
    color: '#294231',
  },
  rotationRestaurantRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 15,
  },
  rotationAvatar: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 11,
    background: '#E1EFE5',
    color: '#286646',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 850,
  },
  rotationRestaurantName: {
    fontSize: 10,
    fontWeight: 850,
    color: '#294031',
  },
  rotationAddress: {
    marginTop: 2,
    fontSize: 8,
    color: '#89958E',
  },
  rotationFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 11,
    borderTop: '1px solid #E8ECE9',
  },
  profileGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 0.7fr)',
    gap: 16,
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 18,
    borderBottom: '1px solid #E8EDE9',
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 17,
    background: '#E1F1E5',
    color: '#225F3E',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 850,
  },
  largeProfileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 20,
    background: '#DCEFE1',
    color: '#205E3D',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 900,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 850,
    color: '#213C2B',
  },
  largeProfileName: {
    fontSize: 20,
    fontWeight: 850,
    color: '#213C2B',
  },
  profileType: {
    marginTop: 3,
    fontSize: 10,
    color: '#7E8C83',
  },
  profileStatus: {
    marginTop: 5,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 9,
    color: '#6D7D73',
  },
  approvedBadge: {
    display: 'inline-flex',
    marginTop: 8,
    padding: '4px 8px',
    borderRadius: 20,
    background: '#E7F6EB',
    color: '#216540',
    fontSize: 7,
    fontWeight: 850,
    textTransform: 'capitalize',
  },
  informationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
    marginTop: 17,
  },
  informationItem: {
    padding: 12,
    borderRadius: 10,
    background: '#F7F9F7',
    border: '1px solid #E7ECE8',
  },
  informationLabel: {
    fontSize: 7,
    fontWeight: 850,
    color: '#8A968E',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  informationValue: {
    marginTop: 5,
    fontSize: 10,
    color: '#2B4233',
    fontWeight: 700,
    wordBreak: 'break-word',
  },
  checklistItem: {
    display: 'flex',
    gap: 10,
    padding: '11px 0',
    borderBottom: '1px solid #EDF1EE',
  },
  checklistIcon: {
    width: 25,
    height: 25,
    flexShrink: 0,
    borderRadius: 8,
    background: '#F1F3F2',
    color: '#A1AAA4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  checklistIconComplete: {
    background: '#E5F4E9',
    color: '#287047',
  },
  checklistTitle: {
    fontSize: 9,
    fontWeight: 850,
    color: '#2A4132',
  },
  checklistText: {
    marginTop: 3,
    fontSize: 8,
    lineHeight: 1.45,
    color: '#89958E',
  },
  filterSelect: {
    padding: '9px 12px',
    borderRadius: 9,
    border: '1px solid #D8E1DB',
    background: '#FFFFFF',
    color: '#32483A',
    fontSize: 10,
    outline: 'none',
  },
  emptyState: {
    padding: '34px 20px',
    textAlign: 'center',
  },
  emptyStateCompact: {
    padding: '18px 8px',
  },
  emptyStateIcon: {
    width: 40,
    height: 40,
    margin: '0 auto',
    borderRadius: 12,
    background: '#EDF4EF',
    color: '#48745A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  emptyStateTitle: {
    marginTop: 11,
    fontSize: 12,
    fontWeight: 850,
    color: '#2D4435',
  },
  emptyStateText: {
    maxWidth: 440,
    margin: '5px auto 14px',
    fontSize: 9,
    lineHeight: 1.55,
    color: '#87948C',
  },
  badgeGreen: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 20,
    background: '#EAF7EE',
    border: '1px solid #C6E7CF',
    color: '#247044',
    fontSize: 8,
    fontWeight: 850,
    whiteSpace: 'nowrap',
  },
  badgeAmber: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 20,
    background: '#FFF7E8',
    border: '1px solid #F3DDAE',
    color: '#A7660A',
    fontSize: 8,
    fontWeight: 850,
    whiteSpace: 'nowrap',
  },
  badgeRed: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 20,
    background: '#FFF0EF',
    border: '1px solid #EFC2BF',
    color: '#A23D37',
    fontSize: 8,
    fontWeight: 850,
    whiteSpace: 'nowrap',
  },
  declineOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(16,28,19,.58)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex: 1000,
  },
  declineModal: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: 17,
    padding: 21,
    boxShadow: '0 20px 60px rgba(0,0,0,.24)',
  },
  declineModalTitle: {
    color: '#1E2B21',
    fontSize: 18,
    fontWeight: 780,
  },
  declineModalSubtitle: {
    color: '#707C73',
    fontSize: 13,
    marginTop: 5,
    marginBottom: 14,
  },
  reasonList: {
    display: 'grid',
    gap: 8,
  },
  reasonOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: '1px solid #E1E7E2',
    borderRadius: 10,
    padding: '10px 11px',
    fontSize: 13,
    cursor: 'pointer',
  },
  reasonSelected: {
    borderColor: '#71A477',
    background: '#F0F7F1',
  },
  declineTextarea: {
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 11,
    border: '1px solid #D7DFD8',
    borderRadius: 10,
    padding: 11,
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: 13,
  },
  declineModalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 17,
  },
}