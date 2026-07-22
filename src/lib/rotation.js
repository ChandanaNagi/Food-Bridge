import { supabase } from '../supabaseClient'

/**
 * Rotation-based auto-assignment.
 *
 * Instead of requiring an admin to manually pair every restaurant with a
 * shelter each day, this computes a deterministic round-robin pairing from
 * the calendar date. Any dashboard (admin, restaurant, or shelter) can call
 * `ensureTodaysRotation()` on load — if today's assignments already exist
 * (whether created by a previous rotation run or manually by an admin),
 * nothing happens. If they don't, the missing ones are filled in.
 *
 * This keeps things simple to reason about:
 *  - No cron job / server needed — it "self-heals" whenever anyone loads
 *    the app on a new day.
 *  - The same date always produces the same pairing, no matter who
 *    triggers the check or how many times it runs.
 *  - Admins can still manually create/delete individual assignments
 *    (via Assignment Management) — rotation only fills in gaps, it never
 *    overwrites an assignment that already exists for that restaurant
 *    that day.
 *  - When there are more restaurants than shelters, multiple restaurants
 *    are paired with the same shelter that day (per FoodBridge policy).
 *    The offset shifts by one each day, so over time restaurants rotate
 *    across different shelters rather than always hitting the same one.
 */

function getLocalDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

// Deterministic day counter from a YYYY-MM-DD string, independent of the
// caller's timezone (parses the calendar date directly instead of relying
// on `new Date(dateStr)` local-vs-UTC parsing quirks).
function dayIndexFromDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

const DUPLICATE_KEY_CODE = '23505'

/**
 * Ensures today's rotation assignments exist for every approved,
 * non-closed restaurant. Safe to call from multiple places/dashboards —
 * duplicate-key races are swallowed silently since another caller simply
 * beat this one to it.
 *
 * @returns {Promise<{ created: number, skipped: number }>}
 */
export async function ensureTodaysRotation() {
  const today = getLocalDateString()

  try {
    const [
      { data: restaurants, error: restaurantsError },
      { data: shelters, error: sheltersError },
      { data: todaysAssignments, error: assignmentsError },
      { data: closures, error: closuresError },
    ] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id')
        .ilike('status', 'approved')
        .order('id', { ascending: true }),
      supabase
        .from('shelters')
        .select('id')
        .ilike('status', 'approved')
        .order('id', { ascending: true }),
      supabase
        .from('assignments')
        .select('restaurant_id')
        .eq('assignment_date', today),
      supabase
        .from('restaurant_closures')
        .select('restaurant_id')
        .eq('closure_date', today),
    ])

    if (restaurantsError) throw restaurantsError
    if (sheltersError) throw sheltersError
    if (assignmentsError) throw assignmentsError
    if (closuresError) throw closuresError

    if (!restaurants?.length || !shelters?.length) {
      return { created: 0, skipped: 0 }
    }

    const alreadyAssigned = new Set(
      (todaysAssignments || []).map((row) => row.restaurant_id)
    )
    const closedToday = new Set(
      (closures || []).map((row) => row.restaurant_id)
    )

    const dayOffset = dayIndexFromDateString(today)

    // Index against the *full* approved restaurant list (not just the
    // ones missing an assignment) so the rotation offset stays stable
    // day to day regardless of which restaurants already had one filled
    // in manually.
    const rowsToInsert = restaurants
      .map((restaurant, index) => ({ restaurant, index }))
      .filter(
        ({ restaurant }) =>
          !alreadyAssigned.has(restaurant.id) && !closedToday.has(restaurant.id)
      )
      .map(({ restaurant, index }) => {
        const shelter = shelters[(index + dayOffset) % shelters.length]
        return {
          restaurant_id: restaurant.id,
          shelter_id: shelter.id,
          assignment_date: today,
          status: 'pending',
        }
      })

    if (rowsToInsert.length === 0) {
      return { created: 0, skipped: 0 }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('assignments')
      .insert(rowsToInsert)
      .select('id')

    if (insertError) {
      // Another dashboard load likely won the race and inserted the same
      // rows a moment earlier — that's fine, not a real failure.
      if (insertError.code === DUPLICATE_KEY_CODE) {
        return { created: 0, skipped: rowsToInsert.length }
      }
      throw insertError
    }

    return { created: inserted?.length || 0, skipped: 0 }
  } catch (err) {
    // Rotation is a convenience layer, not a critical path — if it fails
    // for any reason, log it and let the calling dashboard fall back to
    // whatever assignments already exist (admins can always fall back to
    // creating one manually in Assignment Management).
    console.error('Rotation auto-assignment failed:', err)
    return { created: 0, skipped: 0, error: err }
  }
}