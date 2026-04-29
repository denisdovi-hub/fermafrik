import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts'
import toast from 'react-hot-toast'

const OEUFS_PAR_PLATEAU = 30

export default function Production() {
  const { profil, peutEcrire } = useAuthStore()
  const [bandes, setBandes] = useState([])
  const [productions, setProductions] = useState([])
  const [graphData, setGraphData] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    bande_id: '',
    date_collecte: today,
    session: 'matin',
    oeufs_produits: '',
    oeufs_casses: '',
    oeufs_sales: '',
    notes: ''
  })

  useEffect(() => {
    charger()
  }, [])

  const charger = async () => {
    setLoading(true)
    const { data: b } = await supabase.from('bandes').select('*').eq('statut', 'actif').order('nom')
    setBandes(b || [])

    const { data: p } = await supabase
      .from('production_oeufs')
      .select('*, bandes(nom, effectif_actuel), profils(prenom, nom)')
      .order('date_collecte', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60)

    setProductions(p || [])

    // Graph 30 jours
    const debut = format(subDays(new Date(), 29), 'yyyy-MM-dd')
    const { data: hist } = await supabase
      .from('production_oeufs')
      .select('date_collecte, oeufs_produits, oeufs_casses, bandes(effectif_actuel)')
      .gte('date_collecte', debut)
      .order('date_collecte')

    const grouped = {}
    hist?.forEach(r => {
      if (!grouped[r.date_collecte]) grouped[r.date_collecte] = { total: 0, casses: 0, effectif: 0 }
      grouped[r.date_collecte].total += r.oeufs_produits
      grouped[r.date_collecte].casses += r.oeufs_casses
      grouped[r.date_collecte].effectif = Math.max(grouped[r.date_collecte].effectif, r.bandes?.effectif_actuel || 0)
    })

    const gd = Object.entries(grouped).map(([date, v]) => ({
      date: format(new Date(date + 'T12:00:00'), 'dd/MM'),
      Produits: v.total,
      Cassés: v.casses,
      'Taux (%)': v.effectif > 0 ? +((v.total / v.effectif) * 100).toFixed(1) : 0,
      Plateaux: +(v.total / OEUFS_PAR_PLATEAU).toFixed(1)
    }))
    setGraphData(gd)
    setLoading(false)
  }

  const handleChange = e => {
    const { name, value } = e.target
    const updated = { ...form, [name]: value }

    // Calcul auto plateaux
    if (name === 'oeufs_produits') {
      const prod = parseInt(value) || 0
      const plateaux = (prod / OEUFS_PAR_PLATEAU).toFixed(2)
      setForm({ ...updated, plateaux_calc: plateaux })
    } else {
      setForm(updated)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.bande_id) return toast.error('Sélectionnez une bande')
    if (!form.oeufs_produits) return toast.error('Indiquez le nombre d\'œufs')

    setSaving(true)
    try {
      const bande = bandes.find(b => b.id === form.bande_id)
      const prod = parseInt(form.oeufs_produits) || 0
      const plateaux = +(prod / OEUFS_PAR_PLATEAU).toFixed(2)
      const taux = bande ? +((prod / bande.effectif_actuel) * 100).toFixed(2) : 0

      const { error } = await supabase.from('production_oeufs').upsert({
        bande_id: form.bande_id,
        date_collecte: form.date_collecte,
        session: form.session,
        oeufs_produits: prod,
        oeufs_casses: parseInt(form.oeufs_casses) || 0,
        oeufs_sales: parseInt(form.oeufs_sales) || 0,
        nombre_plateaux: plateaux,
        taux_ponte: taux,
        collecteur_id: profil?.id,
        notes: form.notes
      }, { onConflict: 'bande_id,date_collecte,session' })

      if (error) throw error

      toast.success('Production enregistrée !')
      setShowModal(false)
      setForm({ bande_id: '', date_collecte: today, session: 'matin', oeufs_produits: '', oeufs_casses: '', oeufs_sales: '', notes: '' })
      charger()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Stats du jour
  const prodJour = productions.filter(p => p.date_collecte === today)
  const totalJour = prodJour.reduce((s, r) => s + r.oeufs_produits, 0)
  const cassesJour = prodJour.reduce((s, r) => s + r.oeufs_casses, 0)
  const plateauxJour = (totalJour / OEUFS_PAR_PLATEAU).toFixed(1)

  if (loading) return (
    <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>
  )

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>🥚 Production d'Œufs</h1>
          <div className="text-gris text-sm mt-1">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </div>
        </div>
        {peutEcrire() && (
          <button className="btn btn-primaire" onClick={() => setShowModal(true)}>
            + Saisir collecte
          </button>
        )}
      </div>

      {/* KPIs du jour */}
      <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { icon: '🥚', val: totalJour.toLocaleString('fr-FR'), label: "Œufs aujourd'hui" },
          { icon: '🍽️', val: plateauxJour, label: 'Plateaux (30 œufs)' },
          { icon: '💔', val: cassesJour, label: 'Œufs cassés', rouge: cassesJour > 0 },
          { icon: '📊', val: `${bandes[0] ? ((totalJour / bandes.reduce((s, b) => s + b.effectif_actuel, 0)) * 100).toFixed(1) : 0}%`, label: 'Taux de ponte' },
        ].map((k, i) => (
          <div key={i} className="kpi-carte">
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{k.icon}</div>
            <div className="kpi-valeur" style={k.rouge ? { color: 'var(--rouge-alerte)' } : {}}>
              {k.val}
            </div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Graphiques */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="graphique-container" style={{ margin: 0 }}>
          <div className="graphique-titre">📊 Production 30 jours</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={graphData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,138,82,0.1)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} interval={4} />
              <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }} />
              <Bar dataKey="Produits" fill="var(--vert-vif)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Cassés" fill="var(--rouge-alerte)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="graphique-container" style={{ margin: 0 }}>
          <div className="graphique-titre">📈 Taux de ponte (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={graphData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,138,82,0.1)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} interval={4} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }} />
              <Line type="monotone" dataKey="Taux (%)" stroke="var(--or)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau historique */}
      <div className="carte">
        <div className="carte-header">
          <div className="carte-titre">Historique des collectes</div>
        </div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bande</th>
                <th>Session</th>
                <th>Produits</th>
                <th>Cassés</th>
                <th>Sales</th>
                <th>Plateaux</th>
                <th>Taux</th>
                <th>Collecteur</th>
              </tr>
            </thead>
            <tbody>
              {productions.slice(0, 30).map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.date_collecte}</td>
                  <td>{p.bandes?.nom || '—'}</td>
                  <td>
                    <span className={`badge ${p.session === 'matin' ? 'badge-ocre' : 'badge-bleu'}`}>
                      {p.session === 'matin' ? '🌅 Matin' : '🌙 Soir'}
                    </span>
                  </td>
                  <td className="font-bold">{p.oeufs_produits.toLocaleString('fr-FR')}</td>
                  <td style={{ color: p.oeufs_casses > 0 ? 'var(--rouge-alerte)' : 'inherit' }}>
                    {p.oeufs_casses}
                  </td>
                  <td>{p.oeufs_sales}</td>
                  <td className="font-mono">{p.nombre_plateaux}</td>
                  <td>
                    <span className={`badge ${p.taux_ponte >= 70 ? 'badge-vert' : p.taux_ponte >= 50 ? 'badge-ocre' : 'badge-rouge'}`}>
                      {p.taux_ponte}%
                    </span>
                  </td>
                  <td className="text-gris text-xs">
                    {p.profils ? `${p.profils.prenom}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal saisie */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">🥚 Nouvelle collecte</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Bande *</label>
                    <select className="form-select" name="bande_id" value={form.bande_id} onChange={handleChange} required>
                      <option value="">-- Sélectionner --</option>
                      {bandes.map(b => (
                        <option key={b.id} value={b.id}>{b.nom} ({b.effectif_actuel.toLocaleString('fr-FR')} sujets)</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Session *</label>
                    <select className="form-select" name="session" value={form.session} onChange={handleChange}>
                      <option value="matin">🌅 Matin</option>
                      <option value="soir">🌙 Soir</option>
                    </select>
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Date de collecte *</label>
                  <input type="date" className="form-input" name="date_collecte"
                    value={form.date_collecte} onChange={handleChange} max={today} required />
                </div>
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Œufs produits *</label>
                    <input type="number" className="form-input" name="oeufs_produits"
                      value={form.oeufs_produits} onChange={handleChange} min="0" required placeholder="0" />
                    {form.oeufs_produits && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--vert-clair)', marginTop: 4 }}>
                        = {(parseInt(form.oeufs_produits) / OEUFS_PAR_PLATEAU).toFixed(2)} plateaux
                      </div>
                    )}
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Œufs cassés</label>
                    <input type="number" className="form-input" name="oeufs_casses"
                      value={form.oeufs_casses} onChange={handleChange} min="0" placeholder="0" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Œufs sales</label>
                    <input type="number" className="form-input" name="oeufs_sales"
                      value={form.oeufs_sales} onChange={handleChange} min="0" placeholder="0" />
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" name="notes" value={form.notes}
                    onChange={handleChange} placeholder="Observations..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire" disabled={saving}>
                  {saving ? <span className="spinner" /> : '✓ Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
