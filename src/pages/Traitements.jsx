import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function Traitements() {
  const { profil, peutEcrire } = useAuthStore()
  const [bandes, setBandes] = useState([])
  const [traitements, setTraitements] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    bande_id: '', date_debut: today, date_fin: '',
    type_traitement: 'medicament', produit: '', molecule: '',
    dose: '', voie_administration: '', raison: '',
    temps_attente_jours: 0, cout: '', prescrit_par: '', notes: ''
  })

  useEffect(() => { charger() }, [])

  const charger = async () => {
    setLoading(true)
    const [b, t] = await Promise.all([
      supabase.from('bandes').select('*').eq('statut', 'actif').order('nom'),
      supabase.from('traitements')
        .select('*, bandes(nom), profils(prenom, nom)')
        .order('date_debut', { ascending: false }).limit(50)
    ])
    setBandes(b.data || [])
    setTraitements(t.data || [])
    setLoading(false)
  }

  const ouvrirCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      setCameraStream(stream)
      setCameraActive(true)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 100)
    } catch (err) {
      toast.error('Impossible d\'accéder à la caméra : ' + err.message)
    }
  }

  const prendrePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(blob))
      fermerCamera()
    }, 'image/jpeg', 0.85)
  }

  const fermerCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop())
    setCameraStream(null)
    setCameraActive(false)
  }

  const uploadPhoto = async (traitementId) => {
    if (!photoFile) return null
    const path = `traitements/${traitementId}/${photoFile.name}`
    const { error } = await supabase.storage.from('photos').upload(path, photoFile)
    if (error) { console.error(error); return null }
    const { data } = supabase.storage.from('photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.bande_id) return toast.error('Sélectionnez une bande')
    if (!form.produit) return toast.error('Indiquez le produit')
    setSaving(true)
    try {
      const { data, error } = await supabase.from('traitements').insert({
        ...form,
        cout: form.cout ? parseFloat(form.cout) : 0,
        temps_attente_jours: parseInt(form.temps_attente_jours) || 0,
        realise_par: profil?.id
      }).select().single()
      if (error) throw error

      if (photoFile) {
        const photoUrl = await uploadPhoto(data.id)
        if (photoUrl) {
          await supabase.from('photos').insert({
            entite_type: 'traitement',
            entite_id: data.id,
            url: photoUrl,
            nom_fichier: photoFile.name,
            prise_par: profil?.id
          })
        }
      }

      toast.success('Traitement enregistré !')
      setShowModal(false)
      setPhotoPreview(null)
      setPhotoFile(null)
      setForm({
        bande_id: '', date_debut: today, date_fin: '',
        type_traitement: 'medicament', produit: '', molecule: '',
        dose: '', voie_administration: '', raison: '',
        temps_attente_jours: 0, cout: '', prescrit_par: '', notes: ''
      })
      charger()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const enCours = traitements.filter(t => !t.date_fin || t.date_fin >= today)

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Chargement...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>💊 Traitements & Médicaments</h1>
          <div className="text-gris text-sm mt-1">Suivi des soins et protocoles vétérinaires</div>
        </div>
        {peutEcrire() && (
          <button className="btn btn-primaire" onClick={() => setShowModal(true)}>
            + Nouveau traitement
          </button>
        )}
      </div>

      {/* Traitements en cours */}
      {enCours.length > 0 && (
        <div className="alerte alerte-warning mb-4">
          💊 {enCours.length} traitement(s) en cours — vérifier les temps d'attente avant vente/consommation
        </div>
      )}

      <div className="carte">
        <div className="carte-header">
          <div className="carte-titre">Historique des traitements</div>
        </div>
        <div className="tableau-container">
          <table className="tableau">
            <thead>
              <tr>
                <th>Bande</th>
                <th>Type</th>
                <th>Produit</th>
                <th>Raison</th>
                <th>Du</th>
                <th>Au</th>
                <th>Attente</th>
                <th>Coût (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {traitements.map(t => (
                <tr key={t.id}>
                  <td>{t.bandes?.nom}</td>
                  <td>
                    <span className={`badge ${
                      t.type_traitement === 'antibiotique' ? 'badge-rouge' :
                      t.type_traitement === 'medicament' ? 'badge-bleu' : 'badge-gris'
                    }`}>
                      {t.type_traitement}
                    </span>
                  </td>
                  <td>
                    <div className="font-bold">{t.produit}</div>
                    {t.molecule && <div className="text-xs text-gris">{t.molecule}</div>}
                  </td>
                  <td className="text-sm text-gris">{t.raison || '—'}</td>
                  <td className="font-mono text-xs">{t.date_debut}</td>
                  <td className="font-mono text-xs">{t.date_fin || '—'}</td>
                  <td>
                    {t.temps_attente_jours > 0 ? (
                      <span className="badge badge-rouge">{t.temps_attente_jours}j</span>
                    ) : <span className="badge badge-vert">Aucun</span>}
                  </td>
                  <td className="font-mono">{t.cout > 0 ? t.cout.toLocaleString('fr-FR') : '—'}</td>
                </tr>
              ))}
              {traitements.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>
                  Aucun traitement enregistré
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal traitement */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="modal-titre">💊 Nouveau traitement</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--gris-moyen)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => { setShowModal(false); fermerCamera(); setPhotoPreview(null) }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grille">
                  <div className="form-groupe">
                    <label className="form-label">Bande *</label>
                    <select className="form-select" value={form.bande_id}
                      onChange={e => setForm({ ...form, bande_id: e.target.value })} required>
                      <option value="">-- Sélectionner --</option>
                      {bandes.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={form.type_traitement}
                      onChange={e => setForm({ ...form, type_traitement: e.target.value })}>
                      <option value="medicament">Médicament</option>
                      <option value="antibiotique">Antibiotique</option>
                      <option value="antiparasitaire">Antiparasitaire</option>
                      <option value="antifongique">Antifongique</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date début *</label>
                    <input type="date" className="form-input" value={form.date_debut}
                      onChange={e => setForm({ ...form, date_debut: e.target.value })} required />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Date fin</label>
                    <input type="date" className="form-input" value={form.date_fin}
                      onChange={e => setForm({ ...form, date_fin: e.target.value })} />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Produit / Médicament *</label>
                    <input className="form-input" value={form.produit}
                      onChange={e => setForm({ ...form, produit: e.target.value })} required placeholder="Nom commercial" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Molécule active</label>
                    <input className="form-input" value={form.molecule}
                      onChange={e => setForm({ ...form, molecule: e.target.value })} placeholder="DCI" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Dose</label>
                    <input className="form-input" value={form.dose}
                      onChange={e => setForm({ ...form, dose: e.target.value })} placeholder="Ex: 1ml/L eau" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Voie d'administration</label>
                    <select className="form-select" value={form.voie_administration}
                      onChange={e => setForm({ ...form, voie_administration: e.target.value })}>
                      <option value="">--</option>
                      <option>Eau de boisson</option>
                      <option>Injection IM</option>
                      <option>Injection SC</option>
                      <option>Aliment</option>
                      <option>Spray</option>
                    </select>
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Temps d'attente (jours)</label>
                    <input type="number" className="form-input" value={form.temps_attente_jours}
                      onChange={e => setForm({ ...form, temps_attente_jours: e.target.value })} min="0" />
                  </div>
                  <div className="form-groupe">
                    <label className="form-label">Coût (FCFA)</label>
                    <input type="number" className="form-input" value={form.cout}
                      onChange={e => setForm({ ...form, cout: e.target.value })} min="0" />
                  </div>
                </div>
                <div className="form-groupe">
                  <label className="form-label">Raison du traitement</label>
                  <input className="form-input" value={form.raison}
                    onChange={e => setForm({ ...form, raison: e.target.value })} placeholder="Symptômes observés..." />
                </div>

                {/* Section Photo */}
                <div style={{
                  border: '1px solid var(--bordure)', borderRadius: 'var(--radius)',
                  padding: 16, marginTop: 8
                }}>
                  <div className="form-label" style={{ marginBottom: 12 }}>📸 Photo (optionnel)</div>

                  {!cameraActive && !photoPreview && (
                    <button type="button" className="btn btn-secondaire" onClick={ouvrirCamera}>
                      📷 Prendre une photo instantanée
                    </button>
                  )}

                  {cameraActive && (
                    <div>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        style={{ width: '100%', borderRadius: 8, maxHeight: 240, objectFit: 'cover', background: '#000' }}
                      />
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                      <div className="flex gap-2 mt-2">
                        <button type="button" className="btn btn-primaire" onClick={prendrePhoto}>
                          📸 Capturer
                        </button>
                        <button type="button" className="btn btn-secondaire" onClick={fermerCamera}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {photoPreview && (
                    <div>
                      <img src={photoPreview} alt="Aperçu"
                        style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }} />
                      <button type="button" className="btn btn-secondaire btn-sm mt-2" onClick={() => { setPhotoPreview(null); setPhotoFile(null) }}>
                        🗑 Supprimer
                      </button>
                    </div>
                  )}
                </div>

                <div className="form-groupe mt-4">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire" onClick={() => { setShowModal(false); fermerCamera() }}>Annuler</button>
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
