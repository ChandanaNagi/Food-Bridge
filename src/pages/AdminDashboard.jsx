import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'


export default function AdminDashboard() {

  const navigate = useNavigate()

  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    pending: 0,
    declined: 0
  })

  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)



  useEffect(() => {
    loadDashboard()
  }, [])

  // Close the dropdown if the user clicks anywhere outside of it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])



  const loadDashboard = async () => {

    const { data:{user} } = await supabase.auth.getUser()


    if(!user){
      navigate('/')
      return
    }



    const today = new Date()
      .toISOString()
      .split('T')[0]



    const { data: assignments } = await supabase
      .from('assignments')
      .select('*, restaurants(name), shelters(name)')
      .eq('assignment_date', today)



    if(assignments){

      setPairs(assignments)


      setStats({

        total: assignments.length,


        confirmed:
          assignments.filter(
            a => a.status === 'confirmed'
          ).length,


        pending:
          assignments.filter(
            a =>
              a.status === 'pending' ||
              a.status === 'posted'
          ).length,


        declined:
          assignments.filter(
            a =>
              a.status === 'declined' ||
              a.status === 'reassigning'
          ).length

      })

    }


    setLoading(false)

  }




  const handleSignOut = async()=>{

    await supabase.auth.signOut()

    navigate('/')

  }




  const statusColor = (status)=>{

    if(status === 'confirmed')
      return s.badgeGreen


    if(
      status === 'declined' ||
      status === 'reassigning'
    )
      return s.badgeRed


    return s.badgeAmber

  }

  const goTo = (path) => {
    setMenuOpen(false)
    navigate(path)
  }




  if(loading){

    return(
      <div style={s.loading}>
        Loading...
      </div>
    )

  }




return(

<div style={s.page}>


{/* HEADER */}

<div style={s.header}>

  <div>

    <div style={s.headerSub}>
      FoodBridge Detroit
    </div>


    <div style={s.headerTitle}>
      Admin Dashboard
    </div>

  </div>



  <div style={s.headerRight}>

    <div style={s.badge}>
      Admin
    </div>


    {/* Admin Tools dropdown */}
    <div style={s.menuWrapper} ref={menuRef}>

      <button
        onClick={() => setMenuOpen(open => !open)}
        style={s.menuButton}
      >
        Admin Tools {menuOpen ? '▲' : '▼'}
      </button>

      {menuOpen && (
        <div style={s.dropdown}>

          <button
            onClick={() => goTo('/admin/users')}
            style={s.dropdownItem}
          >
            User Management
          </button>

          <button
            onClick={() => goTo('/admin/strikes')}
            style={s.dropdownItem}
          >
            Strike Management
          </button>

          <button
            onClick={() => goTo('/admin/map')}
            style={s.dropdownItem}
          >
            Donation Heat Map
          </button>

          <button
            onClick={() => goTo('/admin/audit')}
            style={s.dropdownItem}
          >
            Audit Log
          </button>

          <button
            onClick={() => goTo('/admin/analytics')}
            style={s.dropdownItem}
          >
            Analytics
          </button>

        </div>
      )}

    </div>


    <button
      onClick={handleSignOut}
      style={s.signOut}
    >
      Sign out
    </button>

  </div>


</div>





{/* BODY */}

<div style={s.body}>


{/* STATS */}

<div style={s.grid}>

{

[
{
label:"Active pairs",
value:stats.total,
sub:"Today"
},

{
label:"Confirmed",
value:stats.confirmed,
sub:"Today",
color:"#166534"
},

{
label:"Pending",
value:stats.pending,
sub:"Today",
color:"#B45309"
},

{
label:"Declined",
value:stats.declined,
sub:"Today",
color:"#991B1B"
}

].map((item,index)=>(


<div
key={index}
style={s.statCard}
>


<div style={{
fontSize:28,
fontWeight:700,
color:item.color || "#2C5F2D"
}}>
{item.value}
</div>


<div style={{
fontWeight:600,
fontSize:12
}}>
{item.label}
</div>


<div style={{
fontSize:11,
color:"#6B7280"
}}>
{item.sub}
</div>


</div>


))


}

</div>





{/* PAIRS */}

<div style={s.sectionLabel}>
Today's Pairs
</div>



{

pairs.length === 0 ?


<div style={s.empty}>
No assignments today.
</div>



:


pairs.map((p,i)=>(


<div
key={i}
style={s.pairRow}
>


<div>

<div style={s.pairName}>
{p.restaurants?.name}
</div>


<div style={s.pairSub}>
→ {p.shelters?.name}
</div>


</div>



<span style={statusColor(p.status)}>
{p.status}
</span>


</div>


))


}





{/* IMPACT */}

<div style={s.impactCard}>


<div style={s.impactTitle}>
Platform Impact
</div>


<div>
Total assignments:
<b> {pairs.length}</b>
</div>


<div>
Confirmed today:
<b> {stats.confirmed}</b>
</div>



<div>

Participation rate:

<b>
{
stats.total > 0
?
` ${Math.round(
(stats.confirmed/stats.total)*100
)}%`
:
"N/A"
}
</b>


</div>



</div>



</div>


</div>

)

}






