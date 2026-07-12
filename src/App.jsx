import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import RestaurantDashboard from './pages/RestaurantDashboard'
import PostSurplus from './pages/PostSurplus'
import ShelterDashboard from './pages/ShelterDashboard'
import DonationDetail from './pages/DonationDetail'
import AdminDashboard from './pages/AdminDashboard'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/restaurant" element={<RestaurantDashboard />} />
        <Route path="/restaurant/post" element={<PostSurplus />} />
        <Route path="/shelter" element={<ShelterDashboard />} />
        <Route path="/shelter/donation/:id" element={<DonationDetail />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  )
}

export default App