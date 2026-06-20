import { useEffect, useState, useRef } from 'react'
import imgPlateau from '../assets/plateau.png'
import imgOeufCasse from '../assets/oeuf-casse.png'
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

// Icône plateau SVG (grille d'alvéoles)
const IconePlateau = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <image href="/plateau.png" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" style={{ borderRadius: 4 }} />
  </svg>
)

// Icône oeuf cassé
const IconeOeufCasse = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <image href="/oeuf-casse.png" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />
  </svg>
)

export default function Production() {
  const { profil, peutEcrire } = useAuthStore()
  const [bandes, setBandes] = useState([])
  const [productions, setProductions] = useState([])
  const [groupedProductions, setGroupedProductions] = useState([])
  const [graphData, setGraphData] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
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

  useEffect(() => { charger() }, [])

  // Regroupe les collectes par date + bande + session
  const grouperProductions = (prods) => {
    const map = {}
    prods.forEach(p => {
      const key = `${p.date_collecte}__${p.bande_id}__${p.session}`
      if (!map[key]) {
        map[key] = {
          key,
          date_collecte: p.date_collecte,
          bande_nom: p.bandes?.nom || '—',
          bande_effectif: p.bandes?.effectif_actuel || 0,
          session: p.session,
          oeufs_produits: 0,
          oeufs_casses: 0,
          oeufs_sales: 0,
          collecteurs: [],
          photos: [],
        }
      }
      map[key].oeufs_produits += p.oeufs_produits
      map[key].oeufs_casses += p.oeufs_casses
      map[key].oeufs_sales += p.oeufs_sales
      if (p.profils) {
        map[key].collecteurs.push({
          prenom: p.profils.prenom,
          quantite: p.oeufs_produits
        })
      }
      if (p.photo_url) {
        map[key].photos.push(p.photo_url)
      }
    })

    return Object.values(map).map(g => {
      const effectif = g.bande_effectif
      const plateaux = +(g.oeufs_produits / OEUFS_PAR_PLATEAU).toFixed(2)
      const taux = effectif > 0 ? +((g.oeufs_produits / effectif) * 100).toFixed(2) : 0
      return { ...g, nombre_plateaux: plateaux, taux_ponte: taux }
    })
  }

  const charger = async () => {
    setLoading(true)
    const { data: b } = await supabase.from('bandes').select('*').eq('statut', 'actif').order('nom')
    setBandes(b || [])

    const { data: p } = await supabase
      .from('production_oeufs')
      .select('*, bandes(nom, effectif_actuel), profils(prenom, nom)')
      .order('date_collecte', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120)

    setProductions(p || [])
    setGroupedProductions(grouperProductions(p || []))

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
    if (name === 'oeufs_produits') {
      const prod = parseInt(value) || 0
      setForm({ ...updated, plateaux_calc: (prod / OEUFS_PAR_PLATEAU).toFixed(2) })
    } else {
      setForm(updated)
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.bande_id) return toast.error('Sélectionnez une bande')
    if (!form.oeufs_produits) return toast.error('Indiquez le nombre d\'œufs')
    const prod_val = parseInt(form.oeufs_produits) || 0
    const casses_val = parseInt(form.oeufs_casses) || 0
    const sales_val = parseInt(form.oeufs_sales) || 0
    if (casses_val > prod_val) return toast.error(`Les œufs cassés (${casses_val}) ne peuvent pas dépasser les œufs produits (${prod_val})`)
    if (sales_val > prod_val) return toast.error(`Les œufs sales (${sales_val}) ne peuvent pas dépasser les œufs produits (${prod_val})`)
    if (!photoFile) return toast.error('📸 Une photo de justification est obligatoire')

    setSaving(true)
    try {
      const ext = photoFile.name.split('.').pop()
      const fileName = `production/${Date.now()}_${profil?.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('justificatifs')
        .upload(fileName, photoFile, { contentType: photoFile.type })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('justificatifs').getPublicUrl(fileName)
      const photoUrl = urlData.publicUrl

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
        notes: form.notes,
        photo_url: photoUrl
      }, { onConflict: 'bande_id,date_collecte,session' })

      if (error) throw error

      toast.success('Production enregistrée avec photo !')
      setShowModal(false)
      setForm({ bande_id: '', date_collecte: today, session: 'matin', oeufs_produits: '', oeufs_casses: '', oeufs_sales: '', notes: '' })
      supprimerPhoto()
      charger()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const prodJour = productions.filter(p => p.date_collecte === today)
  const totalJour = prodJour.reduce((s, r) => s + r.oeufs_produits, 0)
  const cassesJour = prodJour.reduce((s, r) => s + r.oeufs_casses, 0)
  const plateauxJour = (totalJour / OEUFS_PAR_PLATEAU).toFixed(1)
  const effectifTotal = bandes.reduce((s, b) => s + (b.effectif_actuel || 0), 0)
  const tauxJour = effectifTotal > 0 ? ((totalJour / effectifTotal) * 100).toFixed(1) : 0

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

      {/* KPI Cards */}
      <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {/* Oeufs aujourd'hui */}
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🥚</div>
          <div className="kpi-valeur">{totalJour.toLocaleString('fr-FR')}</div>
          <div className="kpi-label">ŒUFS AUJOURD'HUI</div>
        </div>

        {/* Plateaux — photo miniature */}
        <div className="kpi-carte">
          <div style={{ marginBottom: 8 }}>
            <img
              src={imgPlateau}
              alt="plateau d'œufs"
              style={{ width: 56, height: 42, objectFit: 'contain', borderRadius: 6, display: 'block', margin: '0 auto' }}
            />
          </div>
          <div className="kpi-valeur">{plateauxJour}</div>
          <div className="kpi-label">PLATEAUX (30 ŒUFS)</div>
        </div>

        {/* Oeufs cassés — photo miniature */}
        <div className="kpi-carte">
          <div style={{ marginBottom: 8 }}>
            <img
              src={imgOeufCasse}
              alt="œuf cassé"
              style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 6, display: 'block', margin: '0 auto' }}
            />
          </div>
          <div className="kpi-valeur" style={cassesJour > 0 ? { color: 'var(--rouge-alerte)' } : {}}>
            {cassesJour}
          </div>
          <div className="kpi-label">ŒUFS CASSÉS</div>
        </div>

        {/* Taux de ponte */}
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
          <div className="kpi-valeur">{tauxJour}%</div>
          <div className="kpi-label">TAUX DE PONTE</div>
        </div>
      </div>

      {/* Graphiques */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="graphique-container" style={{ margin: 0 }}>
          <div className="graphique-titre">📊 Production 30 jours</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={graphData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} interval={4} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, fontSize: '0.75rem' }} />
              <Line type="monotone" dataKey="Taux (%)" stroke="var(--or)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau historique simple */}
      <div className="carte">
        <div className="carte-header">
          <div className="carte-titre">Historique des collectes</div>
        </div>
        <div className="tableau-container">
          <table className="tableau" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th><th>Bande</th><th>Session</th><th>Produits</th>
                <th>Cassés</th><th>Sales</th><th>Plateaux</th><th>Taux</th>
                <th>Photo</th><th>Collecteur</th>
              </tr>
            </thead>
            <tbody>
              {productions.slice(0, 30).map((p, index) => (
                <tr key={p.id} style={{
                  backgroundColor: index % 2 === 0 ? 'var(--bg-carte)' : 'rgba(0,0,0,0.03)'
                }}>
                  <td className="font-mono text-xs">{p.date_collecte}</td>
                  <td>{p.bandes?.nom || '—'}</td>
                  <td>
                    <span className={`badge ${p.session === 'matin' ? 'badge-warning' : 'badge-info'}`}>
                      {p.session === 'matin' ? '🌅 Matin' : '🌙 Soir'}
                    </span>
                  </td>
                  <td className="font-bold">{p.oeufs_produits.toLocaleString('fr-FR')}</td>
                  <td style={{ color: p.oeufs_casses > 0 ? 'var(--rouge-alerte)' : 'inherit' }}>{p.oeufs_casses}</td>
                  <td>{p.oeufs_sales}</td>
                  <td className="font-mono">{p.nombre_plateaux}</td>
                  <td>
                    <span className={`badge ${p.taux_ponte >= 70 ? 'badge-success' : p.taux_ponte >= 50 ? 'badge-warning' : 'badge-danger'}`}>
                      {p.taux_ponte}%
                    </span>
                  </td>
                  <td>
                    {p.photo_url
                      ? <a href={p.photo_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--bleu-info)', fontSize: '0.8rem', textDecoration: 'underline' }}>
                          📸 Voir
                        </a>
                      : <span style={{ color: 'var(--gris-moyen)', fontSize: '0.75rem' }}>—</span>
                    }
                  </td>
                  <td className="text-gris text-xs">{p.profils ? `${p.profils.prenom}` : '—'}</td>
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
                onClick={() => { setShowModal(false); supprimerPhoto() }}>✕</button>
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--bleu-info)', marginTop: 4 }}>
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
                        Prenez une photo des œufs collectés
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondaire"
                  onClick={() => { setShowModal(false); supprimerPhoto() }}>Annuler</button>
                <button type="submit" className="btn btn-primaire" disabled={saving || !photoFile}>
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
