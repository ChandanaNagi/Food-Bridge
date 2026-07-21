import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import logo from "../assets/logo.png";

export default function RestaurantDashboard() {
  const navigate = useNavigate()

  const [restaurant, setRestaurant] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [upcomingAssignments, setUpcomingAssignments] = useState([])
  const [donation, setDonation] = useState(null)
  const [history, setHistory] = useState([])
  const [activeSection, setActiveSection] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')

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

      const { data: restaurantRow, error: restaurantError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (restaurantError) {
        throw restaurantError
      }

      if (!restaurantRow) {
        throw new Error('No restaurant profile was found for this account.')
      }

      setRestaurant(restaurantRow)
      const today = new Date().toISOString().split('T')[0]

      /*
        Load today's assignment.
      */
      const { data: assign, error: assignmentError } = await supabase
        .from('assignments')
        .select('*, shelters(*)')
        .eq('restaurant_id', restaurantRow.id)
        .eq('assignment_date', today)
        .maybeSingle()

      if (assignmentError) throw assignmentError

      setAssignment(assign)

      /*
        Load the restaurant's next assignments.
        These create the weekly rotation schedule.
      */
      const { data: futureAssignments, error: futureError } = await supabase
        .from('assignments')
        .select('*, shelters(*)')
        .eq('restaurant_id', restaurantRow.id)
        .gte('assignment_date', today)
        .order('assignment_date', { ascending: true })
        .limit(8)

      if (futureError) throw futureError

      setUpcomingAssignments(futureAssignments || [])

      /*
        Load the most recent donation for today's assignment.
      */
      if (assign) {
        const { data: donationRows, error: donationError } = await supabase
          .from('donations')
          .select('*')
          .eq('assignment_id', assign.id)
          .order('posted_at', { ascending: false })
          .limit(1)

        if (donationError) throw donationError

        setDonation(
          donationRows && donationRows.length > 0
            ? donationRows[0]
            : null
        )
      } else {
        setDonation(null)
      }

      /*
        Load donation history for this restaurant.
      */
      const { data: hist, error: historyError } = await supabase
        .from('donations')
        .select(
          '*, assignments(assignment_date, shelters(name, address, phone))'
        )
        .eq('restaurant_id', restaurantRow.id)
        .order('posted_at', { ascending: false })
        .limit(10)

      if (historyError) throw historyError

      setHistory(hist || [])
    } catch (err) {
      console.error('Restaurant dashboard error:', err)
      setError(err.message || 'The dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkComplete = async () => {
    if (!donation) return

    try {
      setCompleting(true)
      setError('')

      const { error: updateError } = await supabase
        .from('donations')
        .update({
          status: 'completed',
          handoff_completed_at: new Date().toISOString(),
        })
        .eq('id', donation.id)

      if (updateError) throw updateError

      await loadDashboard()
    } catch (err) {
      console.error('Complete handoff error:', err)
      setError(err.message || 'The handoff could not be completed.')
    } finally {
      setCompleting(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const openSection = (sectionName) => {
    setActiveSection(sectionName)
    setMenuOpen(false)
  }

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.loadingLogo}>FB</div>
        <div style={styles.loadingTitle}>FoodBridge Detroit</div>
        <div style={styles.loadingText}>Loading restaurant portal...</div>
      </div>
    )
  }

  const completedDonations = history.filter(
    (item) => item.status === 'completed'
  )

  const activeDonations = history.filter((item) =>
    ['posted', 'confirmed', 'accepted', 'collected'].includes(item.status)
  )

  const mealsDonated = completedDonations.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  )

  const nextAssignment =
    upcomingAssignments.find(
      (item) => item.assignment_date > new Date().toISOString().split('T')[0]
    ) || null

  // Restaurants can post surplus any time there's an active assignment today,
  // regardless of whether a previous donation already exists for it.
  const canPostSurplus = !!assignment

  const showDonationCard =
    donation && donation.status !== 'declined'

  const notifications = buildNotifications({
    assignment,
    donation,
    nextAssignment,
  })

  return (
    <div style={styles.app}>
      {/* Responsive behavior: inline React styles can't use @media queries,
          so the mobile sidebar/header toggle is handled with real CSS here. */}
      <style>{`
        .fb-mobile-header { display: none; }
        .fb-main { margin-left: 260px; }
        @media (max-width: 900px) {
          .fb-mobile-header { display: flex; }
          .fb-sidebar { transform: translateX(-100%); transition: transform 0.25s ease; }
          .fb-sidebar.fb-sidebar-open { transform: translateX(0); }
          .fb-main { margin-left: 0; padding-top: 66px; }
          .fb-topbar { display: none; }
          .fb-content { padding: 18px; }
          .fb-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .fb-dashboard-grid { grid-template-columns: minmax(0, 1fr); }
          .fb-profile-grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 620px) {
          .fb-stat-grid { grid-template-columns: minmax(0, 1fr); }
          .fb-detail-grid { grid-template-columns: minmax(0, 1fr); }
          .fb-detail-grid > div { grid-column: auto; }
          .fb-rotation-grid { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>

      {/* Mobile header */}
      <div className="fb-mobile-header" style={styles.mobileHeader}>
        <button
          style={styles.mobileMenuButton}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Open navigation"
        >
          ☰
        </button>

        <div>
          <div style={styles.mobileBrand}>FoodBridge</div>
          <div style={styles.mobileRole}>Restaurant Portal</div>
        </div>

        <div style={styles.notificationButton}>
          🔔
          {notifications.length > 0 && (
            <span style={styles.notificationCount}>
              {notifications.length}
            </span>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fb-sidebar${menuOpen ? ' fb-sidebar-open' : ''}`}
        style={styles.sidebar}
      >
        <div style={styles.logoRow}>
          <div style={styles.logoBadge}>
            <img src={logo} alt="FoodBridge" style={{ width: 200, display: "block" }} />
          </div>
        </div>

        <div style={styles.restaurantIdentity}>
          <div style={styles.restaurantAvatar}>
            {getInitials(restaurant?.name)}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={styles.restaurantIdentityName}>
              {restaurant?.name || 'Restaurant'}
            </div>
            <div style={styles.restaurantIdentityType}>
              Restaurant account
            </div>
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
            icon="+"
            label="Post Surplus"
            active={activeSection === 'post'}
            onClick={() => navigate('/restaurant/post')}
          />

          <NavButton
            icon="▣"
            label="Active Donations"
            active={activeSection === 'active'}
            onClick={() => openSection('active')}
          />

          <NavButton
            icon="□"
            label="Weekly Schedule"
            active={activeSection === 'schedule'}
            onClick={() => openSection('schedule')}
          />

          <NavButton
            icon="◉"
            label="Assigned Shelter"
            active={activeSection === 'shelter'}
            onClick={() => openSection('shelter')}
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
            count={notifications.length}
          />
<NavButton
            icon="⚙"
            label="Organization Requests"
            active={false}
            onClick={() => navigate('/restaurant/organizations')}
          />

          <NavButton
            icon="⚙"
            label="Restaurant Profile"
            active={activeSection === 'profile'}
            onClick={() => openSection('profile')}
          />
          <NavButton
            icon="⚙"
            label="Restaurant Profile"
            active={activeSection === 'profile'}
            onClick={() => openSection('profile')}
          />
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.supportCard}>
            <div style={styles.supportIcon}>?</div>
            <div style={styles.supportTitle}>Need assistance?</div>
            <div style={styles.supportText}>
              Contact FoodBridge support if a pickup or donation issue occurs.
            </div>
            <button
              style={styles.supportButton}
              onClick={() => {
                window.location.href = "mailto:support@foodbridgedetroit.org?subject=FoodBridge Support Request";
              }}
            >
              Contact support
            </button>
          </div>

          <button
            style={styles.signOutButton}
            onClick={handleSignOut}
          >
            <span>↪</span>
            Sign out
          </button>
        </div>
      </aside>

      {menuOpen && (
        <div
          style={styles.mobileOverlay}
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="fb-main" style={styles.main}>
        <div className="fb-topbar" style={styles.topBar}>
          <div>
            <div style={styles.pageEyebrow}>
              Restaurant management portal
            </div>

            <h1 style={styles.pageTitle}>
              {sectionTitle(activeSection)}
            </h1>

            <p style={styles.pageSubtitle}>
              {sectionSubtitle(activeSection)}
            </p>
          </div>

          <div style={styles.topBarActions}>
            <button
              style={styles.topNotificationButton}
              onClick={() => openSection('notifications')}
            >
              🔔
              {notifications.length > 0 && (
                <span style={styles.notificationCount}>
                  {notifications.length}
                </span>
              )}
            </button>

            <div style={styles.topProfile}>
              <div style={styles.topProfileAvatar}>
                {getInitials(restaurant?.name)}
              </div>

              <div>
                <div style={styles.topProfileName}>
                  {restaurant?.name}
                </div>
                <div style={styles.topProfileRole}>
                  Restaurant manager
                </div>
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
                style={styles.retryButton}
                onClick={loadDashboard}
              >
                Try again
              </button>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <DashboardSection
              restaurant={restaurant}
              assignment={assignment}
              donation={donation}
              history={history}
              upcomingAssignments={upcomingAssignments}
              notifications={notifications}
              completedCount={completedDonations.length}
              activeCount={activeDonations.length}
              mealsDonated={mealsDonated}
              canPostSurplus={canPostSurplus}
              showDonationCard={showDonationCard}
              completing={completing}
              onPost={() => navigate('/restaurant/post')}
              onComplete={handleMarkComplete}
              onOpenSection={openSection}
            />
          )}

          {activeSection === 'active' && (
            <ActiveDonationsSection
              donation={donation}
              assignment={assignment}
              history={history}
              canPostSurplus={canPostSurplus}
              completing={completing}
              onPost={() => navigate('/restaurant/post')}
              onComplete={handleMarkComplete}
            />
          )}

          {activeSection === 'schedule' && (
            <ScheduleSection
              assignments={upcomingAssignments}
            />
          )}

          {activeSection === 'shelter' && (
            <ShelterSection assignment={assignment} />
          )}

          {activeSection === 'history' && (
            <HistorySection history={history} />
          )}

          {activeSection === 'notifications' && (
            <NotificationsSection
              notifications={notifications}
            />
          )}

          {activeSection === 'profile' && (
            <ProfileSection restaurant={restaurant} />
          )}
        </div>
      </main>
    </div>
  )
}

