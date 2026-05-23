import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [modeMdpOublie, setModeMdpOublie] = useState(false)
  const [emailReset, setEmailReset] = useState('')
  const [loadingReset, setLoadingReset] = useState(false)
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

  const handleReset = async (e) => {
    e.preventDefault()
    if (!emailReset) return toast.error('Entrez votre adresse email')
    setLoadingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailReset, {
        redirectTo: window.location.origin
      })
      if (error) throw error
      toast.success('Email envoyé ! Vérifiez votre boîte mail.')
      setModeMdpOublie(false)
      setEmailReset('')
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setLoadingReset(false)
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

        {!modeMdpOublie ? (
          <>
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
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--gris-moyen)', fontSize: '1.1rem', padding: 0, lineHeight: 1
                    }}
                    title={showPassword ? 'Masquer' : 'Afficher'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div style={{ textAlign: 'right', marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setModeMdpOublie(true)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--vert-clair)', fontSize: '0.8rem', textDecoration: 'underline', padding: 0
                  }}
                >
                  Mot de passe oublié ?
                </button>
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
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16, fontSize: '0.9rem', color: 'var(--gris-moyen)' }}>
              Entrez votre email. Vous recevrez un lien pour créer un nouveau mot de passe.
            </div>
            <form onSubmit={handleReset}>
              <div className="form-groupe">
                <label className="form-label">Adresse email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="votre@email.com"
                  value={emailReset}
                  onChange={e => setEmailReset(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primaire w-full btn-lg"
                style={{ marginTop: 8, justifyContent: 'center' }}
                disabled={loadingReset}
              >
                {loadingReset ? <span className="spinner" /> : '📧 Envoyer le lien'}
              </button>
              <button
                type="button"
                onClick={() => { setModeMdpOublie(false); setEmailReset('') }}
                className="btn btn-secondaire w-full"
                style={{ marginTop: 8, justifyContent: 'center' }}
              >
                ← Retour à la connexion
              </button>
            </form>
          </>
        )}

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
