import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

const ROLES = ['admin', 'gerant', 'technicien', 'comptable', 'observateur']
const ROLES_LABELS = {
  admin: '👑 Administrateur', gerant: '🏠 Gérant',
  technicien: '🔬 Technicien', comptable: '💼 Comptable', observateur: '👁 Observateur'
}
const ROLES_DESC = {
  admin: 'Accès complet + gestion utilisateurs',
  gerant: 'Toutes saisies + comptabilité',
  technicien: 'Saisies sanitaires + production',
  comptable: 'Comptabilité + rapports',
  observateur: 'Lecture seule'
}

const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export default function Utilisateurs() {
  const { profil } = useAuthStore()
  const [utilisateurs, setUtilisateurs] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    email: '', password: '', nom: '', prenom: '', role: 'technicien'
  })

  useEffect(() => { charger() }, [])

  const charger = async () => {
    setLoading(true)
    const { data } = await supabase.from('profils').select('*').order('created_at')
    setUtilisateurs(data || [])
    setLoading(false)
  }

  const creerUtilisateur = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password || !form.nom || !form.prenom) {
      return toast.error('Remplissez tous les champs')
    }
    if (form.password.length < 8) {
      return toast.error('Le mot de passe doit faire au moins 8 caractères')
    }
    setSaving(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          email_confirm: true
        })
      })

      const userData = await res.json()
      if (!res.ok) throw new Error(userData.message || 'Erreur création compte')

      const { error: profErr } = await supabase.from('profils').insert({
        id: userData.id,
        email: form.email,
        nom: form.nom,
        prenom: form.prenom,
        role: form.role,
        actif: true
      })
      if (profErr) throw profErr

      toast.success(`Utilisateur ${form.prenom} ${form.nom} créé !`)
      setShowModal(false)
      setForm({ email: '', password: '', nom: '', prenom: '', role: 'technicien' })
      charger()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const changerRole = async (userId, role) => {
    if (userId === profil?.id) return toast.error('Vous ne pouvez pas modifier votre propre rôle')
    const { error } = await supabase.from('profils').update({ role }).eq('id', userId)
    if (error) toast.error(error.message)
    else { toast.success('Rôle mis à jour'); charger() }
  }

  const toggleActif = async (user) => {
    if (user.id === profil?.id) return toast.error('Action impossible sur votre propre compte')
    const { error } = await supabase.from('profils').update({ actif: !user.actif }).eq('id', user.id)
    if (error) toast.error(error.message)
    else { toast.success(user.actif ? 'Compte désactivé' : 'Compte activé'); charger() }
  }

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>👥 Gestion des Utilisateurs</h1>
          <div className="text-gris text-sm mt-1">Accès réservé à l'administrateur</div>
        </div>
        <button className="btn btn-primaire" onClick={() => setShowModal(true)}>
          + Nouvel utilisateur
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {ROLES.map(r => (
          <div key={r} className="kpi-carte" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{ROLES_LABELS[r]}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--gris-moyen)' }}>{ROLES_DESC[r]}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--vert-clair)', marginTop: 8 }}>
              {utilisateurs.filter(u => u.role === r).length} utilisateur(s)
            </div>
          </div>
        ))}
      </div>

      <div className="carte">
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {utilisateurs.map(u => (
                <tr key={u.id}>
                  <td className="font-bold">{u.prenom} {u.nom}</td>
                  <td className="text-sm text-gris font-mono">{u.email}</td>
                  <td>
                    {u.id === profil?.id ? (
                      <span className="badge badge-ocre">{ROLES_LABELS[u.role]}</span>
                    ) : (
                      <select className="form-select" style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto' }}
                        value={u.role} onChange={e => changerRole(u.id, e.target.value)}>
                        {ROLES.map(r => <option key={r} value={r}>{ROLES_LABELS[r]}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.actif ? 'badge-vert' : 'badge-rouge'}`}>
                      {u.actif ? '✓ Actif' : '✕ Inactif'}
                    </span>
                  </td>
                  <td>
                    {u.id !== profil?.id && (
                      <button className={`btn btn-sm ${u.actif ? 'btn-danger' : 'btn-primaire'}`}
                        onClick={() => toggleActif(u)}>
                        {u.actif ? '🔒 Désactiver' : '🔓 Activer'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">👤 Créer un utilisateur</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={creerUtilisateur}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Prénom *</label>
                    <input className="form-input" value={form.prenom}
                      onChange={e => setForm({ ...form, prenom: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Nom *</label>
                    <input className="form-input" value={form.nom}
                      onChange={e => setForm({ ...form, nom: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Email *</label>
                    <input type="email" className="form-input" value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Mot de passe *</label>
                    <input type="password" className="form-input" value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      required minLength={8} placeholder="Min. 8 caractères" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Rôle *</label>
                    <select className="form-select" value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLES_LABELS[r]}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire" disabled={saving}>
                  {saving ? <span className="spinner" /> : '✓ Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}