function DashboardSection({
  restaurant,
  assignment,
  donation,
  history,
  upcomingAssignments,
  notifications,
  completedCount,
  activeCount,
  mealsDonated,
  canPostSurplus,
  showDonationCard,
  completing,
  onPost,
  onComplete,
  onOpenSection,
}) {
  return (
    <>
      <section style={styles.welcomeBanner}>
        <div style={styles.welcomeContent}>
          <div style={styles.welcomeLabel}>Welcome back</div>

          <h2 style={styles.welcomeTitle}>
            {restaurant?.name || 'Restaurant Partner'}
          </h2>

          <p style={styles.welcomeText}>
            Manage surplus donations, shelter assignments and weekly pickups
            from one place.
          </p>

          <div style={styles.welcomeActions}>
            <button
              style={styles.primaryWhiteButton}
              onClick={onPost}
            >
              + Post surplus
            </button>

            <button
              style={styles.secondaryWhiteButton}
              onClick={() => onOpenSection('schedule')}
            >
              View weekly schedule
            </button>
          </div>
        </div>

        <div style={styles.welcomeGraphic}>
          <div style={styles.welcomeGraphicCircle}>♻</div>
          <div style={styles.welcomeGraphicText}>
            Turning surplus into support
          </div>
        </div>
      </section>

      <section className="fb-stat-grid" style={styles.statGrid}>
        <StatCard
          icon="◉"
          title="Meals donated"
          value={mealsDonated}
          detail="Estimated portions completed"
          tone="green"
        />

        <StatCard
          icon="▣"
          title="Active donations"
          value={activeCount}
          detail="Currently in progress"
          tone="blue"
        />

        <StatCard
          icon="✓"
          title="Completed pickups"
          value={completedCount}
          detail="Successful handoffs"
          tone="purple"
        />

        <StatCard
          icon="□"
          title="Upcoming assignments"
          value={upcomingAssignments.length}
          detail="Scheduled rotations"
          tone="orange"
        />
      </section>

      <section className="fb-dashboard-grid" style={styles.dashboardGrid}>
        <div style={styles.largeColumn}>
          <CurrentAssignmentCard
            assignment={assignment}
            donation={donation}
            canPostSurplus={canPostSurplus}
            onPost={onPost}
            onComplete={onComplete}
            completing={completing}
          />

          {donation?.status === 'declined' && (
            <DeclinedCard
              assignment={assignment}
              donation={donation}
              onPost={onPost}
            />
          )}

          {showDonationCard && (
            <DonationDetailsCard donation={donation} />
          )}

          <RecentHistoryCard
            history={history}
            onViewAll={() => onOpenSection('history')}
          />
        </div>

        <div style={styles.smallColumn}>
          <QuickActions
            onPost={onPost}
            onSchedule={() => onOpenSection('schedule')}
            onShelter={() => onOpenSection('shelter')}
            onHistory={() => onOpenSection('history')}
          />

          <UpcomingScheduleCard
            assignments={upcomingAssignments}
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

function CurrentAssignmentCard({
  assignment,
  donation,
  canPostSurplus,
  onPost,
  onComplete,
  completing,
}) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Current rotation"
        title="Today's shelter assignment"
        action={
          assignment && (
            <span style={badgeStyle(donation?.status)}>
              {donation
                ? statusLabel(donation.status)
                : 'Awaiting surplus'}
            </span>
          )
        }
      />

      {assignment ? (
        <div>
          <div style={styles.assignmentHero}>
            <div style={styles.shelterLargeAvatar}>
              {getInitials(assignment.shelters?.name)}
            </div>

            <div style={styles.assignmentHeroContent}>
              <div style={styles.assignmentShelterName}>
                {assignment.shelters?.name || 'Assigned shelter'}
              </div>

              <div style={styles.assignmentDate}>
                {formatFullDate(assignment.assignment_date)}
              </div>

              <div style={styles.assignmentMeta}>
                <span>
                  📍 {assignment.shelters?.address || 'Detroit, Michigan'}
                </span>

                <span>
                  🕒 {donation?.pickup_window || 'Pickup window not posted'}
                </span>
              </div>
            </div>
          </div>

          <div style={styles.assignmentProgress}>
            <ProgressStep
              label="Scheduled"
              complete
            />

            <ProgressLine
              complete={Boolean(donation)}
            />

            <ProgressStep
              label="Surplus posted"
              complete={Boolean(donation)}
            />

            <ProgressLine
              complete={[
                'confirmed',
                'accepted',
                'collected',
                'completed',
              ].includes(donation?.status)}
            />

            <ProgressStep
              label="Confirmed"
              complete={[
                'confirmed',
                'accepted',
                'collected',
                'completed',
              ].includes(donation?.status)}
            />

            <ProgressLine
              complete={donation?.status === 'completed'}
            />

            <ProgressStep
              label="Completed"
              complete={donation?.status === 'completed'}
            />
          </div>

          <div style={styles.assignmentActions}>
            {canPostSurplus && (
              <button
                style={styles.primaryButton}
                onClick={onPost}
              >
                + Post today's surplus
              </button>
            )}

            {donation &&
              donation.status !== 'completed' &&
              donation.status !== 'declined' && (
                <button
                  style={styles.primaryButton}
                  onClick={onComplete}
                  disabled={completing}
                >
                  {completing
                    ? 'Updating handoff...'
                    : 'Mark handoff complete'}
                </button>
              )}

            <button style={styles.secondaryButton}>
              Contact shelter
            </button>
          </div>

          {donation?.status === 'posted' && (
            <div style={styles.successNotice}>
              <div style={styles.noticeIcon}>✓</div>

              <div>
                <div style={styles.noticeTitle}>
                  Donation posted successfully
                </div>

                <div style={styles.noticeText}>
                  {assignment.shelters?.name} has been notified and can
                  respond from its shelter portal.
                </div>
              </div>
            </div>
          )}

          {donation?.status === 'completed' && (
            <div style={styles.successNotice}>
              <div style={styles.noticeIcon}>✓</div>

              <div>
                <div style={styles.noticeTitle}>
                  Handoff completed
                </div>

                <div style={styles.noticeText}>
                  Completed{' '}
                  {donation.handoff_completed_at
                    ? formatDateTime(donation.handoff_completed_at)
                    : 'successfully'}
                  .
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon="□"
          title="No assignment scheduled today"
          text="When the weekly rotation is generated, today's shelter assignment will appear here."
        />
      )}
    </div>
  )
}

function DonationDetailsCard({ donation }) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Active listing"
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

function DeclinedCard({ assignment, donation, onPost }) {
  return (
    <div style={styles.declinedPanel}>
      <div style={styles.declinedIcon}>!</div>

      <div style={{ flex: 1 }}>
        <div style={styles.declinedTitle}>
          Previous donation declined
        </div>

        <div style={styles.declinedText}>
          {assignment?.shelters?.name || 'The assigned shelter'} declined
          the previous listing
          {donation.decline_reason
            ? ` because: ${donation.decline_reason}`
            : '.'}
        </div>
      </div>

      <button
        style={styles.declinedButton}
        onClick={onPost}
      >
        Post replacement
      </button>
    </div>
  )
}

function QuickActions({
  onPost,
  onSchedule,
  onShelter,
  onHistory,
}) {
  return (
    <div style={styles.panel}>
      <PanelHeader
        eyebrow="Common tasks"
        title="Quick actions"
      />

      <div style={styles.quickActionGrid}>
        <QuickAction
          icon="+"
          label="Post surplus"
          description="Create a food listing"
          onClick={onPost}
        />

        <QuickAction
          icon="□"
          label="Schedule"
          description="View rotations"
          onClick={onSchedule}
        />

        <QuickAction
          icon="◉"
          label="Shelter"
          description="View contact details"
          onClick={onShelter}
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
        title="Upcoming schedule"
        action={
          <button
            style={styles.linkButton}
            onClick={onViewAll}
          >
            View all
          </button>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon="□"
          title="No upcoming rotations"
          text="Future restaurant-to-shelter assignments will appear here."
          compact
        />
      ) : (
        <div>
          {assignments.slice(0, 4).map((item, index) => (
            <div
              key={item.id || index}
              style={styles.schedulePreviewRow}
            >
              <div style={styles.scheduleDateBox}>
                <div style={styles.scheduleMonth}>
                  {getMonth(item.assignment_date)}
                </div>

                <div style={styles.scheduleDay}>
                  {getDay(item.assignment_date)}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={styles.scheduleShelter}>
                  {item.shelters?.name || 'Shelter assignment'}
                </div>

                <div style={styles.scheduleSub}>
                  {formatWeekLabel(item.assignment_date)}
                </div>
              </div>

              <span style={styles.scheduledBadge}>
                Scheduled
              </span>
            </div>
          ))}
        </div>
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
          <button
            style={styles.linkButton}
            onClick={onViewAll}
          >
            View all
          </button>
        }
      />

      {notifications.slice(0, 3).map((item) => (
        <NotificationItem
          key={item.id}
          notification={item}
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
          <button
            style={styles.linkButton}
            onClick={onViewAll}
          >
            View all
          </button>
        }
      />

      {history.length === 0 ? (
        <EmptyState
          icon="▥"
          title="No donations recorded"
          text="Completed and active donation listings will appear here."
        />
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Shelter</th>
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
                    {item.assignments?.shelters?.name || 'Shelter'}
                  </td>

                  <td style={styles.tableCell}>
                    {formatShortDate(
                      item.assignments?.assignment_date ||
                        item.posted_at
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

function ActiveDonationsSection({
  donation,
  assignment,
  history,
  canPostSurplus,
  completing,
  onPost,
  onComplete,
}) {
  const activeHistory = history.filter((item) =>
    ['posted', 'confirmed', 'accepted', 'collected'].includes(item.status)
  )

  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Active donations</h2>
          <p style={styles.sectionDescription}>
            Review listings that are awaiting confirmation, pickup or
            completion.
          </p>
        </div>

        <button
          style={styles.primaryButton}
          onClick={onPost}
        >
          + Post surplus
        </button>
      </div>

      {donation && donation.status !== 'declined' ? (
        <>
          <CurrentAssignmentCard
            assignment={assignment}
            donation={donation}
            canPostSurplus={canPostSurplus}
            onPost={onPost}
            onComplete={onComplete}
            completing={completing}
          />

          <DonationDetailsCard donation={donation} />
        </>
      ) : (
        <div style={styles.panel}>
          <EmptyState
            icon="▣"
            title="No active donation"
            text="Post available food surplus for today's assigned shelter."
            actionLabel={canPostSurplus ? 'Post surplus' : undefined}
            onAction={canPostSurplus ? onPost : undefined}
          />
        </div>
      )}

      {activeHistory.length > 1 && (
        <div style={styles.panel}>
          <PanelHeader
            eyebrow="In progress"
            title="Other active listings"
          />

          {activeHistory.map((item) => (
            <HistoryListRow
              key={item.id}
              item={item}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleSection({ assignments }) {
  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>
            Weekly rotation schedule
          </h2>

          <p style={styles.sectionDescription}>
            View the shelters assigned to this restaurant over the next
            several weeks.
          </p>
        </div>
      </div>

      <div style={styles.panel}>
        {assignments.length === 0 ? (
          <EmptyState
            icon="□"
            title="No rotation schedule available"
            text="An administrator must create assignments for this restaurant."
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
                    {index === 0
                      ? 'Current rotation'
                      : `Rotation ${index + 1}`}
                  </span>

                  {isToday(item.assignment_date) && (
                    <span style={styles.todayBadge}>Today</span>
                  )}
                </div>

                <div style={styles.rotationDate}>
                  {formatFullDate(item.assignment_date)}
                </div>

                <div style={styles.rotationShelterRow}>
                  <div style={styles.rotationAvatar}>
                    {getInitials(item.shelters?.name)}
                  </div>

                  <div>
                    <div style={styles.rotationShelterName}>
                      {item.shelters?.name || 'Shelter assignment'}
                    </div>

                    <div style={styles.rotationAddress}>
                      {item.shelters?.address || 'Detroit, Michigan'}
                    </div>
                  </div>
                </div>

                <div style={styles.rotationFooter}>
                  <span style={styles.scheduledBadge}>
                    Scheduled
                  </span>

                  <button style={styles.linkButton}>
                    View details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShelterSection({ assignment }) {
  const shelter = assignment?.shelters

  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Assigned shelter</h2>

          <p style={styles.sectionDescription}>
            View the organization assigned to receive today's available
            surplus.
          </p>
        </div>
      </div>

      {shelter ? (
        <div style={styles.profileGrid}>
          <div style={styles.panel}>
            <div style={styles.shelterProfileHeader}>
              <div style={styles.shelterProfileAvatar}>
                {getInitials(shelter.name)}
              </div>

              <div>
                <div style={styles.shelterProfileName}>
                  {shelter.name || 'Assigned shelter'}
                </div>

                <div style={styles.shelterProfileStatus}>
                  <span style={styles.activeDot} />
                  Active FoodBridge partner
                </div>
              </div>
            </div>

            <div style={styles.profileInformationGrid}>
              <InformationItem
                label="Address"
                value={shelter.address || 'Address not provided'}
              />

              <InformationItem
                label="Phone"
                value={shelter.phone || 'Phone not provided'}
              />

              <InformationItem
                label="Email"
                value={shelter.email || 'Email not provided'}
              />

              <InformationItem
                label="Current assignment"
                value={formatFullDate(assignment.assignment_date)}
              />
            </div>

            <div style={styles.assignmentActions}>
              {shelter.phone && (
                <button
                  style={styles.primaryButton}
                  onClick={() => {
                    window.location.href = `tel:${shelter.phone}`
                  }}
                >
                  Call shelter
                </button>
              )}

              {shelter.address && (
                <button
                  style={styles.secondaryButton}
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        shelter.address
                      )}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }}
                >
                  View directions
                </button>
              )}
            </div>
          </div>

          <div style={styles.panel}>
            <PanelHeader
              eyebrow="Pickup preparation"
              title="Before the shelter arrives"
            />

            <ChecklistItem
              complete
              title="Confirm food packaging"
              text="Use sealed, food-safe containers."
            />

            <ChecklistItem
              complete={false}
              title="Label allergens"
              text="Clearly identify any known allergens."
            />

            <ChecklistItem
              complete={false}
              title="Maintain safe temperature"
              text="Keep food at the required temperature until collection."
            />

            <ChecklistItem
              complete={false}
              title="Confirm the handoff"
              text="Mark the donation completed after shelter collection."
            />
          </div>
        </div>
      ) : (
        <div style={styles.panel}>
          <EmptyState
            icon="◉"
            title="No shelter assigned today"
            text="The assigned shelter's contact and pickup details will appear here when an assignment is created."
          />
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
            Review previous listings, shelter assignments and completed
            handoffs.
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
                  <th style={styles.tableHeader}>Shelter</th>
                  <th style={styles.tableHeader}>Assignment date</th>
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
                      {item.assignments?.shelters?.name || 'Shelter'}
                    </td>

                    <td style={styles.tableCell}>
                      {formatShortDate(
                        item.assignments?.assignment_date ||
                          item.posted_at
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

function NotificationsSection({ notifications }) {
  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Notifications</h2>

          <p style={styles.sectionDescription}>
            View assignment updates, pickup reminders and donation status
            changes.
          </p>
        </div>

        <span style={styles.notificationSummaryBadge}>
          {notifications.length} active
        </span>
      </div>

      <div style={styles.panel}>
        {notifications.length === 0 ? (
          <EmptyState
            icon="◫"
            title="You're all caught up"
            text="New donation and pickup updates will appear here."
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

function ProfileSection({ restaurant }) {
  return (
    <div>
      <div style={styles.sectionToolbar}>
        <div>
          <h2 style={styles.sectionHeading}>Restaurant profile</h2>

          <p style={styles.sectionDescription}>
            Review the organization information associated with this account.
          </p>
        </div>

        <button style={styles.secondaryButton}>
          Request profile update
        </button>
      </div>

      <div className="fb-profile-grid" style={styles.profileGrid}>
        <div style={styles.panel}>
          <div style={styles.restaurantProfileHeader}>
            <div style={styles.largeRestaurantAvatar}>
              {getInitials(restaurant?.name)}
            </div>

            <div>
              <div style={styles.restaurantProfileName}>
                {restaurant?.name || 'Restaurant'}
              </div>

              <div style={styles.restaurantProfileType}>
                FoodBridge restaurant partner
              </div>

              <span style={styles.approvedBadge}>
                {restaurant?.status || 'Approved'}
              </span>
            </div>
          </div>

          <div style={styles.profileInformationGrid}>
            <InformationItem
              label="Restaurant name"
              value={restaurant?.name || 'Not provided'}
            />

            <InformationItem
              label="Email address"
              value={restaurant?.email || 'Not provided'}
            />

            <InformationItem
              label="Phone number"
              value={restaurant?.phone || 'Not provided'}
            />

            <InformationItem
              label="Address"
              value={restaurant?.address || 'Not provided'}
            />

            <InformationItem
              label="Contact person"
              value={
                restaurant?.contact_name ||
                restaurant?.contact_person ||
                'Not provided'
              }
            />

            <InformationItem
              label="Operating hours"
              value={
                restaurant?.operating_hours ||
                restaurant?.hours ||
                'Not provided'
              }
            />
          </div>
        </div>

        <div style={styles.panel}>
          <PanelHeader
            eyebrow="Account readiness"
            title="Profile checklist"
          />

          <ChecklistItem
            complete={Boolean(restaurant?.name)}
            title="Organization name"
            text="Displayed throughout the restaurant portal."
          />

          <ChecklistItem
            complete={Boolean(restaurant?.email)}
            title="Account email"
            text="Used for sign-in and FoodBridge communication."
          />

          <ChecklistItem
            complete={Boolean(restaurant?.phone)}
            title="Contact phone"
            text="Helps shelters coordinate pickups."
          />

          <ChecklistItem
            complete={Boolean(restaurant?.address)}
            title="Pickup address"
            text="Required for shelter directions and route planning."
          />
        </div>
      </div>
    </div>
  )
}

function NavButton({
  icon,
  label,
  active,
  onClick,
  count,
}) {
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

      {count > 0 && (
        <span style={styles.navCount}>{count}</span>
      )}
    </button>
  )
}

function StatCard({
  icon,
  title,
  value,
  detail,
  tone,
}) {
  const toneStyles = {
    green: {
      background: '#ECFDF3',
      color: '#137A45',
    },
    blue: {
      background: '#EFF6FF',
      color: '#2563EB',
    },
    purple: {
      background: '#F5F3FF',
      color: '#7C3AED',
    },
    orange: {
      background: '#FFF7ED',
      color: '#EA580C',
    },
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

function PanelHeader({
  eyebrow,
  title,
  action,
}) {
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

function ProgressStep({
  label,
  complete,
}) {
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

function DetailBox({
  label,
  value,
  wide,
}) {
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

function QuickAction({
  icon,
  label,
  description,
  onClick,
}) {
  return (
    <button
      type="button"
      style={styles.quickAction}
      onClick={onClick}
    >
      <div style={styles.quickActionIcon}>{icon}</div>

      <div style={styles.quickActionLabel}>{label}</div>

      <div style={styles.quickActionDescription}>
        {description}
      </div>
    </button>
  )
}

function NotificationItem({
  notification,
  expanded = false,
}) {
  return (
    <div
      style={{
        ...styles.notificationItem,
        ...(expanded ? styles.notificationItemExpanded : {}),
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
        {notification.icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={styles.notificationTitle}>
          {notification.title}
        </div>

        <div style={styles.notificationText}>
          {notification.text}
        </div>

        {expanded && (
          <div style={styles.notificationTime}>
            {notification.time || 'Current update'}
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryListRow({ item }) {
  return (
    <div style={styles.historyListRow}>
      <div>
        <div style={styles.historyListName}>
          {item.assignments?.shelters?.name || 'Shelter'}
        </div>

        <div style={styles.historyListSub}>
          {item.food_items || 'Food donation'} ·{' '}
          {item.quantity || 0} portions
        </div>
      </div>

      <span style={badgeStyle(item.status)}>
        {statusLabel(item.status)}
      </span>
    </div>
  )
}

function InformationItem({
  label,
  value,
}) {
  return (
    <div style={styles.informationItem}>
      <div style={styles.informationLabel}>{label}</div>
      <div style={styles.informationValue}>{value}</div>
    </div>
  )
}

function ChecklistItem({
  complete,
  title,
  text,
}) {
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
          style={styles.primaryButton}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function buildNotifications({
  assignment,
  donation,
  nextAssignment,
}) {
  const items = []

  if (assignment && !donation) {
    items.push({
      id: 'surplus-required',
      icon: '+',
      tone: 'warning',
      title: 'Surplus listing needed',
      text: `You are assigned to ${
        assignment.shelters?.name || 'a shelter'
      } today. Post available food when ready.`,
      time: 'Today',
    })
  }

  if (donation?.status === 'posted') {
    items.push({
      id: 'donation-posted',
      icon: '✓',
      tone: 'success',
      title: 'Donation submitted',
      text: `${
        assignment?.shelters?.name || 'The assigned shelter'
      } has been notified of the available surplus.`,
      time: donation.posted_at
        ? formatDateTime(donation.posted_at)
        : 'Recently',
    })
  }

  if (
    ['confirmed', 'accepted'].includes(donation?.status)
  ) {
    items.push({
      id: 'donation-confirmed',
      icon: '✓',
      tone: 'success',
      title: 'Shelter confirmed pickup',
      text: `${
        assignment?.shelters?.name || 'The shelter'
      } accepted the donation${
        donation.pickup_window
          ? ` for ${donation.pickup_window}`
          : ''
      }.`,
      time: 'Current assignment',
    })
  }

  if (donation?.status === 'collected') {
    items.push({
      id: 'donation-collected',
      icon: '◉',
      tone: 'information',
      title: 'Donation collected',
      text: 'Confirm the handoff to complete this donation record.',
      time: 'Current assignment',
    })
  }

  if (donation?.status === 'declined') {
    items.push({
      id: 'donation-declined',
      icon: '!',
      tone: 'warning',
      title: 'Donation declined',
      text:
        donation.decline_reason ||
        'The assigned shelter could not accept the previous listing. You may post a replacement.',
      time: 'Current assignment',
    })
  }

  if (nextAssignment) {
    items.push({
      id: 'next-assignment',
      icon: '□',
      tone: 'information',
      title: 'Upcoming rotation',
      text: `Your next assignment is ${
        nextAssignment.shelters?.name || 'a shelter'
      } on ${formatFullDate(nextAssignment.assignment_date)}.`,
      time: 'Upcoming',
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'welcome',
      icon: '✓',
      tone: 'success',
      title: 'Restaurant portal ready',
      text: 'There are no urgent actions required at this time.',
      time: 'Current status',
    })
  }

  return items
}

function sectionTitle(section) {
  const titles = {
    dashboard: 'Dashboard',
    active: 'Active donations',
    schedule: 'Weekly schedule',
    shelter: 'Assigned shelter',
    history: 'Donation history',
    notifications: 'Notifications',
    profile: 'Restaurant profile',
  }

  return titles[section] || 'Restaurant portal'
}

function sectionSubtitle(section) {
  const subtitles = {
    dashboard:
      "Track today's donation, scheduled rotations and restaurant impact.",
    active:
      'Manage surplus listings that are awaiting pickup or completion.',
    schedule:
      'Review upcoming restaurant-to-shelter assignments.',
    shelter:
      "View the shelter assigned to receive today's donation.",
    history:
      'Review previous donations and completed handoffs.',
    notifications:
      'Stay updated on donation and pickup activity.',
    profile:
      'Review your FoodBridge restaurant account information.',
  }

  return subtitles[section] || ''
}

function statusLabel(status) {
  const labels = {
    posted: 'Posted',
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
    ['completed', 'confirmed', 'accepted', 'collected'].includes(
      status
    )
  ) {
    return styles.badgeGreen
  }

  if (
    ['declined', 'cancelled', 'expired'].includes(status)
  ) {
    return styles.badgeRed
  }

  return styles.badgeAmber
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
    .toLocaleDateString('en-US', {
      month: 'short',
    })
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

  notificationButton: {
    position: 'relative',
    fontSize: 20,
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

  logoBadge: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
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

  restaurantIdentity: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    marginTop: 28,
    padding: 12,
    borderRadius: 14,
    background: 'rgba(255,255,255,0.08)',
  },

  restaurantAvatar: {
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

  restaurantIdentityName: {
    fontSize: 13,
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  restaurantIdentityType: {
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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

  shelterLargeAvatar: {
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

  assignmentShelterName: {
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

  successNotice: {
    display: 'flex',
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

  declinedPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    marginBottom: 16,
    borderRadius: 13,
    background: '#FFF1F0',
    border: '1px solid #F2C0BC',
  },

  declinedIcon: {
    width: 31,
    height: 31,
    flexShrink: 0,
    borderRadius: 10,
    background: '#D9524A',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },

  declinedTitle: {
    fontSize: 11,
    fontWeight: 850,
    color: '#9B302A',
  },

  declinedText: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 1.45,
    color: '#A95B56',
  },

  declinedButton: {
    border: 0,
    borderRadius: 8,
    padding: '9px 12px',
    background: '#A83B34',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 800,
    cursor: 'pointer',
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

  scheduleShelter: {
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
    padding: '9px 0',
    borderBottom: '1px solid #EDF1EE',
  },

  notificationItemExpanded: {
    padding: '15px 3px',
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

  rotationShelterRow: {
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

  rotationShelterName: {
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

  shelterProfileGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 0.7fr)',
    gap: 16,
  },

  shelterProfileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    paddingBottom: 17,
    borderBottom: '1px solid #E8EDE9',
  },

  shelterProfileAvatar: {
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

  shelterProfileName: {
    fontSize: 18,
    fontWeight: 850,
    color: '#213C2B',
  },

  shelterProfileStatus: {
    marginTop: 5,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 9,
    color: '#6D7D73',
  },

  activeDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#42A568',
  },

  profileGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 0.7fr)',
    gap: 16,
  },

  restaurantProfileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 18,
    borderBottom: '1px solid #E8EDE9',
  },

  largeRestaurantAvatar: {
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

  restaurantProfileName: {
    fontSize: 20,
    fontWeight: 850,
    color: '#213C2B',
  },

  restaurantProfileType: {
    marginTop: 3,
    fontSize: 10,
    color: '#7E8C83',
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

  profileInformationGrid: {
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

  historyListRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '11px 0',
    borderBottom: '1px solid #EDF1EE',
  },

  historyListName: {
    fontSize: 10,
    fontWeight: 800,
    color: '#293F31',
  },

  historyListSub: {
    marginTop: 2,
    fontSize: 8,
    color: '#89968E',
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

  notificationSummaryBadge: {
    padding: '6px 10px',
    borderRadius: 20,
    background: '#E9F4EC',
    color: '#256442',
    fontSize: 9,
    fontWeight: 850,
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
}