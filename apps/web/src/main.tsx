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
import LeadDetail from './pages/LeadDetail'
import Pipeline from './pages/Pipeline'
import Activities from './pages/Activities'
import Quotations from './pages/Quotations'
import QuoteDetail from './pages/QuoteDetail'
import Contracts from './pages/Contracts'
import AIWorkspace from './pages/AIWorkspace'
import MobileShell from './mobile/MobileShell'
import MobileHome from './mobile/MobileHome'
import MobileCustomers from './mobile/MobileCustomers'
import MobileLeads from './mobile/MobileLeads'
import MobileOpportunities from './mobile/MobileOpportunities'
import MobileTasks from './mobile/MobileTasks'
import { MobileCustomerDetail, MobileLeadDetail, MobileOpportunityDetail, MobileTaskDetail } from './mobile/MobileDetails'
import MobileContracts, { MobileContractDetail } from './mobile/MobileContracts'
import MobileDocuments, { MobileDocumentDetail } from './mobile/MobileDocuments'
import MobileQuotations, { MobileQuotationDetail } from './mobile/MobileQuotations'
import MobileInbox, { MobileInboxThread } from './mobile/MobileInbox'
import MobileReports from './mobile/MobileReports'
import MobileNearby from './mobile/MobileNearby'
import MobileAi from './mobile/MobileAi'
import MobileMore from './mobile/MobileMore'
import Settings from './pages/Settings'
import Products from './pages/Products'
import Documents from './pages/Documents'
import Reports from './pages/Reports'
import AuditLog from './pages/AuditLog'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import MfaChallenge from './pages/MfaChallenge'
import './index.css'
import { drainAll } from './lib/offlineQueue'
import { useResponsiveRedirect } from './lib/useResponsiveRedirect'

/** Sibling of <Routes> that redirects between desktop / mobile shells
 *  based on viewport width. See useResponsiveRedirect for rules. */
function ResponsiveGate() {
  useResponsiveRedirect()
  return null
}

// Register service worker (offline shell + push + Background Sync)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* no-op */ })
  })
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'bluefish:drain-queue') void drainAll()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <ResponsiveGate />
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
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/quotations" element={<Quotations />} />
            <Route path="/quotations/:id" element={<QuoteDetail />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/ai" element={<AIWorkspace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/products" element={<Products />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/audit" element={<AuditLog />} />
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
            <Route path="customers/:id" element={<MobileCustomerDetail />} />
            <Route path="leads" element={<MobileLeads />} />
            <Route path="leads/:id" element={<MobileLeadDetail />} />
            <Route path="opportunities" element={<MobileOpportunities />} />
            <Route path="opportunities/:id" element={<MobileOpportunityDetail />} />
            <Route path="tasks" element={<MobileTasks />} />
            <Route path="tasks/:id" element={<MobileTaskDetail />} />
            <Route path="contracts" element={<MobileContracts />} />
            <Route path="contracts/:id" element={<MobileContractDetail />} />
            <Route path="documents" element={<MobileDocuments />} />
            <Route path="documents/:id" element={<MobileDocumentDetail />} />
            <Route path="quotations" element={<MobileQuotations />} />
            <Route path="quotations/:id" element={<MobileQuotationDetail />} />
            <Route path="inbox" element={<MobileInbox />} />
            <Route path="inbox/:id" element={<MobileInboxThread />} />
            <Route path="reports" element={<MobileReports />} />
            <Route path="nearby" element={<MobileNearby />} />
            <Route path="ai" element={<MobileAi />} />
            <Route path="more" element={<MobileMore />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
