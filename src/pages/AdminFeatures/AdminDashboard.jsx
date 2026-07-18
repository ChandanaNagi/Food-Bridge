import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, declined: 0 })
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/'); return }

    const today = new Date().toISOString().split('T')[0]

    const { data: assignments } = await supabase
      .from('assignments')
      .select('*, restaurants(name), shelters(name)')
      .eq('assignment_date', today)

    if (assignments) {
      setPairs(assignments)
      setStats({
        total: assignments.length,
        confirmed: assignments.filter(a => a.status === 'confirmed').length,
        pending: assignments.filter(a => a.status === 'pending' || a.status === 'posted').length,
        declined: assignments.filter(a => a.status === 'declined' || a.status === 'reassigning').length,
      })
    }

    setLoading(false)
  }


  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const statusColor = (status) => {
    if (status === 'confirmed') return s.badgeGreen
    if (status === 'declined' || status === 'reassigning') return s.badgeRed
    return s.badgeAmber
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.headerSub}>FoodBridge Detroit</div>
          <div style={s.headerTitle}>Admin Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={s.badge}>Admin</div>
          <button onClick={handleSignOut} style={s.signOut}>Sign out</button>
        </div>
      </div>

      <div style={s.body}>

  {/* Admin Management Buttons */}
  <div style={s.dashboardLayout}>

  {/* Main Dashboard Content */}
  <div style={s.mainContent}>

    {/* Stats grid */}
    <div style={s.grid}>
      ...
    </div>

    {/* Today's pairs */}
    ...
    
    {/* Impact card */}
    ...

  </div>


  {/* Right Side Admin Menu */}
  <div style={s.adminSidebar}>

    <h3 style={s.sidebarTitle}>
      Admin Tools
    </h3>


    <button
      onClick={() => navigate("/admin/users")}
      style={s.adminButton}
    >
      User Management
    </button>


    <button
      onClick={() => navigate("/admin/strikes")}
      style={s.adminButton}
    >
      Strike Management
    </button>


    <button
      onClick={() => navigate("/admin/map")}
      style={s.adminButton}
    >
      Donation Heat Map
    </button>


    <button
      onClick={() => navigate("/admin/audit")}
      style={s.adminButton}
    >
      Audit Log
    </button>


    <button
      onClick={() => navigate("/admin/analytics")}
      style={s.adminButton}
    >
      Analytics
    </button>

  </div>

</div>


  {/* Stats grid */}
  <div style={s.grid}>
          {[
            { label: 'Active pairs', value: stats.total, sub: 'Today' },
            { label: 'Confirmed', value: stats.confirmed, sub: 'Today', color: '#166534' },
            { label: 'Pending', value: stats.pending, sub: 'Today', color: '#B45309' },
            { label: 'Declined', value: stats.declined, sub: 'Today', color: '#991B1B' },
          ].map((s2, i) => (
            <div key={i} style={s.statCard}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s2.color || '#2C5F2D' }}>{s2.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 2 }}>{s2.label}</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>{s2.sub}</div>
            </div>
          ))}
        </div>

        {/* Today's pairs */}
        <div style={s.sectionLabel}>Today's Pairs</div>
        {pairs.length === 0 ? (
          <div style={{ color: '#6B7280', fontSize: 13 }}>No assignments for today.</div>
        ) : (
          pairs.map((p, i) => (
            <div key={i} style={s.pairRow}>
              <div>
                <div style={s.pairName}>{p.restaurants?.name}</div>
                <div style={s.pairSub}>→ {p.shelters?.name}</div>
              </div>
              <span style={statusColor(p.status)}>{p.status}</span>
            </div>
          ))
        )}

        {/* Impact card */}
        <div style={s.impactCard}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2C5F2D', marginBottom: 8 }}>Platform Impact</div>
          {[
            ['Total assignments', pairs.length],
            ['Confirmed today', stats.confirmed],
            ['Participation rate', stats.total > 0 ? `${Math.round((stats.confirmed / stats.total) * 100)}%` : 'N/A'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#6B7280' }}>{k}</span>
              <span style={{ fontWeight: 600, color: '#111827' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {


page:{
  minHeight:'100vh',
  background:'#F4F8F4',
  fontFamily:'system-ui,sans-serif'
},


header:{
  background:'#2C5F2D',
  padding:'14px 20px',
  display:'flex',
  justifyContent:'space-between',
  alignItems:'center'
},


headerSub:{
  fontSize:10,
  color:'rgba(255,255,255,.65)'
},


headerTitle:{
  fontSize:16,
  fontWeight:700,
  color:'#fff'
},


badge:{
  background:'rgba(255,255,255,.18)',
  borderRadius:20,
  padding:'3px 10px',
  color:'#fff',
  fontSize:11
},


signOut:{
  background:'none',
  border:'1px solid rgba(255,255,255,.4)',
  color:'#fff',
  borderRadius:8,
  padding:'5px 12px'
},


body:{
  padding:'16px',
  maxWidth:'1200px',
  margin:'0 auto'
},


dashboardLayout:{
  display:'flex',
  gap:20,
  alignItems:'flex-start'
},


mainContent:{
  flex:1
},


adminSidebar:{
  width:220,
  background:'#fff',
  padding:15,
  borderRadius:12,
  boxShadow:'0 1px 4px rgba(0,0,0,.07)'
},


sidebarTitle:{
  fontWeight:700,
  marginBottom:15,
  color:'#2C5F2D'
},


adminButton:{
  width:'100%',
  background:'#2C5F2D',
  color:'#fff',
  border:'none',
  borderRadius:10,
  padding:12,
  marginBottom:10,
  cursor:'pointer'
},


grid:{
  display:'grid',
  gridTemplateColumns:'1fr 1fr',
  gap:10,
  marginBottom:20
},


statCard:{
  background:'#fff',
  padding:14,
  borderRadius:12
},


sectionLabel:{
  fontSize:11,
  fontWeight:600,
  marginBottom:10
},


pairRow:{
  background:'#fff',
  padding:12,
  borderRadius:12,
  marginBottom:8,
  display:'flex',
  justifyContent:'space-between'
},


pairName:{
  fontWeight:500
},


pairSub:{
  fontSize:11,
  color:'#6B7280'
},


impactCard:{
  background:'#EBF5EB',
  padding:14,
  borderRadius:12,
  marginTop:16
},


badgeGreen:{
  background:'#F0FDF4',
  color:'#166534',
  padding:'3px 8px',
  borderRadius:20
},


badgeAmber:{
  background:'#FFFBEB',
  color:'#B45309',
  padding:'3px 8px',
  borderRadius:20
},


badgeRed:{
  background:'#FEF2F2',
  color:'#991B1B',
  padding:'3px 8px',
  borderRadius:20
},


loading:{
  height:'100vh',
  display:'flex',
  alignItems:'center',
  justifyContent:'center'
}


}