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

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo trop lourde (max 5 Mo)')
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const supprimerPhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const resetMvtModal = () => {
    setShowModalMvt(false)
    supprimerPhoto()
    setFormMvt({ aliment_id: '', date_mouvement: today, type_mouvement: 'entree', quantite_kg: '', prix_unitaire: '', fournisseur: '', notes: '' })
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
    if (formMvt.type_mouvement === 'entree' && !photoFile) {
      return toast.error('📸 Une photo justificative est obligatoire pour une entrée de stock')
    }

    setSaving(true)
    try {
      const qte = parseFloat(formMvt.quantite_kg)
      const aliment = aliments.find(a => a.id === formMvt.aliment_id)
      if (!aliment) return toast.error('Sélectionnez un aliment')

      let photoUrl = null

      // Upload photo si entrée
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const fileName = `stock/${Date.now()}_${profil?.id}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('justificatifs')
          .upload(fileName, photoFile, { contentType: photoFile.type })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('justificatifs').getPublicUrl(fileName)
        photoUrl = urlData.publicUrl
      }

      const montant = formMvt.prix_unitaire ? qte * parseFloat(formMvt.prix_unitaire) : null
      const { error: errMvt } = await supabase.from('mouvements_stock').insert({
        ...formMvt,
        quantite_kg: qte,
        prix_unitaire: formMvt.prix_unitaire ? parseFloat(formMvt.prix_unitaire) : null,
        montant_total: montant,
        enregistre_par: profil?.id,
        photo_url: photoUrl
      })
      if (errMvt) throw errMvt

      let nvStock = aliment.stock_actuel_kg
      if (formMvt.type_mouvement === 'entree') nvStock += qte
      else if (formMvt.type_mouvement === 'sortie') nvStock -= qte
      else nvStock = qte

      if (nvStock < 0) return toast.error('Stock insuffisant !')

      await supabase.from('stock_aliments').update({ stock_actuel_kg: nvStock }).eq('id', formMvt.aliment_id)
      toast.success('Mouvement enregistré !')
      resetMvtModal()
      charger()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
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
          <div className="kpi-valeur" style={{ color: alertes.length > 0 ? 'var(--rouge-alerte)' : '#16a34a' }}>
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

      {chartData.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">📊 Niveaux de stock vs minimum</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }} />
              <Bar dataKey="stock" name="Stock actuel (kg)" fill="var(--vert-vif)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="minimum" name="Minimum (kg)" fill="var(--rouge-alerte)" radius={[3, 3, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="carte" style={{ marginBottom: 24 }}>
        <div className="carte-header"><div className="carte-titre">Inventaire actuel</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Aliment</th><th>Type</th><th>Stock actuel</th><th>Minimum</th><th>Prix/kg</th><th>Statut</th></tr>
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
                    <span className={`badge ${a.stock_actuel_kg <= a.stock_minimum_kg ? 'badge-danger' : a.stock_actuel_kg <= a.stock_minimum_kg * 1.5 ? 'badge-warning' : 'badge-success'}`}>
                      {a.stock_actuel_kg <= a.stock_minimum_kg ? '⚠ Critique' : a.stock_actuel_kg <= a.stock_minimum_kg * 1.5 ? '↓ Bas' : '✓ OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="carte">
        <div className="carte-header"><div className="carte-titre">Mouvements récents</div></div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr><th>Date</th><th>Aliment</th><th>Type</th><th>Quantité (kg)</th><th>Fournisseur</th><th>Montant (FCFA)</th><th>Photo</th></tr>
            </thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.date_mouvement}</td>
                  <td>{m.stock_aliments?.nom}</td>
                  <td>
                    <span className={`badge ${m.type_mouvement === 'entree' ? 'badge-success' : m.type_mouvement === 'sortie' ? 'badge-danger' : 'badge-warning'}`}>
                      {m.type_mouvement === 'entree' ? '↑ Entrée' : m.type_mouvement === 'sortie' ? '↓ Sortie' : '⚖ Ajust.'}
                    </span>
                  </td>
                  <td className="font-mono font-bold">{m.quantite_kg?.toLocaleString('fr-FR')}</td>
                  <td className="text-sm text-gris">{m.fournisseur || '—'}</td>
                  <td className="font-mono">{m.montant_total ? m.montant_total.toLocaleString('fr-FR') : '—'}</td>
                  <td>
                    {m.photo_url
                      ? <a href={m.photo_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--bleu-info)', fontSize: '0.8rem', textDecoration: 'underline' }}>
                          📸 Voir
                        </a>
                      : <span style={{ color: 'var(--gris-moyen)', fontSize: '0.75rem' }}>—</span>
                    }
                  </td>
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
                onClick={resetMvtModal}>✕</button>
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

                {/* Photo obligatoire pour les entrées */}
                {formMvt.type_mouvement === 'entree' && (
                  <div className="form-groupe">
                    <label className="form-label">
                      📸 Photo justificative <span style={{ color: 'var(--rouge-alerte)' }}>*</span>
                    </label>
                    {!photoPreview ? (
                      <div style={{
                        border: '2px dashed #e5e7eb', borderRadius: 10, padding: '20px',
                        textAlign: 'center', background: '#f9fafb'
                      }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📷</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--gris-moyen)', marginBottom: 12 }}>
                          Prenez une photo de la livraison d'aliments
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-primaire btn-sm"
                            onClick={() => cameraInputRef.current?.click()}>
                            📸 Prendre une photo
                          </button>
                          <button type="button" className="btn btn-secondaire btn-sm"
                            onClick={() => fileInputRef.current?.click()}>
                            🖼️ Choisir un fichier
                          </button>
                        </div>
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                          style={{ display: 'none' }} onChange={handlePhoto} />
                        <input ref={fileInputRef} type="file" accept="image/*"
                          style={{ display: 'none' }} onChange={handlePhoto} />
                      </div>
                    ) : (
                      <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                        <img src={photoPreview} alt="Aperçu"
                          style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb' }} />
                        <button type="button" onClick={supprimerPhoto}
                          style={{
                            position: 'absolute', top: 8, right: 8, background: 'var(--rouge-alerte)',
                            color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28,
                            cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>✕</button>
                        <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: 6, textAlign: 'center' }}>
                          ✓ Photo ajoutée
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={resetMvtModal}>Annuler</button>
                <button type="submit" className="btn btn-primaire"
                  disabled={saving || (formMvt.type_mouvement === 'entree' && !photoFile)}>
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
