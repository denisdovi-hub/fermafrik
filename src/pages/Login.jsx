import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore(s => s.login)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('Remplissez tous les champs')
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Connexion réussie !')
    } catch (err) {
      toast.error('Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-carte animate-fade">
        <div className="login-logo">
          <div className="login-logo-icon">🐔</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--vert-clair)' }}>
            FermeTrack
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--gris-moyen)', marginTop: 4 }}>
            Gestion Avicole · Togo
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-groupe">
            <label className="form-label">Adresse email</label>
            <input
              type="email"
              className="form-input"
              placeholder="votre@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-groupe">
            <label className="form-label">Mot de passe</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primaire w-full btn-lg"
            style={{ marginTop: 8, justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : '🔐 Se connecter'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          padding: '12px 16px',
          background: 'rgba(45,138,82,0.1)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.75rem',
          color: 'var(--gris-moyen)',
          textAlign: 'center'
        }}>
          Accès réservé au personnel autorisé.<br />
          Contactez l'administrateur pour un compte.
        </div>
      </div>
    </div>
  )
}
