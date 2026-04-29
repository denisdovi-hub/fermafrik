import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import toast from 'react-hot-toast'

const CATEGORIES = {
  recette: ['vente_oeufs', 'vente_volailles', 'vente_autre'],
  depense: ['achat_aliment', 'achat_medicament', 'achat_vaccin', 'achat_volailles', 'main_oeuvre', 'charges_fixes', 'materiel', 'eau_electricite', 'autre']
}

const LABELS_CAT = {
  vente_oeufs: '🥚 Vente œufs', vente_volailles: '🐔 Vente volailles', vente_autre: '📦 Autre recette',
  achat_aliment: '🌽 Achat aliment', achat_medicament: '💊 Médicaments', achat_vaccin: '💉 Vaccins',
  achat_volailles: '🐣 Achat volailles', main_oeuvre: '👷 Main d\'œuvre', charges_fixes: '🏠 Charges fixes',
  materiel: '🔧 Matériel', eau_electricite: '💡 Eau/Électricité', autre: '📋 Autre dépense'
}

const COLORS = ['#2d8a52', '#4db87a', '#a8e6c0', '#c87941', '#e8a86a', '#f0c040']

export default function Comptabilite() {
  const { profil } = useAuthStore()
  const [operations, setOperations] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [periodeDebut, setPeriodeDebut] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [periodeFin, setPeriodeFin] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const today = format(new Date(), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    date_operation: today, type_operation: 'recette',
    categorie: 'vente_oeufs', montant: '', description: '', reference: ''
  })

  useEffect(() => { charger() }, [periodeDebut, periodeFin])

  const charger = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('comptabilite')
      .select('*, profils(prenom), bandes(nom)')
      .gte('date_operation', periodeDebut)
      .lte('date_operation', periodeFin)
      .order('date_operation', { ascending: false })
    setOperations(data || [])
    setLoading(false)
  }

  const save = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('comptabilite').insert({
        ...form,
        montant: parseFloat(form.montant),
        enregistre_par: profil?.id
      })
      if (error) throw error
      toast.success('Opération enregistrée !')
      setShowModal(false)
      setForm({ date_operation: today, type_operation: 'recette', categorie: 'vente_oeufs', montant: '', description: '', reference: '' })
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const totalRecettes = operations.filter(o => o.type_operation === 'recette').reduce((s, o) => s + o.montant, 0)
  const totalDepenses = operations.filter(o => o.type_operation === 'depense').reduce((s, o) => s + o.montant, 0)
  const benefice = totalRecettes - totalDepenses

  // Données graphique par catégorie
  const parCategorie = Object.entries(
    operations.reduce((acc, o) => {
      acc[o.categorie] = (acc[o.categorie] || 0) + o.montant
      return acc
    }, {})
  ).map(([cat, val]) => ({ name: LABELS_CAT[cat] || cat, value: val }))

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>💰 Comptabilité</h1>
          <div className="text-gris text-sm mt-1">Recettes et dépenses en FCFA</div>
        </div>
        <button className="btn btn-primaire" onClick={() => setShowModal(true)}>
          + Nouvelle opération
        </button>
      </div>

      {/* Filtre période */}
      <div className="carte mb-6" style={{ padding: '12px 20px' }}>
        <div className="flex items-center gap-4">
          <span className="form-label" style={{ margin: 0 }}>Période :</span>
          <input type="date" className="form-input" style={{ maxWidth: 160 }} value={periodeDebut}
            onChange={e => setPeriodeDebut(e.target.value)} />
          <span className="text-gris">→</span>
          <input type="date" className="form-input" style={{ maxWidth: 160 }} value={periodeFin}
            onChange={e => setPeriodeFin(e.target.value)} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📥</div>
          <div className="kpi-valeur text-vert" style={{ fontSize: '1.4rem' }}>
            {totalRecettes.toLocaleString('fr-FR')}
          </div>
          <div className="kpi-label">Recettes (FCFA)</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📤</div>
          <div className="kpi-valeur" style={{ color: 'var(--rouge-alerte)', fontSize: '1.4rem' }}>
            {totalDepenses.toLocaleString('fr-FR')}
          </div>
          <div className="kpi-label">Dépenses (FCFA)</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{benefice >= 0 ? '📈' : '📉'}</div>
          <div className="kpi-valeur" style={{ color: benefice >= 0 ? 'var(--vert-clair)' : 'var(--rouge-alerte)', fontSize: '1.4rem' }}>
            {benefice >= 0 ? '+' : ''}{benefice.toLocaleString('fr-FR')}
          </div>
          <div className="kpi-label">Bénéfice net (FCFA)</div>
        </div>
      </div>

      {/* Graphiques */}
      {parCategorie.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">📊 Répartition par catégorie</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={parCategorie} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                {parCategorie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }}
                formatter={(v) => `${v.toLocaleString('fr-FR')} FCFA`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau */}
      <div className="carte">
        <div className="carte-header"><div className="carte-titre">Opérations ({operations.length})</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Description</th><th>Montant (FCFA)</th><th>Par</th></tr>
            </thead>
            <tbody>
              {operations.map(o => (
                <tr key={o.id}>
                  <td className="font-mono text-xs">{o.date_operation}</td>
                  <td>
                    <span className={`badge ${o.type_operation === 'recette' ? 'badge-vert' : 'badge-rouge'}`}>
                      {o.type_operation === 'recette' ? '↑ Recette' : '↓ Dépense'}
                    </span>
                  </td>
                  <td className="text-sm">{LABELS_CAT[o.categorie] || o.categorie}</td>
                  <td className="text-sm text-gris">{o.description || '—'}</td>
                  <td className={`font-mono font-bold ${o.type_operation === 'recette' ? 'text-vert' : 'text-rouge'}`}>
                    {o.type_operation === 'recette' ? '+' : '-'}{o.montant.toLocaleString('fr-FR')}
                  </td>
                  <td className="text-sm text-gris">{o.profils?.prenom || '—'}</td>
                </tr>
              ))}
              {operations.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune opération sur cette période</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">💰 Nouvelle opération</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input" value={form.date_operation}
                      onChange={e => setForm({ ...form, date_operation: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={form.type_operation}
                      onChange={e => setForm({ ...form, type_operation: e.target.value, categorie: CATEGORIES[e.target.value][0] })}>
                      <option value="recette">↑ Recette</option>
                      <option value="depense">↓ Dépense</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Catégorie *</label>
                    <select className="form-select" value={form.categorie}
                      onChange={e => setForm({ ...form, categorie: e.target.value })}>
                      {CATEGORIES[form.type_operation].map(c => (
                        <option key={c} value={c}>{LABELS_CAT[c]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Montant (FCFA) *</label>
                    <input type="number" className="form-input" value={form.montant}
                      onChange={e => setForm({ ...form, montant: e.target.value })} min="0" required />
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Description</label>
                  <input className="form-input" value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Détails de l'opération" />
                </div>
                <div className="form-groupe">
                  <label className="form-label">Référence / Facture</label>
                  <input className="form-input" value={form.reference}
                    onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="N° facture..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire">✓ Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
