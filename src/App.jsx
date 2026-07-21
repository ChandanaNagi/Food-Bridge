import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import RestaurantDashboard from './pages/RestaurantDashboard'
import RestaurantOrganizationQueue from './pages/RestaurantOrganizationQueue'
import PostSurplus from './pages/PostSurplus'
import ShelterDashboard from './pages/ShelterDashboard'
import ShelterOrganizationQueue from './pages/ShelterOrganizationQueue'
import DonationDetail from './pages/DonationDetail'
import AdminDashboard from './pages/AdminDashboard'
import Analytics from './pages/AdminFeatures/Analytics'
import AuditLog from './pages/AdminFeatures/AuditLog'
import DonationHeatMap from './pages/AdminFeatures/DonationHeatMap'
import StrikeManagement from './pages/AdminFeatures/StrikeManagement'
import UserManagement from './pages/AdminFeatures/UserManagement'
import AssignmentManagement from './pages/AdminFeatures/AssignmentManagement'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/restaurant" element={<RestaurantDashboard />} />
        <Route path="/restaurant/organizations" element={<RestaurantOrganizationQueue />} />
        <Route path="/restaurant/post" element={<PostSurplus />} />
        <Route path="/shelter" element={<ShelterDashboard />} />
        <Route path="/shelter/organizations" element={<ShelterOrganizationQueue />} />
        <Route path="/shelter/donation/:id" element={<DonationDetail />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/strikes" element={<StrikeManagement />} />
        <Route path="/admin/map" element={<DonationHeatMap />} />
        <Route path="/admin/audit" element={<AuditLog />} />
        <Route path="/admin/analytics" element={<Analytics />} />
        <Route path="/admin/assignments" element={<AssignmentManagement />} />
      </Routes>
    </Router>
  )
}

export default App