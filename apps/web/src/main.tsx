import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './lib/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Leads from './pages/Leads'
import Pipeline from './pages/Pipeline'
import Activities from './pages/Activities'
import Quotations from './pages/Quotations'
import QuoteDetail from './pages/QuoteDetail'
import Contracts from './pages/Contracts'
import AIWorkspace from './pages/AIWorkspace'
import MobilePreview from './pages/MobilePreview'
import MobileShell from './mobile/MobileShell'
import MobileHome from './mobile/MobileHome'
import MobileCustomers from './mobile/MobileCustomers'
import MobileLeads from './mobile/MobileLeads'
import MobileOpportunities from './mobile/MobileOpportunities'
import MobileTasks from './mobile/MobileTasks'
import Settings from './pages/Settings'
import Products from './pages/Products'
import Documents from './pages/Documents'
import Reports from './pages/Reports'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import MfaChallenge from './pages/MfaChallenge'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login/mfa" element={<MfaChallenge />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/quotations" element={<Quotations />} />
            <Route path="/quotations/:id" element={<QuoteDetail />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/ai" element={<AIWorkspace />} />
            <Route path="/mobile" element={<MobilePreview />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/products" element={<Products />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/reports" element={<Reports />} />
          </Route>
          <Route
            path="/m"
            element={
              <ProtectedRoute>
                <MobileShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<MobileHome />} />
            <Route path="customers" element={<MobileCustomers />} />
            <Route path="leads" element={<MobileLeads />} />
            <Route path="opportunities" element={<MobileOpportunities />} />
            <Route path="tasks" element={<MobileTasks />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
