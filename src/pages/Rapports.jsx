import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Area, PieChart, Pie, Cell
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

export default function Rapports() {
  const [periode, setPeriode] = useState('30j')
  const [productionData, setProductionData] = useState([])
  const [cheptelData, setCheptelData] = useState([])
  const [comptaData, setComptaData] = useState([])
  const [statsGlobales, setStatsGlobales] = useState({})
  const [loading, setLoading] = useState(true)

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
    const today = format(new Date(), 'yyyy-MM-dd')

    const [prod, bandes, compta, mortalites] = await Promise.all([
      supabase.from('production_oeufs').select('date_collecte, oeufs_produits, oeufs_casses, oeufs_sales, nombre_plateaux, bandes(effectif_actuel)')
        .gte('date_collecte', debut).order('date_collecte'),
      supabase.from('bandes').select('*').eq('statut', 'actif'),
      supabase.from('comptabilite').select('date_operation, type_operation, montant, categorie')
        .gte('date_operation', debut).order('date_operation'),
      supabase.from('mouvements_cheptel').select('date_mouvement, type_mouvement, quantite')
        .gte('date_mouvement', debut).order('date_mouvement'),
    ])

    // Production groupée par jour
    const prodGrouped = {}
    prod.data?.forEach(r => {
      if (!prodGrouped[r.date_collecte]) prodGrouped[r.date_collecte] = { total: 0, casses: 0, sales: 0, plateaux: 0, effectif: 0 }
      prodGrouped[r.date_collecte].total += r.oeufs_produits
      prodGrouped[r.date_collecte].casses += r.oeufs_casses
      prodGrouped[r.date_collecte].sales += r.oeufs_sales
      prodGrouped[r.date_collecte].plateaux += r.nombre_plateaux
      prodGrouped[r.date_collecte].effectif = Math.max(prodGrouped[r.date_collecte].effectif, r.bandes?.effectif_actuel || 0)
    })

    const effectif = bandes.data?.reduce((s, b) => s + b.effectif_actuel, 0) || 1
    const prodArr = Object.entries(prodGrouped).map(([date, v]) => ({
      date: format(new Date(date + 'T12:00:00'), jours <= 30 ? 'dd/MM' : 'MMM', { locale: fr }),
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
      mois,
      'Recettes': v.recettes,
      'Dépenses': v.depenses,
      'Bénéfice': v.recettes - v.depenses,
    }))
    setComptaData(comptaArr)

    // Stats globales
    const totalProd = prod.data?.reduce((s, r) => s + r.oeufs_produits, 0) || 0
    const totalCasses = prod.data?.reduce((s, r) => s + r.oeufs_casses, 0) || 0
    const totalRecettes = compta.data?.filter(o => o.type_operation === 'recette').reduce((s, o) => s + o.montant, 0) || 0
    const totalDepenses = compta.data?.filter(o => o.type_operation === 'depense').reduce((s, o) => s + o.montant, 0) || 0
    const totalMorts = mortalites.data?.filter(m => m.type_mouvement === 'mortalite').reduce((s, m) => s + m.quantite, 0) || 0

    setStatsGlobales({
      totalProd, totalCasses, totalRecettes, totalDepenses,
      benefice: totalRecettes - totalDepenses,
      totalMorts, effectif,
      tauxPontesMoyen: effectif > 0 && prodArr.length > 0
        ? (prodArr.reduce((s, r) => s + (r['Taux (%)'] || 0), 0) / prodArr.length).toFixed(1) : 0,
      tauxCasse: totalProd > 0 ? ((totalCasses / totalProd) * 100).toFixed(1) : 0
    })

    setLoading(false)
  }

  if (loading) return <div className="page-chargement"><div className="spinner" /><span>Génération des rapports...</span></div>

  return (
    <div className="animate-fade">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>📈 Bilans & Rapports</h1>
          <div className="text-gris text-sm mt-1">Analyse globale des performances de la ferme</div>
        </div>
        <div className="flex gap-2">
          {Object.entries(PERIODES).map(([key, p]) => (
            <button key={key} className={`btn btn-sm ${periode === key ? 'btn-primaire' : 'btn-secondaire'}`}
              onClick={() => setPeriode(key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs globaux */}
      <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { icon: '🥚', val: statsGlobales.totalProd?.toLocaleString('fr-FR'), label: 'Œufs produits' },
          { icon: '📊', val: `${statsGlobales.tauxPontesMoyen}%`, label: 'Taux ponte moyen' },
          { icon: '💰', val: statsGlobales.benefice >= 0 ? `+${statsGlobales.benefice?.toLocaleString('fr-FR')}` : statsGlobales.benefice?.toLocaleString('fr-FR'), label: 'Bénéfice (FCFA)', couleur: statsGlobales.benefice >= 0 ? 'var(--vert-clair)' : 'var(--rouge-alerte)' },
          { icon: '💀', val: statsGlobales.totalMorts, label: 'Mortalités totales', couleur: statsGlobales.totalMorts > 0 ? 'var(--rouge-alerte)' : undefined },
        ].map((k, i) => (
          <div key={i} className="kpi-carte">
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{k.icon}</div>
            <div className="kpi-valeur" style={k.couleur ? { color: k.couleur, fontSize: '1.3rem' } : { fontSize: '1.3rem' }}>{k.val}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Graphique production + taux ponte */}
      <div className="graphique-container">
        <div className="graphique-titre">🥚 Production & Taux de ponte</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={productionData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,138,82,0.1)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
            <Tooltip content={<TooltipPerso />} />
            <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--gris-moyen)' }} />
            <Bar yAxisId="left" dataKey="Produits" fill="var(--vert-vif)" opacity={0.8} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="left" dataKey="Cassés" fill="var(--rouge-alerte)" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="Taux (%)" stroke="var(--or)" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Graphique comptabilité */}
      {comptaData.length > 0 && (
        <div className="graphique-container">
          <div className="graphique-titre">💰 Recettes vs Dépenses (FCFA)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={comptaData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,138,82,0.1)" />
              <XAxis dataKey="mois" tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 10 }} />
              <Tooltip content={<TooltipPerso />} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--gris-moyen)' }} />
              <Bar dataKey="Recettes" fill="var(--vert-clair)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Dépenses" fill="var(--rouge-alerte)" radius={[3, 3, 0, 0]} opacity={0.8} />
              <Bar dataKey="Bénéfice" fill="var(--or)" radius={[3, 3, 0, 0]} opacity={0.9} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau plateaux */}
      <div className="carte">
        <div className="carte-header">
          <div className="carte-titre">🍽️ Résumé production par jour</div>
        </div>
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
                    <span className={`badge ${r['Taux (%)'] >= 70 ? 'badge-vert' : r['Taux (%)'] >= 50 ? 'badge-ocre' : 'badge-rouge'}`}>
                      {r['Taux (%)']}%
                    </span>
                  </td>
                </tr>
              ))}
              {productionData.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>
                  Aucune donnée sur cette période
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
