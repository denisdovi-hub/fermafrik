import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import toast from 'react-hot-toast'

const ROLES_LABELS = {
  admin: 'Administrateur',
  gerant: 'Gérant',
  technicien: 'Technicien',
  comptable: 'Comptable',
  observateur: 'Observateur'
}

const ROLE_COLORS = {
  admin: '#fbbf24',
  gerant: '#60a5fa',
  technicien: '#34d399',
  comptable: '#f59e0b',
  observateur: '#9ca3af'
}

export default function Sidebar({ open, onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profil, logout, peutGererCompta, estAdmin } = useAuthStore()

  const navItems = [
    { label: 'Tableau de bord', icon: '📊', path: '/' },
    { label: 'Production', icon: '🥚', path: '/production' },
    { label: 'Cheptel', icon: '🐔', path: '/cheptel' },
    { label: 'Santé & Traitements', icon: '💉', path: '/sanitaire' },
    { label: 'Stock Aliments', icon: '🌽', path: '/stock' },
    ...(peutGererCompta() ? [{ label: 'Comptabilité', icon: '💰', path: '/comptabilite' }] : []),
    { label: 'Bilans & Rapports', icon: '📈', path: '/rapports' },
    ...(estAdmin() ? [{ label: 'Utilisateurs', icon: '👥', path: '/utilisateurs' }] : []),
  ]

  const navMobile = [
    { label: 'Accueil', icon: '📊', path: '/' },
    { label: 'Production', icon: '🥚', path: '/production' },
    { label: 'Cheptel', icon: '🐔', path: '/cheptel' },
    { label: 'Stock', icon: '🌽', path: '/stock' },
    { label: 'Menu', icon: '☰', path: null },
  ]

  const go = (path) => {
    navigate(path)
    onClose?.()
  }

  const handleLogout = async () => {
    await logout()
    toast.success('Déconnexion réussie')
  }

  const isActive = (path) => {
    if (path === '/sanitaire') {
      return location.pathname === '/sanitaire' || location.pathname === '/traitements'
    }
    return location.pathname === path
  }

  return (
    <>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }}
          className="sidebar-overlay"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.8rem' }}>🐔</span>
            <div>
              <div className="logo-text">FermeTrack</div>
              <div className="logo-sub">Gestion Avicole</div>
            </div>
          </div>
        </div>

        {/* Profil + déconnexion — juste sous le logo */}
        {profil && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#ffffff' }}>
                  {profil.prenom} {profil.nom}
                </div>
                <div style={{ fontSize: '0.72rem', color: ROLE_COLORS[profil.role], fontWeight: 600, marginTop: 2 }}>
                  {ROLES_LABELS[profil.role]}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap'
                }}
              >
                🚪 Quitter
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => go(item.path)}
            >
              <span style={{ fontSize: '1rem' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Barre de navigation mobile en bas */}
      <nav className="mobile-nav">
        {navMobile.map(item => (
          <button
            key={item.path || 'menu'}
            className={`mobile-nav-item ${item.path && isActive(item.path) ? 'active' : ''}`}
            onClick={() => item.path ? go(item.path) : go('/')}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
