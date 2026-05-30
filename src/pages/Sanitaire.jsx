import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function Sanitaire() {
  const { profil, peutEcrire } = useAuthStore()
  const [bandes, setBandes] = useState([])
  const [vaccinsRef, setVaccinsRef] = useState([])
  const [calendrier, setCalendrier] = useState([])
  const [evenements, setEvenements] = useState([])
  const [showModalVaccin, setShowModalVaccin] = useState(false)
  const [showModalEvenement, setShowModalEvenement] = useState(false)
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('calendrier')
  const today = format(new Date(), 'yyyy-MM-dd')

  const [formVaccin, setFormVaccin] = useState({
    bande_id: '', vaccin_id: '', date_prevue: today,
    lot_vaccin: '', fournisseur: '', dose_appliquee: '', notes: ''
  })

  const [formEvt, setFormEvt] = useState({
    bande_id: '', type_evenement: 'debecquage', date_evenement: today,
    date_rappel: '', description: ''
  })

  useEffect(() => { charger() }, [])

  const charger = async () => {
    setLoading(true)
    const [b, vr, cal, evts] = await Promise.all([
      supabase.from('bandes').select('*').eq('statut', 'actif').order('nom'),
      supabase.from('vaccins_ref').select('*').order('age_recommande_jours'),
      supabase.from('calendrier_vaccinal')
        .select('*, vaccins_ref(*), bandes(nom), profils(prenom, nom)')
        .order('date_prevue').limit(100),
      supabase.from('evenements_sanitaires')
        .select('*, bandes(nom), profils(prenom, nom)')
        .order('date_evenement', { ascending: false }).limit(50)
    ])
    setBandes(b.data || [])
    setVaccinsRef(vr.data || [])
    setCalendrier(cal.data || [])
    setEvenements(evts.data || [])
    setLoading(false)
  }

  const genererCalendrier = async () => {
    if (!formVaccin.bande_id) return toast.error('Sélectionnez une bande')
    const bande = bandes.find(b => b.id === formVaccin.bande_id)
    if (!bande) return

    const dateMep = new Date(bande.date_mise_en_place + 'T12:00:00')
    const entrees = vaccinsRef
      .filter(v => v.age_recommande_jours !== null)
      .map(v => ({
        bande_id: bande.id,
        vaccin_id: v.id,
        date_prevue: format(addDays(dateMep, v.age_recommande_jours), 'yyyy-MM-dd'),
        statut: 'prevu'
      }))

    const { error } = await supabase.from('calendrier_vaccinal').insert(entrees)
    if (error) return toast.error(error.message)
    toast.success(`${entrees.length} vaccinations planifiées pour ${bande.nom}`)
    charger()
  }

  const saveVaccin = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('calendrier_vaccinal').insert({
        ...formVaccin,
        statut: 'prevu',
      })
      if (error) throw error
      toast.success('Vaccination planifiée !')
      setShowModalVaccin(false)
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const marquerRealise = async (id) => {
    const { error } = await supabase.from('calendrier_vaccinal').update({
      statut: 'realise',
      date_realisee: today,
      realise_par: profil?.id
    }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Vaccination marquée comme réalisée'); charger() }
  }

  const saveEvenement = async (e) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('evenements_sanitaires').insert({
        ...formEvt,
        realise_par: profil?.id
      })
      if (error) throw error
      toast.success('Événement enregistré !')
      setShowModalEvenement(false)
      charger()
    } catch (err) { toast.error(err.message) }
  }

  const prevus = calendrier.filter(c => c.statut === 'prevu')
  const retard = prevus.filter(c => c.date_prevue < today)
  const prochains = prevus.filter(c => c.date_prevue >= today)

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>💉 Sanitaire & Vaccins</h1>
          <div className="text-gris text-sm mt-1">Calendrier vaccinal et événements sanitaires</div>
        </div>
        {peutEcrire() && (
          <div className="flex gap-2">
            <button className="btn btn-secondaire btn-sm" onClick={() => setShowModalEvenement(true)}>
              + Événement
            </button>
            <button className="btn btn-primaire btn-sm" onClick={() => setShowModalVaccin(true)}>
              + Planifier vaccin
            </button>
          </div>
        )}
      </div>

      {/* Alertes retard */}
      {retard.length > 0 && (
        <div className="alerte alerte-danger">
          ⚠️ {retard.length} vaccination(s) en retard — à réaliser d'urgence
        </div>
      )}

      {/* KPIs */}
      <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📅</div>
          <div className="kpi-valeur">{prochains.length}</div>
          <div className="kpi-label">Vaccinations planifiées</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚠️</div>
          <div className="kpi-valeur" style={{ color: retard.length > 0 ? 'var(--rouge-alerte)' : 'var(--vert-clair)' }}>
            {retard.length}
          </div>
          <div className="kpi-label">En retard</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✅</div>
          <div className="kpi-valeur">{calendrier.filter(c => c.statut === 'realise').length}</div>
          <div className="kpi-label">Réalisées</div>
        </div>
      </div>

      {/* Générateur auto */}
      {peutEcrire() && (
        <div className="carte mb-6" style={{ background: 'rgba(45,138,82,0.08)', borderColor: 'var(--vert-vif)' }}>
          <div className="carte-header">
            <div className="carte-titre">🤖 Générateur de calendrier automatique</div>
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--gris-moyen)', marginBottom: 16 }}>
            Planifie automatiquement toutes les vaccinations standards selon l'âge de la bande
          </div>
          <div className="flex items-center gap-4">
            <select className="form-select" style={{ maxWidth: 300 }}
              value={formVaccin.bande_id}
              onChange={e => setFormVaccin({ ...formVaccin, bande_id: e.target.value })}>
              <option value="">-- Choisir une bande --</option>
              {bandes.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
            <button className="btn btn-primaire" onClick={genererCalendrier}>
              ⚡ Générer le calendrier
            </button>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'calendrier', label: '📅 Calendrier vaccinal' },
          { key: 'reference', label: '💉 Vaccins de référence' },
          { key: 'evenements', label: '📋 Événements sanitaires' },
        ].map(o => (
          <button key={o.key} className={`btn ${onglet === o.key ? 'btn-primaire' : 'btn-secondaire'} btn-sm`}
            onClick={() => setOnglet(o.key)}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Calendrier */}
      {onglet === 'calendrier' && (
        <div className="carte">
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Bande</th>
                  <th>Vaccin</th>
                  <th>Date prévue</th>
                  <th>Date réalisée</th>
                  <th>Lot vaccin</th>
                  {peutEcrire() && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {calendrier.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span className={`badge ${
                        c.statut === 'realise' ? 'badge-vert' :
                        c.date_prevue < today ? 'badge-rouge' : 'badge-ocre'
                      }`}>
                        {c.statut === 'realise' ? '✅ Réalisé' :
                         c.date_prevue < today ? '⚠️ Retard' : '🕐 Prévu'}
                      </span>
                    </td>
                    <td data-label="Bande">{c.bandes?.nom}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.vaccins_ref?.nom}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gris-moyen)' }}>
                        {c.vaccins_ref?.maladie_ciblee}
                      </div>
                    </td>
                    <td data-label="Date prévue" className="font-mono text-xs">{c.date_prevue}</td>
                    <td data-label="Date réalisée" className="font-mono text-xs">{c.date_realisee || "—"}</td>
                    <td data-label="Lot vaccin" className="text-sm">{c.lot_vaccin || "—"}</td>
                    {peutEcrire() && (
                      <td>
                        {c.statut === 'prevu' && (
                          <button className="btn btn-primaire btn-sm" onClick={() => marquerRealise(c.id)}>
                            ✓ Réalisé
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Référentiel vaccins */}
      {onglet === 'reference' && (
        <div className="carte">
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Vaccin</th>
                  <th>Maladie ciblée</th>
                  <th>Voie</th>
                  <th>Age (jours)</th>
                  <th>Rappel</th>
                  <th>Anti-stress</th>
                </tr>
              </thead>
              <tbody>
                {vaccinsRef.map(v => (
                  <tr key={v.id}>
                    <td data-label="Vaccin" className="font-bold">{v.nom}</td>
                    <td data-label="Maladie ciblée" className="text-sm">{v.maladie_ciblee}</td>
                    <td data-label="Voie" className="text-sm text-gris">{v.voie_administration}</td>
                    <td data-label="Âge (jours)" className="font-mono">{v.age_recommande_jours ?? "—"}</td>
                    <td className="font-mono">{v.intervalle_rappel_jours ? `${v.intervalle_rappel_jours}j` : '—'}</td>
                    <td>{v.est_anti_stress ? <span className="badge badge-vert">✓ Oui</span> : <span className="badge badge-gris">Non</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Événements */}
      {onglet === 'evenements' && (
        <div className="carte">
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Bande</th>
                  <th>Date</th>
                  <th>Date rappel</th>
                  <th>Description</th>
                  <th>Réalisé par</th>
                </tr>
              </thead>
              <tbody>
                {evenements.map(e => (
                  <tr key={e.id}>
                    <td>
                      <span className={`badge ${
                        e.type_evenement === 'debecquage' ? 'badge-ocre' :
                        e.type_evenement === 'desinfection' ? 'badge-bleu' : 'badge-gris'
                      }`}>
                        {e.type_evenement === 'debecquage' ? '✂️ Débecquage' :
                         e.type_evenement === 'pesee' ? '⚖️ Pesée' :
                         e.type_evenement === 'desinfection' ? '🧹 Désinfection' :
                         e.type_evenement}
                      </span>
                    </td>
                    <td data-label="Bande">{e.bandes?.nom}</td>
                    <td data-label="Date" className="font-mono text-xs">{e.date_evenement}</td>
                    <td className="font-mono text-xs" style={{ color: e.date_rappel && e.date_rappel <= today ? 'var(--rouge-alerte)' : '' }}>
                      {e.date_rappel || '—'}
                    </td>
                    <td data-label="Description" className="text-sm text-gris">{e.description || "—"}</td>
                    <td data-label="Réalisé par" className="text-sm">{e.profils?.prenom || "—"}</td>
                  </tr>
                ))}
                {evenements.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>
                    Aucun événement enregistré
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal vaccin */}
      {showModalVaccin && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">💉 Planifier une vaccination</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModalVaccin(false)}>✕</button>
            </div>
            <form onSubmit={saveVaccin}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Bande *</label>
                    <select className="form-select" value={formVaccin.bande_id}
                      onChange={e => setFormVaccin({ ...formVaccin, bande_id: e.target.value })} required>
                      <option value="">-- Sélectionner --</option>
                      {bandes.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Vaccin *</label>
                    <select className="form-select" value={formVaccin.vaccin_id}
                      onChange={e => setFormVaccin({ ...formVaccin, vaccin_id: e.target.value })} required>
                      <option value="">-- Sélectionner --</option>
                      {vaccinsRef.map(v => <option key={v.id} value={v.id}>{v.nom} — {v.maladie_ciblee}</option>)}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date prévue *</label>
                    <input type="date" className="form-input" value={formVaccin.date_prevue}
                      onChange={e => setFormVaccin({ ...formVaccin, date_prevue: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Lot du vaccin</label>
                    <input className="form-input" value={formVaccin.lot_vaccin}
                      onChange={e => setFormVaccin({ ...formVaccin, lot_vaccin: e.target.value })} placeholder="N° lot" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Fournisseur</label>
                    <input className="form-input" value={formVaccin.fournisseur}
                      onChange={e => setFormVaccin({ ...formVaccin, fournisseur: e.target.value })} />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Dose appliquée</label>
                    <input className="form-input" value={formVaccin.dose_appliquee}
                      onChange={e => setFormVaccin({ ...formVaccin, dose_appliquee: e.target.value })} placeholder="Ex: 1 dose/sujet" />
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formVaccin.notes}
                    onChange={e => setFormVaccin({ ...formVaccin, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModalVaccin(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire">✓ Planifier</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal événement */}
      {showModalEvenement && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">📋 Événement sanitaire</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowModalEvenement(false)}>✕</button>
            </div>
            <form onSubmit={saveEvenement}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Bande *</label>
                    <select className="form-select" value={formEvt.bande_id}
                      onChange={e => setFormEvt({ ...formEvt, bande_id: e.target.value })} required>
                      <option value="">-- Sélectionner --</option>
                      {bandes.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={formEvt.type_evenement}
                      onChange={e => setFormEvt({ ...formEvt, type_evenement: e.target.value })}>
                      <option value="debecquage">✂️ Débecquage</option>
                      <option value="pesee">⚖️ Pesée</option>
                      <option value="transfert">🔄 Transfert</option>
                      <option value="desinfection">🧹 Désinfection poulailler</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input" value={formEvt.date_evenement}
                      onChange={e => setFormEvt({ ...formEvt, date_evenement: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date de rappel</label>
                    <input type="date" className="form-input" value={formEvt.date_rappel}
                      onChange={e => setFormEvt({ ...formEvt, date_rappel: e.target.value })} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--gris-moyen)', marginTop: 4 }}>
                      Une alerte sera visible à cette date
                    </div>
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={formEvt.description}
                    onChange={e => setFormEvt({ ...formEvt, description: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => setShowModalEvenement(false)}>Annuler</button>
                <button type="submit" className="btn btn-primaire">✓ Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
