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
  admin: 'var(--or)',
  gerant: 'var(--vert-clair)',
  technicien: 'var(--bleu-info)',
  comptable: 'var(--ocre-clair)',
  observateur: 'var(--gris-moyen)'
}

export default function Sidebar({ open, onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profil, logout, peutGererCompta, estAdmin } = useAuthStore()

  const navItems = [
    { label: 'Tableau de bord', icon: '📊', path: '/' },
    { label: 'Production', icon: '🥚', path: '/production' },
    { label: 'Cheptel', icon: '🐔', path: '/cheptel' },
    { label: 'Vaccins & Sanitaire', icon: '💉', path: '/sanitaire' },
    { label: 'Traitements', icon: '💊', path: '/traitements' },
    { label: 'Stock Aliments', icon: '🌽', path: '/stock' },
    ...(peutGererCompta() ? [{ label: 'Comptabilité', icon: '💰', path: '/comptabilite' }] : []),
    { label: 'Bilans & Rapports', icon: '📈', path: '/rapports' },
    ...(estAdmin() ? [{ label: 'Utilisateurs', icon: '👥', path: '/utilisateurs' }] : []),
  ]

  const go = (path) => {
    navigate(path)
    onClose?.()
  }

  const handleLogout = async () => {
    await logout()
    toast.success('Déconnexion réussie')
  }

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 150, display: 'none'
          }}
          className="sidebar-overlay"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.8rem' }}>🐔</span>
            <div>
              <div className="logo-text">FermeTrack</div>
              <div className="logo-sub">Gestion Avicole</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => go(item.path)}
            >
              <span style={{ fontSize: '1rem' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {profil && (
          <div style={{
            padding: '16px',
            borderTop: '1px solid var(--bordure)',
          }}>
            <div style={{
              background: 'var(--vert-fonce)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              marginBottom: 10
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--blanc)' }}>
                {profil.prenom} {profil.nom}
              </div>
              <div style={{
                fontSize: '0.72rem',
                color: ROLE_COLORS[profil.role],
                fontWeight: 600,
                marginTop: 2
              }}>
                {ROLES_LABELS[profil.role]}
              </div>
            </div>
            <button className="btn btn-secondaire w-full" onClick={handleLogout}
              style={{ justifyContent: 'center', fontSize: '0.8rem' }}>
              🚪 Se déconnecter
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
