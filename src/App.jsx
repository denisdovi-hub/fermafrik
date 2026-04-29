import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { Toaster } from 'react-hot-toast'
import { useNotifications } from './hooks/useNotifications'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Production from './pages/Production'
import Cheptel from './pages/Cheptel'
import Sanitaire from './pages/Sanitaire'
import Traitements from './pages/Traitements'
import Stock from './pages/Stock'
import Comptabilite from './pages/Comptabilite'
import Rapports from './pages/Rapports'
import Utilisateurs from './pages/Utilisateurs'

// Shared
import Sidebar from './components/shared/Sidebar'
import BoutonNotifications from './components/shared/BoutonNotifications'

const TITRES_PAGES = {
  '/': 'Tableau de bord',
  '/production': 'Production d\'Œufs',
  '/cheptel': 'Gestion du Cheptel',
  '/sanitaire': 'Sanitaire & Vaccins',
  '/traitements': 'Traitements',
  '/stock': 'Stock Aliments',
  '/comptabilite': 'Comptabilité',
  '/rapports': 'Bilans & Rapports',
  '/utilisateurs': 'Utilisateurs',
}

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const path = window.location.pathname

  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <header className="topbar">
          {/* Bouton hamburger mobile */}
          <div className="flex items-center gap-4">
            <button
              style={{
                background: 'none', border: 'none', color: 'var(--gris-moyen)',
                cursor: 'pointer', fontSize: '1.3rem', display: 'none',
                padding: '4px'
              }}
              className="hamburger-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <div className="topbar-title">
              {TITRES_PAGES[path] || 'FermeTrack'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BoutonNotifications />
          </div>
        </header>
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()

  if (loading) return (
    <div className="page-chargement">
      <div className="spinner" />
      <div style={{ color: 'var(--gris-moyen)', fontSize: '0.875rem' }}>Chargement...</div>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { estAdmin } = useAuthStore()
  if (!estAdmin()) return <Navigate to="/" replace />
  return children
}

function ComptaRoute({ children }) {
  const { peutGererCompta } = useAuthStore()
  if (!peutGererCompta()) return <Navigate to="/" replace />
  return children
}

// Vérification des alertes au démarrage
function AlertesChecker() {
  const { permission, verifierAlertes } = useNotifications()
  const { user } = useAuthStore()

  useEffect(() => {
    if (user && permission === 'granted') {
      // Vérifier les alertes au chargement de l'app
      verifierAlertes()
      // Puis toutes les heures
      const interval = setInterval(verifierAlertes, 60 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [user, permission])

  return null
}

export default function App() {
  const { init, user } = useAuthStore()

  useEffect(() => {
    init()
  }, [])

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: 'var(--bg-carte)',
            color: 'var(--blanc)',
            border: '1px solid var(--bordure)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font)',
            fontSize: '0.875rem',
          },
          success: { iconTheme: { primary: 'var(--vert-clair)', secondary: 'var(--bg-carte)' } },
          error: { iconTheme: { primary: 'var(--rouge-alerte)', secondary: 'var(--bg-carte)' } },
        }}
      />
      <AlertesChecker />

      <Routes>
        {/* Route publique */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

        {/* Routes protégées */}
        <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/production" element={<ProtectedRoute><Layout><Production /></Layout></ProtectedRoute>} />
        <Route path="/cheptel" element={<ProtectedRoute><Layout><Cheptel /></Layout></ProtectedRoute>} />
        <Route path="/sanitaire" element={<ProtectedRoute><Layout><Sanitaire /></Layout></ProtectedRoute>} />
        <Route path="/traitements" element={<ProtectedRoute><Layout><Traitements /></Layout></ProtectedRoute>} />
        <Route path="/stock" element={<ProtectedRoute><Layout><Stock /></Layout></ProtectedRoute>} />
        <Route path="/comptabilite" element={<ProtectedRoute><ComptaRoute><Layout><Comptabilite /></Layout></ComptaRoute></ProtectedRoute>} />
        <Route path="/rapports" element={<ProtectedRoute><Layout><Rapports /></Layout></ProtectedRoute>} />
        <Route path="/utilisateurs" element={<ProtectedRoute><AdminRoute><Layout><Utilisateurs /></Layout></AdminRoute></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
