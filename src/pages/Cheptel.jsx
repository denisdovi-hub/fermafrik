import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function Cheptel() {
  const { profil, peutEcrire } = useAuthStore()
  const [bandes, setBandes] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModalBande, setShowModalBande] = useState(false)
  const [showModalMvt, setShowModalMvt] = useState(false)
  const [bandeSel, setBandeSel] = useState(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [formBande, setFormBande] = useState({
    nom: '', race: 'Ponte ISA Brown', date_mise_en_place: today,
    effectif_initial: '', statut: 'actif', notes: ''
  })

  const [formMvt, setFormMvt] = useState({
    bande_id: '', date_mouvement: today, type_mouvement: 'mortalite',
    quantite: '', cause: '', acheteur_vendeur: '', prix_unitaire: '', notes: ''
  })

  useEffect(() => { charger() }, [])

  const charger = async () => {
    setLoading(true)
    const { data: b } = await supabase.from('bandes').select('*').order('created_at', { ascending: false })
    setBandes(b || [])
    const { data: m } = await supabase
      .from('mouvements_cheptel')
      .select('*, bandes(nom), profils(prenom, nom)')
      .order('date_mouvement', { ascending: false })
      .limit(50)
    setMouvements(m || [])
    setLoading(false)
  }

  const saveBande = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...formBande,
        effectif_initial: parseInt(formBande.effectif_initial),
        effectif_actuel: parseInt(formBande.effectif_initial),
      }
      const { error } = bandeSel
        ? await supabase.from('bandes').update(payload).eq('id', bandeSel.id)
        : await supabase.from('bandes').insert(payload)
      if (error) throw error
      toast.success(bandeSel ? 'Bande mise à jour' : 'Bande créée !')
      setShowModalBande(false)
      setBandeSel(null)
      setFormBande({ nom: '', race: 'Ponte ISA Brown', date_mise_en_place: today, effectif_initial: '', statut: 'actif', notes: '' })
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const saveMvt = async (e) => {
    e.preventDefault()
    try {
      const qte = parseInt(formMvt.quantite)
      const bande = bandes.find(b => b.id === formMvt.bande_id)
      if (!bande) return toast.error('Sélectionnez une bande')

      if (formMvt.type_mouvement === 'mortalite' || formMvt.type_mouvement === 'vente' || formMvt.type_mouvement === 'reforme') {
        if (qte > bande.effectif_actuel) {
          return toast.error(`Quantité supérieure à l'effectif actuel (${bande.effectif_actuel})`)
        }
      }

      const prix_total = formMvt.prix_unitaire ? qte * parseFloat(formMvt.prix_unitaire) : null
      const { error: errMvt } = await supabase.from('mouvements_cheptel').insert({
        ...formMvt,
        quantite: qte,
        prix_unitaire: formMvt.prix_unitaire ? parseFloat(formMvt.prix_unitaire) : null,
        prix_total,
        enregistre_par: profil?.id
      })
      if (errMvt) throw errMvt

      // Mise à jour effectif
      let nouvelEffectif = bande.effectif_actuel
      if (['mortalite', 'vente', 'reforme'].includes(formMvt.type_mouvement)) {
        nouvelEffectif -= qte
      } else if (formMvt.type_mouvement === 'achat') {
        nouvelEffectif += qte
      }

      await supabase.from('bandes').update({ effectif_actuel: nouvelEffectif }).eq('id', formMvt.bande_id)

      toast.success('Mouvement enregistré !')
      setShowModalMvt(false)
      setFormMvt({ bande_id: '', date_mouvement: today, type_mouvement: 'mortalite', quantite: '', cause: '', acheteur_vendeur: '', prix_unitaire: '', notes: '' })
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const ouvrirEditionBande = (bande) => {
    setBandeSel(bande)
    setFormBande({ ...bande })
    setShowModalBande(true)
  }

  const totalActif = bandes.filter(b => b.statut === 'actif').reduce((s, b) => s + b.effectif_actuel, 0)
  const totalInitial = bandes.filter(b => b.statut === 'actif').reduce((s, b) => s + b.effectif_initial, 0)
  const tauxMortaliteGlobal = totalInitial > 0 ? (((totalInitial - totalActif) / totalInitial) * 100).toFixed(1) : 0

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>🐔 Gestion du Cheptel</h1>
          <div className="text-gris text-sm mt-1">Suivi des bandes et mouvements</div>
        </div>
        {peutEcrire() && (
          <div className="flex gap-2">
            <button className="btn btn-secondaire btn-sm" onClick={() => setShowModalMvt(true)}>
              + Mouvement
            </button>
            <button className="btn btn-primaire btn-sm" onClick={() => { setBandeSel(null); setShowModalBande(true) }}>
              + Nouvelle bande
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grille-kpi">
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🐔</div>
          <div className="kpi-valeur">{totalActif.toLocaleString('fr-FR')}</div>
          <div className="kpi-label">Effectif total actif</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
          <div className="kpi-valeur">{bandes.filter(b => b.statut === 'actif').length}</div>
          <div className="kpi-label">Bandes actives</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📉</div>
          <div className="kpi-valeur" style={{ color: parseFloat(tauxMortaliteGlobal) > 5 ? 'var(--rouge-alerte)' : 'var(--vert-clair)' }}>
            {tauxMortaliteGlobal}%
          </div>
          <div className="kpi-label">Taux mortalité global</div>
        </div>
      </div>

      {/* Liste bandes */}
      <div className="carte mb-6">
        <div className="carte-header">
          <div className="carte-titre">Bandes / Lots</div>
        </div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr>
                <th>Bande</th>
                <th>Race</th>
                <th>Mise en place</th>
                <th>Effectif initial</th>
                <th>Effectif actuel</th>
                <th>Mortalité</th>
                <th>Statut</th>
                {peutEcrire() && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {bandes.map(b => {
                const tauxMort = b.effectif_initial > 0
                  ? (((b.effectif_initial - b.effectif_actuel) / b.effectif_initial) * 100).toFixed(1)
                  : 0
                return (
                  <tr key={b.id}>
                    <td className="font-bold">{b.nom}</td>
                    <td className="text-gris text-sm">{b.race}</td>
                    <td className="font-mono text-xs">{b.date_mise_en_place}</td>
                    <td className="font-mono">{b.effectif_initial.toLocaleString('fr-FR')}</td>
                    <td className="font-mono font-bold">{b.effectif_actuel.toLocaleString('fr-FR')}</td>
                    <td>
                      <span className={`badge ${parseFloat(tauxMort) > 5 ? 'badge-rouge' : 'badge-vert'}`}>
                        {tauxMort}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${b.statut === 'actif' ? 'badge-vert' : 'badge-gris'}`}>
                        {b.statut}
                      </span>
                    </td>
                    {peutEcrire() && (
                      <td>
                        <button className="btn btn-secondaire btn-sm" onClick={() => ouvrirEditionBande(b)}>
                          ✏️
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {bandes.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>
                  Aucune bande enregistrée
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mouvements récents */}
      <div className="carte">
        <div className="carte-header">
          <div className="carte-titre">Mouvements récents</div>
        </div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bande</th>
                <th>Type</th>
                <th>Quantité</th>
                <th>Cause / Acheteur</th>
                <th>Prix total (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.date_mouvement}</td>
                  <td>{m.bandes?.nom}</td>
                  <td>
                    <span className={`badge ${
                      m.type_mouvement === 'mortalite' ? 'badge-rouge' :
                      m.type_mouvement === 'vente' ? 'badge-bleu' :
                      m.type_mouvement === 'achat' ? 'badge-vert' : 'badge-gris'
                    }`}>
                      {m.type_mouvement === 'mortalite' ? '💀 Mort' :
                       m.type_mouvement === 'vente' ? '💸 Vente' :
                       m.type_mouvement === 'achat' ? '🛒 Achat' : '🔄 Réforme'}
                    </span>
                  </td>
                  <td className="font-mono font-bold">{m.quantite}</td>
                  <td className="text-sm text-gris">{m.cause || m.acheteur_vendeur || '—'}</td>
                  <td className="font-mono">{m.prix_total ? m.prix_total.toLocaleString('fr-FR') + ' F' : '—'}</td>
                </tr>
              ))}
              {mouvements.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>
                  Aucun mouvement enregistré
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nouvelle bande */}
      {showModalBande && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">{bandeSel ? '✏️ Modifier bande' : '🐔 Nouvelle bande'}</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => { setShowModalBande(false); setBandeSel(null) }}>✕</button>
            </div>
            <form onSubmit={saveBande}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Nom de la bande *</label>
                    <input className="form-input" value={formBande.nom}
                      onChange={e => setFormBande({ ...formBande, nom: e.target.value })} placeholder="Ex: Lot A - Avril 2025" required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Race *</label>
                    <select className="form-select" value={formBande.race}
                      onChange={e => setFormBande({ ...formBande, race: e.target.value })}>
                      <option>Ponte ISA Brown</option>
                      <option>Ponte Lohmann</option>
                      <option>Ponte Novogen</option>
                      <option>Locale améliorée</option>
                      <option>Autre</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date mise en place *</label>
                    <input type="date" className="form-input" value={formBande.date_mise_en_place}
                      onChange={e => setFormBande({ ...formBande, date_mise_en_place: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Effectif initial *</label>
                    <input type="number" className="form-input" value={formBande.effectif_initial}
                      onChange={e => setFormBande({ ...formBande, effectif_initial: e.target.value })} min="1" required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Statut</label>
                    <select className="form-select" value={formBande.statut}
                      onChange={e => setFormBande({ ...formBande, statut: e.target.value })}>
                      <option value="actif">Actif</option>
                      <option value="termine">Terminé</option>
                      <option value="vendu">Vendu</option>
                    </select>
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formBande.notes}
                    onChange={e => setFormBande({ ...formBande, notes: e.target.value })} placeholder="Observations..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => { setShowModalBande(false); setBandeSel(null) }}>Annuler</button>
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
              <div className="modal-titre">📋 Enregistrer un mouvement</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModalMvt(false)}>✕</button>
            </div>
            <form onSubmit={saveMvt}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Bande *</label>
                    <select className="form-select" value={formMvt.bande_id}
                      onChange={e => setFormMvt({ ...formMvt, bande_id: e.target.value })} required>
                      <option value="">-- Sélectionner --</option>
                      {bandes.filter(b => b.statut === 'actif').map(b => (
                        <option key={b.id} value={b.id}>{b.nom} ({b.effectif_actuel} sujets)</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input" value={formMvt.date_mouvement}
                      onChange={e => setFormMvt({ ...formMvt, date_mouvement: e.target.value })} max={today} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={formMvt.type_mouvement}
                      onChange={e => setFormMvt({ ...formMvt, type_mouvement: e.target.value })}>
                      <option value="mortalite">💀 Mortalité</option>
                      <option value="vente">💸 Vente</option>
                      <option value="achat">🛒 Achat</option>
                      <option value="reforme">🔄 Réforme</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Quantité *</label>
                    <input type="number" className="form-input" value={formMvt.quantite}
                      onChange={e => setFormMvt({ ...formMvt, quantite: e.target.value })} min="1" required />
                  </div>
                  {['mortalite', 'reforme'].includes(formMvt.type_mouvement) && (
                    <div className="form-groupe">
                      <label className="form-label">Cause</label>
                      <input className="form-input" value={formMvt.cause}
                        onChange={e => setFormMvt({ ...formMvt, cause: e.target.value })} placeholder="Maladie, accident..." />
                    </div>
                  )}
                  {['vente', 'achat'].includes(formMvt.type_mouvement) && (
                    <>
                      <div className="form-groupe">
                        <label className="form-label">Acheteur / Vendeur</label>
                        <input className="form-input" value={formMvt.acheteur_vendeur}
                          onChange={e => setFormMvt({ ...formMvt, acheteur_vendeur: e.target.value })} />
                      </div>
                      <div className="form-groupe">
                        <label className="form-label">Prix unitaire (FCFA)</label>
                        <input type="number" className="form-input" value={formMvt.prix_unitaire}
                          onChange={e => setFormMvt({ ...formMvt, prix_unitaire: e.target.value })} />
                        {formMvt.prix_unitaire && formMvt.quantite && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--vert-clair)', marginTop: 4 }}>
                            Total : {(parseInt(formMvt.quantite) * parseFloat(formMvt.prix_unitaire)).toLocaleString('fr-FR')} FCFA
                          </div>
                        )}
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
