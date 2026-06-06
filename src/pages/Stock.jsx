import { useEffect, useState, useRef } from 'react'
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
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [formAliment, setFormAliment] = useState({
    nom: '', type_aliment: 'ponte', stock_actuel_kg: '', prix_unitaire_kg: ''
  })

  const [formMvt, setFormMvt] = useState({
    aliment_id: '', date_mouvement: today, type_mouvement: 'sortie',
    quantite_kg: '', notes: ''
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

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo trop lourde (max 5 Mo)'); return }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const supprimerPhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const resetAlimentModal = () => {
    setShowModalAliment(false)
    supprimerPhoto()
    setFormAliment({ nom: '', type_aliment: 'ponte', stock_actuel_kg: '', prix_unitaire_kg: '' })
  }

  const resetMvtModal = () => {
    setShowModalMvt(false)
    setFormMvt({ aliment_id: '', date_mouvement: today, type_mouvement: 'sortie', quantite_kg: '', notes: '' })
  }

  const stockRestant = () => {
    const aliment = aliments.find(a => a.id === formMvt.aliment_id)
    if (!aliment || !formMvt.quantite_kg) return null
    const qte = parseFloat(formMvt.quantite_kg) || 0
    if (formMvt.type_mouvement === 'sortie') return aliment.stock_actuel_kg - qte
    if (formMvt.type_mouvement === 'entree') return aliment.stock_actuel_kg + qte
    return qte
  }

  const saveAliment = async (e) => {
    e.preventDefault()
    if (!photoFile) return toast.error('Une photo du stock est obligatoire')
    setSaving(true)
    try {
      const ext = photoFile.name.split('.').pop()
      const fileName = `stock/${Date.now()}_${profil?.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('justificatifs').upload(fileName, photoFile, { contentType: photoFile.type })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('justificatifs').getPublicUrl(fileName)

      const stockInitial = parseFloat(formAliment.stock_actuel_kg) || 0
      const stockMinimum = stockInitial * 0.2

      const { error } = await supabase.from('stock_aliments').insert({
        nom: formAliment.nom,
        type_aliment: formAliment.type_aliment,
        stock_actuel_kg: stockInitial,
        stock_minimum_kg: stockMinimum,
        prix_unitaire_kg: parseFloat(formAliment.prix_unitaire_kg) || 0,
        photo_url: urlData.publicUrl
      })
      if (error) throw error
      toast.success('Aliment ajouté !')
      resetAlimentModal()
      charger()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const saveMvt = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const qte = parseFloat(formMvt.quantite_kg)
      const aliment = aliments.find(a => a.id === formMvt.aliment_id)
      if (!aliment) { setSaving(false); return toast.error('Sélectionnez un aliment') }

      let nvStock = aliment.stock_actuel_kg
      if (formMvt.type_mouvement === 'entree') nvStock += qte
      else if (formMvt.type_mouvement === 'sortie') nvStock -= qte
      else nvStock = qte

      if (nvStock < 0) { setSaving(false); return toast.error(`Stock insuffisant ! Stock actuel : ${aliment.stock_actuel_kg} kg`) }

      const { error: errMvt } = await supabase.from('mouvements_stock').insert({
        aliment_id: formMvt.aliment_id,
        date_mouvement: formMvt.date_mouvement,
        type_mouvement: formMvt.type_mouvement,
        quantite_kg: qte,
        notes: formMvt.notes,
        enregistre_par: profil?.id,
      })
      if (errMvt) throw errMvt

      await supabase.from('stock_aliments').update({ stock_actuel_kg: nvStock }).eq('id', formMvt.aliment_id)

      if (nvStock <= aliment.stock_minimum_kg) {
        toast.error(`Alerte : stock de "${aliment.nom}" descendu a ${nvStock.toFixed(1)} kg (seuil critique 20%)`)
      } else {
        toast.success(`Mouvement enregistre ! Stock restant : ${nvStock.toFixed(1)} kg`)
      }
      resetMvtModal()
      charger()
    } catch (err) { toast.error('Erreur : ' + err.message) }
    finally { setSaving(false) }
  }

  const totalStockValeur = aliments.reduce((s, a) => s + (a.stock_actuel_kg * a.prix_unitaire_kg), 0)
  const alertes = aliments.filter(a => a.stock_actuel_kg <= a.stock_minimum_kg)
  const chartData = aliments.map(a => ({ name: a.nom.substring(0, 15), stock: a.stock_actuel_kg, seuil: a.stock_minimum_kg }))
  const restant = stockRestant()
  const alimentSelectionne = aliments.find(a => a.id === formMvt.aliment_id)

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Stock d'Aliments</h1>
          <div className="text-gris text-sm mt-1">Gestion des aliments en kilogrammes</div>
        </div>
        {peutEcrire() && (
          <div className="flex gap-2">
            <button className="btn btn-secondaire btn-sm" onClick={() => setShowModalMvt(true)}>+ Mouvement stock</button>
            <button className="btn btn-primaire btn-sm" onClick={() => setShowModalAliment(true)}>+ Nouvel aliment</button>
          </div>
        )}
      </div>

      {alertes.length > 0 && (
        <div className="alerte alerte-danger">
          Stock critique (20%) : {alertes.map(a => `${a.nom} (${a.stock_actuel_kg.toFixed(1)} kg)`).join(', ')}
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
          <div className="kpi-valeur" style={{ color: alertes.length > 0 ? 'var(--rouge-alerte)' : '#16a34a' }}>{alertes.length}</div>
          <div className="kpi-label">Stocks critiques</div>
        </div>
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>💰</div>
          <div className="kpi-valeur" style={{ fontSize: '1.3rem' }}>{totalStockValeur.toLocaleString('fr-FR')}</div>
          <div className="kpi-label">Valeur stock (FCFA)</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">Niveaux de stock vs seuil 20%</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }} />
              <Bar dataKey="stock" name="Stock actuel (kg)" fill="#1a1a2e" radius={[3,3,0,0]} />
              <Bar dataKey="seuil" name="Seuil 20% (kg)" fill="var(--rouge-alerte)" radius={[3,3,0,0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="carte" style={{ marginBottom: 24 }}>
        <div className="carte-header"><div className="carte-titre">Inventaire actuel</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Aliment</th><th>Type</th><th>Stock actuel</th><th>Seuil 20%</th><th>Prix/kg</th><th>Photo</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {aliments.map(a => (
                <tr key={a.id}>
                  <td className="font-bold">{a.nom}</td>
                  <td><span className="badge badge-neutral">{a.type_aliment}</span></td>
                  <td className="font-mono font-bold">{a.stock_actuel_kg.toLocaleString('fr-FR')} kg</td>
                  <td className="font-mono text-gris">{a.stock_minimum_kg.toLocaleString('fr-FR')} kg</td>
                  <td className="font-mono">{a.prix_unitaire_kg.toLocaleString('fr-FR')} FCFA</td>
                  <td>
                    {a.photo_url
                      ? <a href={a.photo_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bleu-info)', fontSize: '0.8rem', textDecoration: 'underline' }}>Voir</a>
                      : <span style={{ color: 'var(--gris-moyen)', fontSize: '0.75rem' }}>—</span>}
                  </td>
                  <td>
                    <span className={`badge ${a.stock_actuel_kg <= a.stock_minimum_kg ? 'badge-danger' : a.stock_actuel_kg <= a.stock_minimum_kg * 1.5 ? 'badge-warning' : 'badge-success'}`}>
                      {a.stock_actuel_kg <= a.stock_minimum_kg ? 'Critique' : a.stock_actuel_kg <= a.stock_minimum_kg * 1.5 ? 'Bas' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="carte">
        <div className="carte-header"><div className="carte-titre">Mouvements recents</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Date</th><th>Aliment</th><th>Type</th><th>Quantite (kg)</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.date_mouvement}</td>
                  <td>{m.stock_aliments?.nom}</td>
                  <td>
                    <span className={`badge ${m.type_mouvement === 'entree' ? 'badge-success' : m.type_mouvement === 'sortie' ? 'badge-danger' : 'badge-warning'}`}>
                      {m.type_mouvement === 'entree' ? 'Entree' : m.type_mouvement === 'sortie' ? 'Sortie' : 'Ajust.'}
                    </span>
                  </td>
                  <td className="font-mono font-bold">{m.quantite_kg?.toLocaleString('fr-FR')}</td>
                  <td className="text-sm text-gris">{m.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nouvel aliment */}
      {showModalAliment && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-titre">Nouvel aliment</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={resetAlimentModal}>x</button>
            </div>
            <form onSubmit={saveAliment}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Nom *</label>
                    <input className="form-input" value={formAliment.nom}
                      onChange={e => setFormAliment({ ...formAliment, nom: e.target.value })} required placeholder="Ex: Mais concasse" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={formAliment.type_aliment}
                      onChange={e => setFormAliment({ ...formAliment, type_aliment: e.target.value })}>
                      <option value="demarrage">Demarrage</option>
                      <option value="croissance">Croissance</option>
                      <option value="ponte">Ponte</option>
                      <option value="finition">Finition</option>
                      <option value="supplement">Supplement</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Stock d'entree (kg) *</label>
                    <input type="number" className="form-input" value={formAliment.stock_actuel_kg}
                      onChange={e => setFormAliment({ ...formAliment, stock_actuel_kg: e.target.value })} min="0" step="0.1" required placeholder="0" />
                    {formAliment.stock_actuel_kg && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gris-moyen)', marginTop: 4 }}>
                        Seuil alerte : {(parseFloat(formAliment.stock_actuel_kg) * 0.2).toFixed(1)} kg (20%)
                      </div>
                    )}
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Prix de realisation (FCFA/kg)</label>
                    <input type="number" className="form-input" value={formAliment.prix_unitaire_kg}
                      onChange={e => setFormAliment({ ...formAliment, prix_unitaire_kg: e.target.value })} min="0" placeholder="0" />
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Photo du stock <span style={{ color: 'var(--rouge-alerte)' }}>*</span></label>
                  {!photoPreview ? (
                    <div style={{ border: '2px dashed #e5e7eb', borderRadius: 10, padding: '20px', textAlign: 'center', background: '#f9fafb' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>📷</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--gris-moyen)', marginBottom: 12 }}>Prenez une photo du stock d'aliment</div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-primaire btn-sm" onClick={() => cameraInputRef.current?.click()}>Prendre une photo</button>
                        <button type="button" className="btn btn-secondaire btn-sm" onClick={() => fileInputRef.current?.click()}>Choisir un fichier</button>
                      </div>
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
                    </div>
                  ) : (
                    <div style={{ position: 'relative', width: '100%' }}>
                      <img src={photoPreview} alt="Apercu" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb' }} />
                      <button type="button" onClick={supprimerPhoto} style={{ position: 'absolute', top: 8, right: 8, background: 'var(--rouge-alerte)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: '0.9rem' }}>x</button>
                      <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: 6, textAlign: 'center' }}>Photo ajoutee</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={resetAlimentModal}>Annuler</button>
                <button type="submit" className="btn btn-primaire" disabled={saving || !photoFile}>
                  {saving ? <span className="spinner" /> : 'Enregistrer'}
                </button>
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
              <div className="modal-titre">Mouvement de stock</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={resetMvtModal}>x</button>
            </div>
            <form onSubmit={saveMvt}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Aliment *</label>
                    <select className="form-select" value={formMvt.aliment_id}
                      onChange={e => setFormMvt({ ...formMvt, aliment_id: e.target.value })} required>
                      <option value="">-- Selectionner --</option>
                      {aliments.map(a => <option key={a.id} value={a.id}>{a.nom} — {a.stock_actuel_kg} kg</option>)}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={formMvt.type_mouvement}
                      onChange={e => setFormMvt({ ...formMvt, type_mouvement: e.target.value })}>
                      <option value="sortie">Sortie (consommation)</option>
                      <option value="entree">Entree (ajout)</option>
                      <option value="ajustement">Ajustement inventaire</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-input" value={formMvt.date_mouvement}
                      onChange={e => setFormMvt({ ...formMvt, date_mouvement: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Quantite (kg) *</label>
                    <input type="number" className="form-input" value={formMvt.quantite_kg}
                      onChange={e => setFormMvt({ ...formMvt, quantite_kg: e.target.value })} min="0.1" step="0.1" required placeholder="0" />
                  </div>
                </div>

                {restant !== null && (
                  <div style={{
                    background: restant < 0 ? '#fee2e2' : restant <= (alimentSelectionne?.stock_minimum_kg || 0) ? '#fef9c3' : '#dcfce7',
                    border: `1px solid ${restant < 0 ? '#fecaca' : '#bbf7d0'}`,
                    borderRadius: 8, padding: '10px 14px', marginBottom: 12
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: restant < 0 ? '#b91c1c' : '#374151' }}>
                      {restant < 0
                        ? `Stock insuffisant ! Il manque ${Math.abs(restant).toFixed(1)} kg`
                        : `Stock restant : ${restant.toFixed(1)} kg`}
                    </div>
                    {restant >= 0 && restant <= (alimentSelectionne?.stock_minimum_kg || 0) && (
                      <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: 2 }}>
                        Ce stock sera en dessous du seuil critique (20%)
                      </div>
                    )}
                  </div>
                )}

                <div className="form-groupe">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={formMvt.notes}
                    onChange={e => setFormMvt({ ...formMvt, notes: e.target.value })} placeholder="Observations..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={resetMvtModal}>Annuler</button>
                <button type="submit" className="btn btn-primaire" disabled={saving || restant < 0}>
                  {saving ? <span className="spinner" /> : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
