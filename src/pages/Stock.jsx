import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'

export default function Stock() {
  const { profil, peutEcrire } = useAuthStore()
  const [aliments, setAliments] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [showModalAliment, setShowModalAliment] = useState(false)
  const [showModalMvt, setShowModalMvt] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [formAliment, setFormAliment] = useState({
    nom: '', type_aliment: 'ponte', stock_actuel_kg: '',
    stock_minimum_kg: '', prix_unitaire_kg: '', fournisseur: ''
  })

  const [formMvt, setFormMvt] = useState({
    aliment_id: '', date_mouvement: today, type_mouvement: 'entree',
    quantite_kg: '', prix_unitaire: '', fournisseur: '', notes: ''
  })

  useEffect(() => { charger() }, [])

  const charger = async () => {
    setLoading(true)
    const [a, m] = await Promise.all([
      supabase.from('stock_aliments').select('*').order('nom'),
      supabase.from('mouvements_stock')
        .select('*, stock_aliments(nom), profils(prenom)')
        .order('date_mouvement', { ascending: false }).limit(50)
    ])
    setAliments(a.data || [])
    setMouvements(m.data || [])
    setLoading(false)
  }

  const saveAliment = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('stock_aliments').insert({
        ...formAliment,
        stock_actuel_kg: parseFloat(formAliment.stock_actuel_kg) || 0,
        stock_minimum_kg: parseFloat(formAliment.stock_minimum_kg) || 0,
        prix_unitaire_kg: parseFloat(formAliment.prix_unitaire_kg) || 0,
      })
      if (error) throw error
      toast.success('Aliment ajouté !')
      setShowModalAliment(false)
      setFormAliment({ nom: '', type_aliment: 'ponte', stock_actuel_kg: '', stock_minimum_kg: '', prix_unitaire_kg: '', fournisseur: '' })
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const saveMvt = async (e) => {
    e.preventDefault()
    try {
      const qte = parseFloat(formMvt.quantite_kg)
      const aliment = aliments.find(a => a.id === formMvt.aliment_id)
      if (!aliment) return toast.error('Sélectionnez un aliment')

      const montant = formMvt.prix_unitaire ? qte * parseFloat(formMvt.prix_unitaire) : null
      const { error: errMvt } = await supabase.from('mouvements_stock').insert({
        ...formMvt,
        quantite_kg: qte,
        prix_unitaire: formMvt.prix_unitaire ? parseFloat(formMvt.prix_unitaire) : null,
        montant_total: montant,
        enregistre_par: profil?.id
      })
      if (errMvt) throw errMvt

      // Mise à jour stock
      let nvStock = aliment.stock_actuel_kg
      if (formMvt.type_mouvement === 'entree') nvStock += qte
      else if (formMvt.type_mouvement === 'sortie') nvStock -= qte
      else nvStock = qte // ajustement

      if (nvStock < 0) return toast.error('Stock insuffisant !')

      await supabase.from('stock_aliments').update({ stock_actuel_kg: nvStock }).eq('id', formMvt.aliment_id)
      toast.success('Mouvement enregistré !')
      setShowModalMvt(false)
      setFormMvt({ aliment_id: '', date_mouvement: today, type_mouvement: 'entree', quantite_kg: '', prix_unitaire: '', fournisseur: '', notes: '' })
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const totalStockValeur = aliments.reduce((s, a) => s + (a.stock_actuel_kg * a.prix_unitaire_kg), 0)
  const alertes = aliments.filter(a => a.stock_actuel_kg <= a.stock_minimum_kg)
  const chartData = aliments.map(a => ({
    name: a.nom.substring(0, 15),
    stock: a.stock_actuel_kg,
    minimum: a.stock_minimum_kg
  }))

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>🌽 Stock d'Aliments</h1>
          <div className="text-gris text-sm mt-1">Gestion des aliments en kilogrammes</div>
        </div>
        {peutEcrire() && (
          <div className="flex gap-2">
            <button className="btn btn-secondaire btn-sm" onClick={() => setShowModalMvt(true)}>
              + Mouvement stock
            </button>
            <button className="btn btn-primaire btn-sm" onClick={() => setShowModalAliment(true)}>
              + Nouvel aliment
            </button>
          </div>
        )}
      </div>

      {alertes.length > 0 && (
        <div className="alerte alerte-danger">
          ⚠️ Stock critique : {alertes.map(a => `${a.nom} (${a.stock_actuel_kg}kg)`).join(', ')}
        </div>
      )}

      <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🌽</div>
          <div className="kpi-valeur">{aliments.length}</div>
          <div className="kpi-label">Types d'aliments</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚠️</div>
          <div className="kpi-valeur" style={{ color: alertes.length > 0 ? 'var(--rouge-alerte)' : 'var(--vert-clair)' }}>
            {alertes.length}
          </div>
          <div className="kpi-label">Stocks critiques</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>💰</div>
          <div className="kpi-valeur" style={{ fontSize: '1.3rem' }}>
            {totalStockValeur.toLocaleString('fr-FR')}
          </div>
          <div className="kpi-label">Valeur stock (FCFA)</div>
        </div>
      </div>

      {/* Graphique stocks */}
      {chartData.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">📊 Niveaux de stock vs minimum</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,138,82,0.1)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }} />
              <Bar dataKey="stock" name="Stock actuel (kg)" fill="var(--vert-vif)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="minimum" name="Minimum (kg)" fill="var(--rouge-alerte)" radius={[3, 3, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau aliments */}
      <div className="carte mb-6">
        <div className="carte-header"><div className="carte-titre">Aliments en stock</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr>
                <th>Aliment</th>
                <th>Type</th>
                <th>Stock actuel (kg)</th>
                <th>Stock minimum (kg)</th>
                <th>Prix/kg (FCFA)</th>
                <th>Valeur (FCFA)</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {aliments.map(a => (
                <tr key={a.id}>
                  <td data-label="Aliment" className="font-bold">{a.nom}</td>
                  <td><span className="badge badge-bleu">{a.type_aliment}</span></td>
                  <td data-label="Stock actuel (kg)" className="font-mono font-bold">{a.stock_actuel_kg.toLocaleString('fr-FR')}</td>
                  <td data-label="Stock minimum (kg)" className="font-mono text-gris">{a.stock_minimum_kg.toLocaleString('fr-FR')}</td>
                  <td data-label="Prix/kg (FCFA)" className="font-mono">{a.prix_unitaire_kg.toLocaleString('fr-FR')}</td>
                  <td className="font-mono">{(a.stock_actuel_kg * a.prix_unitaire_kg).toLocaleString('fr-FR')}</td>
                  <td>
                    <span className={`badge ${a.stock_actuel_kg <= a.stock_minimum_kg ? 'badge-rouge' : a.stock_actuel_kg <= a.stock_minimum_kg * 1.5 ? 'badge-ocre' : 'badge-vert'}`}>
                      {a.stock_actuel_kg <= a.stock_minimum_kg ? '⚠️ Critique' : a.stock_actuel_kg <= a.stock_minimum_kg * 1.5 ? '⚡ Faible' : '✓ OK'}
                    </span>
                  </td>
                </tr>
              ))}
              {aliments.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucun aliment enregistré</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mouvements */}
      <div className="carte">
        <div className="carte-header"><div className="carte-titre">Mouvements récents</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Date</th><th>Aliment</th><th>Type</th><th>Quantité (kg)</th><th>Fournisseur</th><th>Montant (FCFA)</th></tr>
            </thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td data-label="Date" className="font-mono text-xs">{m.date_mouvement}</td>
                  <td data-label="Aliment">{m.stock_aliments?.nom}</td>
                  <td>
                    <span className={`badge ${m.type_mouvement === 'entree' ? 'badge-vert' : m.type_mouvement === 'sortie' ? 'badge-rouge' : 'badge-ocre'}`}>
                      {m.type_mouvement === 'entree' ? '↑ Entrée' : m.type_mouvement === 'sortie' ? '↓ Sortie' : '⚖ Ajustement'}
                    </span>
                  </td>
                  <td data-label="Quantité (kg)" className="font-mono font-bold">{m.quantite_kg.toLocaleString('fr-FR')}</td>
                  <td data-label="Fournisseur" className="text-sm text-gris">{m.fournisseur || "—"}</td>
                  <td className="font-mono">{m.montant_total ? m.montant_total.toLocaleString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal aliment */}
      {showModalAliment && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">🌽 Nouvel aliment</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModalAliment(false)}>✕</button>
            </div>
            <form onSubmit={saveAliment}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Nom *</label>
                    <input className="form-input" value={formAliment.nom}
                      onChange={e => setFormAliment({ ...formAliment, nom: e.target.value })} required placeholder="Ex: Aliment ponte 1" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={formAliment.type_aliment}
                      onChange={e => setFormAliment({ ...formAliment, type_aliment: e.target.value })}>
                      <option value="demarrage">Démarrage</option>
                      <option value="croissance">Croissance</option>
                      <option value="ponte">Ponte</option>
                      <option value="finition">Finition</option>
                      <option value="supplement">Supplément</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Stock initial (kg)</label>
                    <input type="number" className="form-input" value={formAliment.stock_actuel_kg}
                      onChange={e => setFormAliment({ ...formAliment, stock_actuel_kg: e.target.value })} min="0" step="0.1" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Stock minimum (kg)</label>
                    <input type="number" className="form-input" value={formAliment.stock_minimum_kg}
                      onChange={e => setFormAliment({ ...formAliment, stock_minimum_kg: e.target.value })} min="0" step="0.1" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Prix/kg (FCFA)</label>
                    <input type="number" className="form-input" value={formAliment.prix_unitaire_kg}
                      onChange={e => setFormAliment({ ...formAliment, prix_unitaire_kg: e.target.value })} min="0" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Fournisseur</label>
                    <input className="form-input" value={formAliment.fournisseur}
                      onChange={e => setFormAliment({ ...formAliment, fournisseur: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModalAliment(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire">✓ Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal mouvement */}
      {showModalMvt && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">📦 Mouvement de stock</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModalMvt(false)}>✕</button>
            </div>
            <form onSubmit={saveMvt}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Aliment *</label>
                    <select className="form-select" value={formMvt.aliment_id}
                      onChange={e => setFormMvt({ ...formMvt, aliment_id: e.target.value })} required>
                      <option value="">-- Sélectionner --</option>
                      {aliments.map(a => <option key={a.id} value={a.id}>{a.nom} ({a.stock_actuel_kg}kg)</option>)}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={formMvt.type_mouvement}
                      onChange={e => setFormMvt({ ...formMvt, type_mouvement: e.target.value })}>
                      <option value="entree">↑ Entrée (achat)</option>
                      <option value="sortie">↓ Sortie (consommation)</option>
                      <option value="ajustement">⚖ Ajustement inventaire</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input" value={formMvt.date_mouvement}
                      onChange={e => setFormMvt({ ...formMvt, date_mouvement: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Quantité (kg) *</label>
                    <input type="number" className="form-input" value={formMvt.quantite_kg}
                      onChange={e => setFormMvt({ ...formMvt, quantite_kg: e.target.value })} min="0.1" step="0.1" required />
                  </div>
                  {formMvt.type_mouvement === 'entree' && (
                    <>
                      <div className="form-groupe">
                        <label className="form-label">Prix/kg (FCFA)</label>
                        <input type="number" className="form-input" value={formMvt.prix_unitaire}
                          onChange={e => setFormMvt({ ...formMvt, prix_unitaire: e.target.value })} min="0" />
                      </div>
                      <div className="form-groupe">
                        <label className="form-label">Fournisseur</label>
                        <input className="form-input" value={formMvt.fournisseur}
                          onChange={e => setFormMvt({ ...formMvt, fournisseur: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                <div className="form-groupe">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formMvt.notes}
                    onChange={e => setFormMvt({ ...formMvt, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModalMvt(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire">✓ Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
