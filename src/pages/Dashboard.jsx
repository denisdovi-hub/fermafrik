import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const TooltipPerso = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-carte)', border: '1px solid var(--bordure)',
      borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem'
    }}>
      <div style={{ color: 'var(--gris-moyen)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { profil } = useAuthStore()
  const [kpis, setKpis] = useState({ totalOeufs: 0, tauxPonte: 0, effectif: 0, mortalites: 0 })
  const [graphData, setGraphData] = useState([])
  const [alertes, setAlertes] = useState([])
  const [vaccinsProches, setVaccinsProches] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    chargerDonnees()
  }, [])

  const chargerDonnees = async () => {
    try {
      // KPIs production du jour
      const { data: prodJour } = await supabase
        .from('production_oeufs')
        .select('oeufs_produits, oeufs_casses')
        .eq('date_collecte', today)

      const totalOeufs = prodJour?.reduce((s, r) => s + r.oeufs_produits, 0) || 0
      const totalCasses = prodJour?.reduce((s, r) => s + r.oeufs_casses, 0) || 0

      // Effectif total
      const { data: bandes } = await supabase
        .from('bandes')
        .select('effectif_actuel')
        .eq('statut', 'actif')

      const effectif = bandes?.reduce((s, b) => s + b.effectif_actuel, 0) || 0
      const tauxPonte = effectif > 0 ? ((totalOeufs / effectif) * 100).toFixed(1) : 0

      // Mortalités du jour
      const { data: morts } = await supabase
        .from('mouvements_cheptel')
        .select('quantite')
        .eq('date_mouvement', today)
        .eq('type_mouvement', 'mortalite')

      const mortalites = morts?.reduce((s, m) => s + m.quantite, 0) || 0

      setKpis({ totalOeufs, tauxPonte, effectif, mortalites, totalCasses })

      // Données graphique 14 derniers jours
      const dates = Array.from({ length: 14 }, (_, i) =>
        format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
      )

      const { data: histoProd } = await supabase
        .from('production_oeufs')
        .select('date_collecte, oeufs_produits, oeufs_casses')
        .gte('date_collecte', dates[0])
        .lte('date_collecte', today)
        .order('date_collecte')

      const grouped = {}
      histoProd?.forEach(r => {
        if (!grouped[r.date_collecte]) grouped[r.date_collecte] = { oeufs: 0, casses: 0 }
        grouped[r.date_collecte].oeufs += r.oeufs_produits
        grouped[r.date_collecte].casses += r.oeufs_casses
      })

      const chartData = dates.map(d => ({
        date: format(new Date(d + 'T12:00:00'), 'dd/MM', { locale: fr }),
        'Œufs produits': grouped[d]?.oeufs || 0,
        'Cassés': grouped[d]?.casses || 0,
      }))
      setGraphData(chartData)

      // Vaccins dans les 7 prochains jours
      const dans7j = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd')
      const { data: vaccins } = await supabase
        .from('calendrier_vaccinal')
        .select('*, vaccins_ref(nom), bandes(nom)')
        .eq('statut', 'prevu')
        .gte('date_prevue', today)
        .lte('date_prevue', dans7j)
        .order('date_prevue')
        .limit(5)

      setVaccinsProches(vaccins || [])

      // Alertes stock
      const { data: stocks } = await supabase
        .from('stock_aliments')
        .select('*')

      const alertesStock = stocks?.filter(s => s.stock_actuel_kg <= s.stock_minimum_kg) || []
      setAlertes(alertesStock)

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="page-chargement">
      <div className="spinner" />
      <span>Chargement du tableau de bord...</span>
    </div>
  )

  return (
    <div className="animate-fade">
      {/* Bienvenue */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--blanc)' }}>
          Bonjour, {profil?.prenom}
        </h1>
        <div style={{ color: 'var(--gris-moyen)', fontSize: '0.875rem', marginTop: 4 }}>
          {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })} · Tableau de bord
        </div>
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="alerte alerte-warning" style={{ marginBottom: 20 }}>
          ⚠️ Stock critique : {alertes.map(a => a.nom).join(', ')} — réapprovisionner dès que possible
        </div>
      )}

      {/* KPIs */}
      <div className="grille-kpi">
        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🥚</div>
          <div className="kpi-valeur">{kpis.totalOeufs.toLocaleString('fr-FR')}</div>
          <div className="kpi-label">Œufs collectés aujourd'hui</div>
          {kpis.totalCasses > 0 && (
            <div className="kpi-variation baisse">⚠ {kpis.totalCasses} cassés</div>
          )}
        </div>

        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
          <div className="kpi-valeur">{kpis.tauxPonte}%</div>
          <div className="kpi-label">Taux de ponte</div>
          <div className={`kpi-variation ${kpis.tauxPonte >= 70 ? 'hausse' : 'baisse'}`}>
            {kpis.tauxPonte >= 70 ? '✓ Bon niveau' : '↓ Sous la normale'}
          </div>
        </div>

        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🐔</div>
          <div className="kpi-valeur">{kpis.effectif.toLocaleString('fr-FR')}</div>
          <div className="kpi-label">Effectif actif total</div>
        </div>

        <div className="kpi-carte">
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📉</div>
          <div className="kpi-valeur" style={{ color: kpis.mortalites > 0 ? 'var(--rouge-alerte)' : 'var(--vert-clair)' }}>
            {kpis.mortalites}
          </div>
          <div className="kpi-label">Mortalités aujourd'hui</div>
          {kpis.mortalites === 0 && (
            <div className="kpi-variation hausse">✓ Aucune</div>
          )}
        </div>
      </div>

      {/* Graphique production */}
      <div className="graphique-container">
        <div className="graphique-titre">📈 Production — 14 derniers jours</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={graphData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,138,82,0.1)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--gris-moyen)', fontSize: 11 }} />
            <Tooltip content={<TooltipPerso />} />
            <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--gris-moyen)' }} />
            <Line type="monotone" dataKey="Œufs produits" stroke="var(--vert-clair)" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="Cassés" stroke="var(--rouge-alerte)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Vaccins à venir */}
      {vaccinsProches.length > 0 && (
        <div className="carte">
          <div className="carte-header">
            <div className="carte-titre">💉 Vaccinations à venir (7 jours)</div>
          </div>
          {vaccinsProches.map(v => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid rgba(45,138,82,0.1)'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  {v.vaccins_ref?.nom}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gris-moyen)', marginTop: 2 }}>
                  Bande : {v.bandes?.nom}
                </div>
              </div>
              <span className="badge badge-ocre">
                {format(new Date(v.date_prevue + 'T12:00:00'), 'dd/MM/yyyy')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