const s = {


page:{
minHeight:"100vh",
background:"#F4F8F4",
fontFamily:"system-ui,sans-serif"
},



header:{
background:"#2C5F2D",
padding:"14px 20px",
display:"flex",
justifyContent:"space-between",
alignItems:"center"
},



headerRight:{
display:"flex",
alignItems:"center",
gap:12
},



headerSub:{
fontSize:10,
color:"rgba(255,255,255,.65)"
},



headerTitle:{
fontSize:16,
fontWeight:700,
color:"#fff"
},



badge:{
background:"rgba(255,255,255,.18)",
borderRadius:20,
padding:"3px 10px",
color:"#fff",
fontSize:11
},



signOut:{
background:"none",
border:"1px solid rgba(255,255,255,.4)",
color:"#fff",
borderRadius:8,
padding:"5px 12px",
cursor:"pointer"
},



menuWrapper:{
position:"relative"
},



menuButton:{
background:"rgba(255,255,255,.15)",
border:"1px solid rgba(255,255,255,.4)",
color:"#fff",
borderRadius:8,
padding:"6px 14px",
cursor:"pointer",
fontSize:13,
fontWeight:600
},



dropdown:{
position:"absolute",
top:"calc(100% + 8px)",
right:0,
background:"#fff",
borderRadius:10,
boxShadow:"0 4px 16px rgba(0,0,0,.15)",
padding:8,
display:"flex",
flexDirection:"column",
gap:6,
width:200,
zIndex:50
},



dropdownItem:{
background:"#2C5F2D",
color:"#fff",
border:"none",
borderRadius:8,
padding:"10px 12px",
cursor:"pointer",
fontSize:13,
fontWeight:600,
textAlign:"left"
},



body:{
padding:20,
maxWidth:900,
margin:"0 auto"
},



grid:{
display:"grid",
gridTemplateColumns:"repeat(4,1fr)",
gap:12,
marginBottom:20
},



statCard:{
background:"#fff",
padding:15,
borderRadius:12
},



sectionLabel:{
fontSize:11,
fontWeight:600,
marginBottom:10
},



pairRow:{
background:"#fff",
padding:12,
borderRadius:12,
marginBottom:8,
display:"flex",
justifyContent:"space-between",
alignItems:"center"
},



pairName:{
fontWeight:500
},



pairSub:{
fontSize:11,
color:"#6B7280"
},



impactCard:{
background:"#EBF5EB",
padding:15,
borderRadius:12,
marginTop:20
},



impactTitle:{
fontWeight:600,
color:"#2C5F2D",
marginBottom:10
},



badgeGreen:{
background:"#F0FDF4",
color:"#166534",
padding:"3px 8px",
borderRadius:20
},



badgeAmber:{
background:"#FFFBEB",
color:"#B45309",
padding:"3px 8px",
borderRadius:20
},



badgeRed:{
background:"#FEF2F2",
color:"#991B1B",
padding:"3px 8px",
borderRadius:20
},



empty:{
color:"#6B7280",
fontSize:13
},



loading:{
height:"100vh",
display:"flex",
alignItems:"center",
justifyContent:"center"
}


}