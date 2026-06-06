import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart
} from 'recharts'

const COLORS = ['#2d8a52', '#4db87a', '#c87941', '#f0c040', '#2980b9', '#e74c3c']

const TooltipPerso = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-carte)', border: '1px solid var(--bordure)', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem' }}>
      <div style={{ color: 'var(--gris-moyen)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') : p.value}</div>)}
    </div>
  )
}

const TYPES_RAPPORT = [
  { key: 'tout', label: 'Tout', icon: '📋' },
  { key: 'production', label: 'Production', icon: '🥚' },
  { key: 'comptabilite', label: 'Comptabilité', icon: '💰' },
  { key: 'sanitaire', label: 'Sanitaire', icon: '💉' },
  { key: 'cheptel', label: 'Cheptel', icon: '🐔' },
  { key: 'stock', label: 'Stock', icon: '🌽' },
]

export default function Rapports() {
  const [periode, setPeriode] = useState('30j')
  const [typeRapport, setTypeRapport] = useState('tout')
  const [productionData, setProductionData] = useState([])
  const [comptaData, setComptaData] = useState([])
  const [statsGlobales, setStatsGlobales] = useState({})
  const [cheptelData, setCheptelData] = useState([])
  const [stockData, setStockData] = useState([])
  const [sanitaireData, setSanitaireData] = useState([])
  const [loading, setLoading] = useState(true)
  const [telechargement, setTelechargement] = useState(false)

  const PERIODES = {
    '7j': { label: '7 jours', jours: 7 },
    '30j': { label: '30 jours', jours: 30 },
    '90j': { label: '3 mois', jours: 90 },
    '365j': { label: '12 mois', jours: 365 },
  }

  useEffect(() => { charger() }, [periode])

  const charger = async () => {
    setLoading(true)
    const jours = PERIODES[periode].jours
    const debut = format(subDays(new Date(), jours - 1), 'yyyy-MM-dd')

    const [prod, bandes, compta, mortalites, stocks, vaccins] = await Promise.all([
      supabase.from('production_oeufs').select('date_collecte, oeufs_produits, oeufs_casses, oeufs_sales, nombre_plateaux, bandes(effectif_actuel)').gte('date_collecte', debut).order('date_collecte'),
      supabase.from('bandes').select('*').eq('statut', 'actif'),
      supabase.from('comptabilite').select('date_operation, type_operation, montant, categorie').gte('date_operation', debut).order('date_operation'),
      supabase.from('mouvements_cheptel').select('date_mouvement, type_mouvement, quantite').gte('date_mouvement', debut).order('date_mouvement'),
      supabase.from('stock_aliments').select('*').order('nom'),
      supabase.from('calendrier_vaccinal').select('*, vaccins_ref(nom), bandes(nom)').gte('date_prevue', debut).order('date_prevue'),
    ])

    const effectif = bandes.data?.reduce((s, b) => s + b.effectif_actuel, 0) || 1

    // Production groupée
    const prodGrouped = {}
    prod.data?.forEach(r => {
      if (!prodGrouped[r.date_collecte]) prodGrouped[r.date_collecte] = { total: 0, casses: 0, sales: 0, plateaux: 0, effectif: 0 }
      prodGrouped[r.date_collecte].total += r.oeufs_produits
      prodGrouped[r.date_collecte].casses += r.oeufs_casses
      prodGrouped[r.date_collecte].sales += r.oeufs_sales
      prodGrouped[r.date_collecte].plateaux += r.nombre_plateaux
      prodGrouped[r.date_collecte].effectif = Math.max(prodGrouped[r.date_collecte].effectif, r.bandes?.effectif_actuel || 0)
    })

    const prodArr = Object.entries(prodGrouped).map(([date, v]) => ({
      date: format(new Date(date + 'T12:00:00'), jours <= 30 ? 'dd/MM' : 'MMM', { locale: fr }),
      dateRaw: date,
      'Produits': v.total,
      'Cassés': v.casses,
      'Taux (%)': +((v.total / (v.effectif || effectif)) * 100).toFixed(1),
      'Plateaux': +v.plateaux.toFixed(1),
    }))
    setProductionData(prodArr)

    // Comptabilité mensuelle
    const comptaGrouped = {}
    compta.data?.forEach(o => {
      const mois = format(new Date(o.date_operation + 'T12:00:00'), 'MMM yy', { locale: fr })
      if (!comptaGrouped[mois]) comptaGrouped[mois] = { recettes: 0, depenses: 0 }
      if (o.type_operation === 'recette') comptaGrouped[mois].recettes += o.montant
      else comptaGrouped[mois].depenses += o.montant
    })
    const comptaArr = Object.entries(comptaGrouped).map(([mois, v]) => ({
      mois, 'Recettes': v.recettes, 'Dépenses': v.depenses, 'Bénéfice': v.recettes - v.depenses,
    }))
    setComptaData(comptaArr)

    // Stock
    setStockData(stocks.data || [])

    // Cheptel
    setCheptelData(bandes.data || [])

    // Sanitaire
    setSanitaireData(vaccins.data || [])

    // Stats globales
    const totalProd = prod.data?.reduce((s, r) => s + r.oeufs_produits, 0) || 0
    const totalCasses = prod.data?.reduce((s, r) => s + r.oeufs_casses, 0) || 0
    const totalPlateaux = prod.data?.reduce((s, r) => s + r.nombre_plateaux, 0) || 0
    const totalRecettes = compta.data?.filter(o => o.type_operation === 'recette').reduce((s, o) => s + o.montant, 0) || 0
    const totalDepenses = compta.data?.filter(o => o.type_operation === 'depense').reduce((s, o) => s + o.montant, 0) || 0
    const totalMorts = mortalites.data?.filter(m => m.type_mouvement === 'mortalite').reduce((s, m) => s + m.quantite, 0) || 0
    const tauxPonteMoyen = prodArr.length > 0 ? (prodArr.reduce((s, r) => s + (r['Taux (%)'] || 0), 0) / prodArr.length).toFixed(1) : 0

    setStatsGlobales({
      totalProd, totalCasses, totalPlateaux, totalRecettes, totalDepenses,
      benefice: totalRecettes - totalDepenses,
      totalMorts, effectif, tauxPonteMoyen,
      tauxCasse: totalProd > 0 ? ((totalCasses / totalProd) * 100).toFixed(1) : 0
    })

    setLoading(false)
  }

  // Génération CSV
  const genererCSV = (donnees, colonnes, nomFichier) => {
    const entete = colonnes.join(';')
    const lignes = donnees.map(row => colonnes.map(col => row[col] ?? '').join(';'))
    const contenu = [entete, ...lignes].join('\n')
    const blob = new Blob(['\uFEFF' + contenu], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nomFichier}_${format(new Date(), 'dd-MM-yyyy')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const telechargerRapport = () => {
    setTelechargement(true)
    const label = PERIODES[periode].label

    try {
      if (typeRapport === 'production' || typeRapport === 'tout') {
        const cols = ['date', 'Produits', 'Cassés', 'Plateaux', 'Taux (%)']
        // Ajouter ligne totaux
        const avecTotaux = [...productionData, {
          date: 'TOTAL',
          'Produits': productionData.reduce((s, r) => s + r['Produits'], 0),
          'Cassés': productionData.reduce((s, r) => s + r['Cassés'], 0),
          'Plateaux': +productionData.reduce((s, r) => s + r['Plateaux'], 0).toFixed(1),
          'Taux (%)': statsGlobales.tauxPonteMoyen,
        }]
        genererCSV(avecTotaux, cols, `rapport_production_${label}`)
      }

      if (typeRapport === 'comptabilite' || typeRapport === 'tout') {
        const cols = ['mois', 'Recettes', 'Dépenses', 'Bénéfice']
        genererCSV(comptaData, cols, `rapport_comptabilite_${label}`)
      }

      if (typeRapport === 'stock' || typeRapport === 'tout') {
        const stockFormatted = stockData.map(a => ({
          Aliment: a.nom, Type: a.type_aliment,
          'Stock actuel (kg)': a.stock_actuel_kg,
          'Seuil 20% (kg)': a.stock_minimum_kg,
          'Prix/kg (FCFA)': a.prix_unitaire_kg,
        }))
        genererCSV(stockFormatted, ['Aliment', 'Type', 'Stock actuel (kg)', 'Seuil 20% (kg)', 'Prix/kg (FCFA)'], `rapport_stock_${label}`)
      }

      if (typeRapport === 'cheptel' || typeRapport === 'tout') {
        const cheptelFormatted = cheptelData.map(b => ({
          Bande: b.nom, Type: b.type_bande || '',
          'Effectif actuel': b.effectif_actuel,
          Statut: b.statut,
          'Date démarrage': b.date_demarrage || '',
        }))
        genererCSV(cheptelFormatted, ['Bande', 'Type', 'Effectif actuel', 'Statut', 'Date démarrage'], `rapport_cheptel_${label}`)
      }

      if (typeRapport === 'sanitaire' || typeRapport === 'tout') {
        const sanitaireFormatted = sanitaireData.map(v => ({
          Vaccin: v.vaccins_ref?.nom || '',
          Bande: v.bandes?.nom || '',
          'Date prévue': v.date_prevue,
          'Date réalisée': v.date_realisee || '',
          Statut: v.statut,
        }))
        genererCSV(sanitaireFormatted, ['Vaccin', 'Bande', 'Date prévue', 'Date réalisée', 'Statut'], `rapport_sanitaire_${label}`)
      }
    } catch (err) {
      console.error(err)
    }
    setTelechargement(false)
  }

  // Totaux production
  const totalProduits = productionData.reduce((s, r) => s + r['Produits'], 0)
  const totalCasses = productionData.reduce((s, r) => s + r['Cassés'], 0)
  const totalPlateaux = +productionData.reduce((s, r) => s + r['Plateaux'], 0).toFixed(1)
  const tauxMoyen = productionData.length > 0
    ? (productionData.reduce((s, r) => s + r['Taux (%)'], 0) / productionData.length).toFixed(1)
    : 0

  const afficherSection = (section) => typeRapport === 'tout' || typeRapport === section

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Génération des rapports...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Bilans & Rapports</h1>
          <div className="text-gris text-sm mt-1">Analyse globale des performances de la ferme</div>
        </div>
        <div className="flex gap-2">
          {Object.entries(PERIODES).map(([key, p]) => (
            <button key={key} className={`btn btn-sm ${periode === key ? 'btn-primaire' : 'btn-secondaire'}`}
              onClick={() => setPeriode(key)}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Sélection type de rapport + téléchargement */}
      <div className="carte" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gris-moyen)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Type de rapport
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TYPES_RAPPORT.map(t => (
                <button key={t.key}
                  onClick={() => setTypeRapport(t.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'var(--font)',
                    background: typeRapport === t.key ? 'var(--vert-moyen)' : '#f3f4f6',
                    color: typeRapport === t.key ? '#fff' : 'var(--blanc)',
                    border: typeRapport === t.key ? '1px solid var(--vert-moyen)' : '1px solid #e5e7eb',
                  }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-primaire"
            onClick={telechargerRapport}
            disabled={telechargement}
            style={{ whiteSpace: 'nowrap' }}>
            {telechargement ? <span className="spinner" /> : '⬇ Télécharger CSV'}
          </button>
        </div>
      </div>

      {/* KPIs globaux */}
      {afficherSection('production') && (
        <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { icon: '🥚', val: statsGlobales.totalProd?.toLocaleString('fr-FR'), label: 'Œufs produits' },
            { icon: '📊', val: `${statsGlobales.tauxPonteMoyen}%`, label: 'Taux ponte moyen' },
            { icon: '💔', val: statsGlobales.totalCasses, label: 'Œufs cassés', couleur: statsGlobales.totalCasses > 0 ? 'var(--rouge-alerte)' : undefined },
            { icon: '🍽️', val: statsGlobales.totalPlateaux?.toFixed(1), label: 'Plateaux totaux' },
          ].map((k, i) => (
            <div key={i} className="kpi-carte">
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{k.icon}</div>
              <div className="kpi-valeur" style={k.couleur ? { color: k.couleur, fontSize: '1.3rem' } : { fontSize: '1.3rem' }}>{k.val}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {afficherSection('comptabilite') && (
        <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { icon: '📈', val: statsGlobales.totalRecettes?.toLocaleString('fr-FR') + ' FCFA', label: 'Recettes totales', couleur: '#16a34a' },
            { icon: '📉', val: statsGlobales.totalDepenses?.toLocaleString('fr-FR') + ' FCFA', label: 'Dépenses totales', couleur: 'var(--rouge-alerte)' },
            { icon: '💰', val: (statsGlobales.benefice >= 0 ? '+' : '') + statsGlobales.benefice?.toLocaleString('fr-FR') + ' FCFA', label: 'Bénéfice net', couleur: statsGlobales.benefice >= 0 ? '#16a34a' : 'var(--rouge-alerte)' },
          ].map((k, i) => (
            <div key={i} className="kpi-carte">
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{k.icon}</div>
              <div className="kpi-valeur" style={{ color: k.couleur, fontSize: '1.3rem' }}>{k.val}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Graphique production */}
      {afficherSection('production') && productionData.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">Production & Taux de ponte</div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={productionData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <Tooltip content={<TooltipPerso />} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--gris-moyen)' }} />
              <Bar yAxisId="left" dataKey="Produits" fill="#1a1a2e" opacity={0.85} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="left" dataKey="Cassés" fill="var(--rouge-alerte)" opacity={0.7} radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="Taux (%)" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Graphique comptabilité */}
      {afficherSection('comptabilite') && comptaData.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">Recettes vs Dépenses (FCFA)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={comptaData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="mois" tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <Tooltip content={<TooltipPerso />} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--gris-moyen)' }} />
              <Bar dataKey="Recettes" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Dépenses" fill="var(--rouge-alerte)" radius={[3, 3, 0, 0]} opacity={0.8} />
              <Bar dataKey="Bénéfice" fill="#f59e0b" radius={[3, 3, 0, 0]} opacity={0.9} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau production avec totaux */}
      {afficherSection('production') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Résumé production par jour</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr><th>Période</th><th>Œufs produits</th><th>Cassés</th><th>Plateaux</th><th>Taux ponte</th></tr>
              </thead>
              <tbody>
                {productionData.slice(-15).reverse().map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{r.date}</td>
                    <td className="font-mono font-bold">{r['Produits'].toLocaleString('fr-FR')}</td>
                    <td style={{ color: r['Cassés'] > 0 ? 'var(--rouge-alerte)' : 'inherit' }}>{r['Cassés']}</td>
                    <td className="font-mono">{r['Plateaux']}</td>
                    <td>
                      <span className={`badge ${r['Taux (%)'] >= 70 ? 'badge-success' : r['Taux (%)'] >= 50 ? 'badge-warning' : 'badge-danger'}`}>
                        {r['Taux (%)']}%
                      </span>
                    </td>
                  </tr>
                ))}
                {productionData.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>
                )}
              </tbody>
              {/* Ligne totaux */}
              {productionData.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f3f4f6', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--gris-moyen)', padding: '10px 16px' }}>TOTAL</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{totalProduits.toLocaleString('fr-FR')}</td>
                    <td style={{ fontWeight: 800, color: totalCasses > 0 ? 'var(--rouge-alerte)' : 'inherit', fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{totalCasses}</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{totalPlateaux}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className={`badge ${tauxMoyen >= 70 ? 'badge-success' : tauxMoyen >= 50 ? 'badge-warning' : 'badge-danger'}`}>
                        {tauxMoyen}% moy.
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tableau cheptel */}
      {afficherSection('cheptel') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Bandes actives</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr><th>Bande</th><th>Type</th><th>Effectif actuel</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {cheptelData.map((b, i) => (
                  <tr key={i}>
                    <td className="font-bold">{b.nom}</td>
                    <td><span className="badge badge-neutral">{b.type_bande || '—'}</span></td>
                    <td className="font-mono font-bold">{b.effectif_actuel?.toLocaleString('fr-FR')}</td>
                    <td><span className="badge badge-success">{b.statut}</span></td>
                  </tr>
                ))}
                {cheptelData.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>
                )}
              </tbody>
              {cheptelData.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f3f4f6', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--gris-moyen)', padding: '10px 16px' }}>TOTAL</td>
                    <td style={{ padding: '10px 16px' }}>—</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>
                      {cheptelData.reduce((s, b) => s + (b.effectif_actuel || 0), 0).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ padding: '10px 16px' }}>—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tableau stock */}
      {afficherSection('stock') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Inventaire stock aliments</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr><th>Aliment</th><th>Type</th><th>Stock actuel (kg)</th><th>Seuil 20% (kg)</th><th>Prix/kg (FCFA)</th></tr>
              </thead>
              <tbody>
                {stockData.map((a, i) => (
                  <tr key={i}>
                    <td className="font-bold">{a.nom}</td>
                    <td><span className="badge badge-neutral">{a.type_aliment}</span></td>
                    <td className="font-mono font-bold">{a.stock_actuel_kg?.toLocaleString('fr-FR')}</td>
                    <td className="font-mono text-gris">{a.stock_minimum_kg?.toLocaleString('fr-FR')}</td>
                    <td className="font-mono">{a.prix_unitaire_kg?.toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
                {stockData.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tableau sanitaire */}
      {afficherSection('sanitaire') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Calendrier vaccinal</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead>
                <tr><th>Vaccin</th><th>Bande</th><th>Date prévue</th><th>Date réalisée</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {sanitaireData.map((v, i) => (
                  <tr key={i}>
                    <td className="font-bold">{v.vaccins_ref?.nom || '—'}</td>
                    <td>{v.bandes?.nom || '—'}</td>
                    <td className="font-mono text-xs">{v.date_prevue}</td>
                    <td className="font-mono text-xs">{v.date_realisee || '—'}</td>
                    <td>
                      <span className={`badge ${v.statut === 'realise' ? 'badge-success' : v.statut === 'retard' ? 'badge-danger' : 'badge-warning'}`}>
                        {v.statut}
                      </span>
                    </td>
                  </tr>
                ))}
                {sanitaireData.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
