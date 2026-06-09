import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Line
} from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

const MARINE = [26, 26, 46]
const VERT = [22, 163, 74]
const ROUGE = [239, 68, 68]
const GRIS = [107, 114, 128]

function enTetePDF(doc, titre, periode, logoBase64) {
  const w = doc.internal.pageSize.getWidth()
  // Bande marine en haut
  doc.setFillColor(...MARINE)
  doc.rect(0, 0, w, 30, 'F')

  // Logo image si disponible
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 10, 2, 22, 22)
  }

  // Nom société
  const textX = logoBase64 ? 36 : 14
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('FermAfrik', textX, 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 210)
  doc.text('Gestion Avicole', textX, 18)

  // Titre rapport
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(titre, textX, 25)

  // Date et période en haut droite
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 200, 220)
  doc.text(`Période : ${periode}`, w - 14, 12, { align: 'right' })
  doc.text(`Généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm')}`, w - 14, 18, { align: 'right' })

  return 38 // y de départ après l'entête
}

function piedPagePDF(doc) {
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const nbPages = doc.internal.getNumberOfPages()

  for (let i = 1; i <= nbPages; i++) {
    doc.setPage(i)
    doc.setFillColor(245, 245, 245)
    doc.rect(0, h - 12, w, 12, 'F')
    doc.setDrawColor(220, 220, 220)
    doc.line(0, h - 12, w, h - 12)
    doc.setFontSize(7)
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'normal')
    doc.text('FermAfrik — Gestion Avicole | Rapport confidentiel', 14, h - 4)
    doc.text(`Page ${i} / ${nbPages}`, w - 14, h - 4, { align: 'right' })
  }
}

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
  const [formatExport, setFormatExport] = useState('pdf')

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
      'Produits': v.total, 'Cassés': v.casses,
      'Taux (%)': +((v.total / (v.effectif || effectif)) * 100).toFixed(1),
      'Plateaux': +v.plateaux.toFixed(1),
    }))
    setProductionData(prodArr)

    const comptaGrouped = {}
    compta.data?.forEach(o => {
      const mois = format(new Date(o.date_operation + 'T12:00:00'), 'MMM yy', { locale: fr })
      if (!comptaGrouped[mois]) comptaGrouped[mois] = { recettes: 0, depenses: 0 }
      if (o.type_operation === 'recette') comptaGrouped[mois].recettes += o.montant
      else comptaGrouped[mois].depenses += o.montant
    })
    setComptaData(Object.entries(comptaGrouped).map(([mois, v]) => ({ mois, 'Recettes': v.recettes, 'Dépenses': v.depenses, 'Bénéfice': v.recettes - v.depenses })))
    setStockData(stocks.data || [])
    setCheptelData(bandes.data || [])
    setSanitaireData(vaccins.data || [])

    const totalProd = prod.data?.reduce((s, r) => s + r.oeufs_produits, 0) || 0
    const totalCasses = prod.data?.reduce((s, r) => s + r.oeufs_casses, 0) || 0
    const totalPlateaux = prod.data?.reduce((s, r) => s + r.nombre_plateaux, 0) || 0
    const totalRecettes = compta.data?.filter(o => o.type_operation === 'recette').reduce((s, o) => s + o.montant, 0) || 0
    const totalDepenses = compta.data?.filter(o => o.type_operation === 'depense').reduce((s, o) => s + o.montant, 0) || 0
    const totalMorts = mortalites.data?.filter(m => m.type_mouvement === 'mortalite').reduce((s, m) => s + m.quantite, 0) || 0
    const tauxMoyen = prodArr.length > 0 ? (prodArr.reduce((s, r) => s + (r['Taux (%)'] || 0), 0) / prodArr.length).toFixed(1) : 0

    setStatsGlobales({ totalProd, totalCasses, totalPlateaux, totalRecettes, totalDepenses, benefice: totalRecettes - totalDepenses, totalMorts, effectif, tauxPonteMoyen: tauxMoyen })
    setLoading(false)
  }

  // ---- EXPORT CSV ----
  const genererCSV = (donnees, colonnes, nomFichier) => {
    const entete = colonnes.join(';')
    const lignes = donnees.map(row => colonnes.map(col => row[col] ?? '').join(';'))
    const blob = new Blob(['\uFEFF' + [entete, ...lignes].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nomFichier}_${format(new Date(), 'dd-MM-yyyy')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exporterCSV = () => {
    const label = PERIODES[periode].label
    if (typeRapport === 'production' || typeRapport === 'tout') {
      const avecTotaux = [...productionData, { date: 'TOTAL', 'Produits': totalProduits, 'Cassés': totalCasses, 'Plateaux': totalPlateaux, 'Taux (%)': tauxMoyen + '% moy.' }]
      genererCSV(avecTotaux, ['date', 'Produits', 'Cassés', 'Plateaux', 'Taux (%)'], `production_${label}`)
    }
    if (typeRapport === 'comptabilite' || typeRapport === 'tout')
      genererCSV(comptaData, ['mois', 'Recettes', 'Dépenses', 'Bénéfice'], `comptabilite_${label}`)
    if (typeRapport === 'stock' || typeRapport === 'tout')
      genererCSV(stockData.map(a => ({ Aliment: a.nom, Type: a.type_aliment, 'Stock (kg)': a.stock_actuel_kg, 'Seuil 20%': a.stock_minimum_kg, 'Prix/kg': a.prix_unitaire_kg })), ['Aliment', 'Type', 'Stock (kg)', 'Seuil 20%', 'Prix/kg'], `stock_${label}`)
    if (typeRapport === 'cheptel' || typeRapport === 'tout')
      genererCSV(cheptelData.map(b => ({ Bande: b.nom, Effectif: b.effectif_actuel, Statut: b.statut })), ['Bande', 'Effectif', 'Statut'], `cheptel_${label}`)
    if (typeRapport === 'sanitaire' || typeRapport === 'tout')
      genererCSV(sanitaireData.map(v => ({ Vaccin: v.vaccins_ref?.nom || '', Bande: v.bandes?.nom || '', 'Date prevue': v.date_prevue, 'Date realisee': v.date_realisee || '', Statut: v.statut })), ['Vaccin', 'Bande', 'Date prevue', 'Date realisee', 'Statut'], `sanitaire_${label}`)
  }

  // ---- EXPORT PDF ----
  const exporterPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const label = PERIODES[periode].label
    const labelRapport = TYPES_RAPPORT.find(t => t.key === typeRapport)?.label || 'Complet'
    // Charger le logo
    let logoB64 = null
    try {
      const resp = await fetch('/logo.png')
      const blob = await resp.blob()
      logoB64 = await new Promise((res) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch(e) { logoB64 = null }
    let y = enTetePDF(doc, `Rapport ${labelRapport} — ${label}`, label, logoB64)

    const sectionTitre = (titre, yPos) => {
      doc.setFillColor(...MARINE)
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.rect(14, yPos, doc.internal.pageSize.getWidth() - 28, 7, 'F')
      doc.text(titre, 17, yPos + 5)
      return yPos + 10
    }

    const kpiBox = (label, val, x, yPos, couleur) => {
      doc.setFillColor(248, 248, 252)
      doc.setDrawColor(220, 220, 230)
      doc.roundedRect(x, yPos, 42, 16, 2, 2, 'FD')
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...(couleur || MARINE))
      doc.text(String(val), x + 21, yPos + 8, { align: 'center' })
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRIS)
      doc.text(label, x + 21, yPos + 13, { align: 'center' })
    }

    // ---- PRODUCTION ----
    if (typeRapport === 'production' || typeRapport === 'tout') {
      y = sectionTitre('PRODUCTION', y)
      kpiBox('Oeufs produits', statsGlobales.totalProd?.toLocaleString('fr-FR') || 0, 14, y, MARINE)
      kpiBox('Taux ponte moy.', `${statsGlobales.tauxPonteMoyen}%`, 59, y, VERT)
      kpiBox('Oeufs casses', statsGlobales.totalCasses || 0, 104, y, ROUGE)
      kpiBox('Plateaux totaux', (statsGlobales.totalPlateaux || 0).toFixed(1), 149, y, MARINE)
      y += 22

      const rowsProd = productionData.slice(-20).map(r => [r.date, r['Produits'].toLocaleString('fr-FR'), r['Cassés'], r['Plateaux'], `${r['Taux (%)']}%`])
      rowsProd.push(['TOTAL', totalProduits.toLocaleString('fr-FR'), totalCasses, totalPlateaux, `${tauxMoyen}% moy.`])

      autoTable(doc, {
        startY: y,
        head: [['Période', 'Oeufs produits', 'Cassés', 'Plateaux', 'Taux ponte']],
        body: rowsProd,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
        headStyles: { fillColor: MARINE, textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [240, 240, 250], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.row.index === rowsProd.length - 1) {
            data.cell.styles.fillColor = [230, 240, 255]
            data.cell.styles.fontStyle = 'bold'
          }
        },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    // ---- COMPTABILITE ----
    if (typeRapport === 'comptabilite' || typeRapport === 'tout') {
      if (y > 220) { doc.addPage(); y = enTetePDF(doc, `Rapport ${labelRapport} — ${label}`, label, logoB64) }
      y = sectionTitre('COMPTABILITE', y)
      kpiBox('Recettes', (statsGlobales.totalRecettes || 0).toLocaleString('fr-FR') + ' F', 14, y, VERT)
      kpiBox('Depenses', (statsGlobales.totalDepenses || 0).toLocaleString('fr-FR') + ' F', 59, y, ROUGE)
      kpiBox('Benefice net', ((statsGlobales.benefice || 0) >= 0 ? '+' : '') + (statsGlobales.benefice || 0).toLocaleString('fr-FR') + ' F', 104, y, statsGlobales.benefice >= 0 ? VERT : ROUGE)
      y += 22

      if (comptaData.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Mois', 'Recettes (FCFA)', 'Depenses (FCFA)', 'Benefice (FCFA)']],
          body: comptaData.map(r => [r.mois, r['Recettes'].toLocaleString('fr-FR'), r['Dépenses'].toLocaleString('fr-FR'), r['Bénéfice'].toLocaleString('fr-FR')]),
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: MARINE, textColor: [255, 255, 255], fontStyle: 'bold' },
          margin: { left: 14, right: 14 },
        })
        y = doc.lastAutoTable.finalY + 8
      }
    }

    // ---- CHEPTEL ----
    if (typeRapport === 'cheptel' || typeRapport === 'tout') {
      if (y > 220) { doc.addPage(); y = enTetePDF(doc, `Rapport ${labelRapport} — ${label}`, label, logoB64) }
      y = sectionTitre('CHEPTEL', y)
      autoTable(doc, {
        startY: y,
        head: [['Bande', 'Effectif actuel', 'Statut']],
        body: [
          ...cheptelData.map(b => [b.nom, b.effectif_actuel?.toLocaleString('fr-FR'), b.statut]),
          ['TOTAL', cheptelData.reduce((s, b) => s + (b.effectif_actuel || 0), 0).toLocaleString('fr-FR'), ''],
        ],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: MARINE, textColor: [255, 255, 255], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.row.index === cheptelData.length) {
            data.cell.styles.fillColor = [230, 240, 255]
            data.cell.styles.fontStyle = 'bold'
          }
        },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    // ---- STOCK ----
    if (typeRapport === 'stock' || typeRapport === 'tout') {
      if (y > 220) { doc.addPage(); y = enTetePDF(doc, `Rapport ${labelRapport} — ${label}`, label, logoB64) }
      y = sectionTitre('STOCK ALIMENTS', y)
      autoTable(doc, {
        startY: y,
        head: [['Aliment', 'Type', 'Stock actuel (kg)', 'Seuil 20% (kg)', 'Prix/kg (FCFA)', 'Statut']],
        body: stockData.map(a => [
          a.nom, a.type_aliment,
          a.stock_actuel_kg?.toLocaleString('fr-FR'),
          a.stock_minimum_kg?.toLocaleString('fr-FR'),
          a.prix_unitaire_kg?.toLocaleString('fr-FR'),
          a.stock_actuel_kg <= a.stock_minimum_kg ? 'CRITIQUE' : 'OK'
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: MARINE, textColor: [255, 255, 255], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.column.index === 5 && data.cell.text[0] === 'CRITIQUE') {
            data.cell.styles.textColor = ROUGE
            data.cell.styles.fontStyle = 'bold'
          }
        },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    // ---- SANITAIRE ----
    if (typeRapport === 'sanitaire' || typeRapport === 'tout') {
      if (y > 220) { doc.addPage(); y = enTetePDF(doc, `Rapport ${labelRapport} — ${label}`, label, logoB64) }
      y = sectionTitre('SANTE & TRAITEMENTS', y)
      autoTable(doc, {
        startY: y,
        head: [['Vaccin', 'Bande', 'Date prevue', 'Date realisee', 'Statut']],
        body: sanitaireData.map(v => [v.vaccins_ref?.nom || '—', v.bandes?.nom || '—', v.date_prevue, v.date_realisee || '—', v.statut]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: MARINE, textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      })
    }

    piedPagePDF(doc)
    doc.save(`FermAfrik_Rapport_${labelRapport}_${format(new Date(), 'dd-MM-yyyy')}.pdf`)
  }

  const telecharger = async () => {
    setTelechargement(true)
    try {
      if (formatExport === 'pdf') await exporterPDF()
      else exporterCSV()
    } catch(e) { console.error(e) }
    setTelechargement(false)
  }

  const totalProduits = productionData.reduce((s, r) => s + r['Produits'], 0)
  const totalCasses = productionData.reduce((s, r) => s + r['Cassés'], 0)
  const totalPlateaux = +productionData.reduce((s, r) => s + r['Plateaux'], 0).toFixed(1)
  const tauxMoyen = productionData.length > 0 ? (productionData.reduce((s, r) => s + r['Taux (%)'], 0) / productionData.length).toFixed(1) : 0
  const afficher = (section) => typeRapport === 'tout' || typeRapport === section

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

      {/* Sélection type + format + téléchargement */}
      <div className="carte" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gris-moyen)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Type de rapport</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TYPES_RAPPORT.map(t => (
                <button key={t.key} onClick={() => setTypeRapport(t.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'var(--font)',
                    background: typeRapport === t.key ? '#1a1a2e' : '#f3f4f6',
                    color: typeRapport === t.key ? '#fff' : '#374151',
                    border: typeRapport === t.key ? '1px solid #1a1a2e' : '1px solid #e5e7eb',
                  }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gris-moyen)', textTransform: 'uppercase', letterSpacing: 1 }}>Format</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['pdf', 'csv'].map(f => (
                <button key={f} onClick={() => setFormatExport(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'var(--font)',
                    background: formatExport === f ? '#1a1a2e' : '#f3f4f6',
                    color: formatExport === f ? '#fff' : '#374151',
                    border: formatExport === f ? '1px solid #1a1a2e' : '1px solid #e5e7eb',
                  }}>
                  {f === 'pdf' ? '📄 PDF' : '📊 CSV'}
                </button>
              ))}
              <button className="btn btn-primaire" onClick={telecharger} disabled={telechargement} style={{ whiteSpace: 'nowrap' }}>
                {telechargement ? <span className="spinner" /> : '⬇ Télécharger'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs production */}
      {afficher('production') && (
        <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { icon: '🥚', val: statsGlobales.totalProd?.toLocaleString('fr-FR'), label: 'Oeufs produits' },
            { icon: '📊', val: `${statsGlobales.tauxPonteMoyen}%`, label: 'Taux ponte moyen' },
            { icon: '💔', val: statsGlobales.totalCasses, label: 'Oeufs cassés', couleur: statsGlobales.totalCasses > 0 ? 'var(--rouge-alerte)' : undefined },
            { icon: '🍽️', val: (statsGlobales.totalPlateaux || 0).toFixed(1), label: 'Plateaux totaux' },
          ].map((k, i) => (
            <div key={i} className="kpi-carte">
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{k.icon}</div>
              <div className="kpi-valeur" style={k.couleur ? { color: k.couleur, fontSize: '1.3rem' } : { fontSize: '1.3rem' }}>{k.val}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs comptabilité */}
      {afficher('comptabilite') && (
        <div className="grille-kpi" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { icon: '📈', val: (statsGlobales.totalRecettes || 0).toLocaleString('fr-FR') + ' FCFA', label: 'Recettes', couleur: '#16a34a' },
            { icon: '📉', val: (statsGlobales.totalDepenses || 0).toLocaleString('fr-FR') + ' FCFA', label: 'Dépenses', couleur: 'var(--rouge-alerte)' },
            { icon: '💰', val: ((statsGlobales.benefice || 0) >= 0 ? '+' : '') + (statsGlobales.benefice || 0).toLocaleString('fr-FR') + ' FCFA', label: 'Bénéfice net', couleur: (statsGlobales.benefice || 0) >= 0 ? '#16a34a' : 'var(--rouge-alerte)' },
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
      {afficher('production') && productionData.length > 0 && (
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

      {/* Graphique compta */}
      {afficher('comptabilite') && comptaData.length > 0 && (
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
      {afficher('production') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Résumé production par jour</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead><tr><th>Période</th><th>Oeufs produits</th><th>Cassés</th><th>Plateaux</th><th>Taux ponte</th></tr></thead>
              <tbody>
                {productionData.slice(-15).reverse().map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{r.date}</td>
                    <td className="font-mono font-bold">{r['Produits'].toLocaleString('fr-FR')}</td>
                    <td style={{ color: r['Cassés'] > 0 ? 'var(--rouge-alerte)' : 'inherit' }}>{r['Cassés']}</td>
                    <td className="font-mono">{r['Plateaux']}</td>
                    <td><span className={`badge ${r['Taux (%)'] >= 70 ? 'badge-success' : r['Taux (%)'] >= 50 ? 'badge-warning' : 'badge-danger'}`}>{r['Taux (%)']}%</span></td>
                  </tr>
                ))}
                {productionData.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>}
              </tbody>
              {productionData.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#eef2ff', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ fontWeight: 700, fontSize: '0.82rem', padding: '10px 16px' }}>TOTAL</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{totalProduits.toLocaleString('fr-FR')}</td>
                    <td style={{ fontWeight: 800, color: totalCasses > 0 ? 'var(--rouge-alerte)' : 'inherit', fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{totalCasses}</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{totalPlateaux}</td>
                    <td style={{ padding: '10px 16px' }}><span className={`badge ${tauxMoyen >= 70 ? 'badge-success' : tauxMoyen >= 50 ? 'badge-warning' : 'badge-danger'}`}>{tauxMoyen}% moy.</span></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tableau cheptel */}
      {afficher('cheptel') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Bandes actives</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead><tr><th>Bande</th><th>Type</th><th>Effectif actuel</th><th>Statut</th></tr></thead>
              <tbody>
                {cheptelData.map((b, i) => (
                  <tr key={i}>
                    <td className="font-bold">{b.nom}</td>
                    <td><span className="badge badge-neutral">{b.type_bande || '—'}</span></td>
                    <td className="font-mono font-bold">{b.effectif_actuel?.toLocaleString('fr-FR')}</td>
                    <td><span className="badge badge-success">{b.statut}</span></td>
                  </tr>
                ))}
                {cheptelData.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>}
              </tbody>
              {cheptelData.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#eef2ff', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ fontWeight: 700, padding: '10px 16px' }}>TOTAL</td>
                    <td style={{ padding: '10px 16px' }}>—</td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '10px 16px' }}>{cheptelData.reduce((s, b) => s + (b.effectif_actuel || 0), 0).toLocaleString('fr-FR')}</td>
                    <td style={{ padding: '10px 16px' }}>—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tableau stock */}
      {afficher('stock') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Inventaire stock aliments</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead><tr><th>Aliment</th><th>Type</th><th>Stock actuel (kg)</th><th>Seuil 20% (kg)</th><th>Prix/kg (FCFA)</th><th>Statut</th></tr></thead>
              <tbody>
                {stockData.map((a, i) => (
                  <tr key={i}>
                    <td className="font-bold">{a.nom}</td>
                    <td><span className="badge badge-neutral">{a.type_aliment}</span></td>
                    <td className="font-mono font-bold">{a.stock_actuel_kg?.toLocaleString('fr-FR')}</td>
                    <td className="font-mono text-gris">{a.stock_minimum_kg?.toLocaleString('fr-FR')}</td>
                    <td className="font-mono">{a.prix_unitaire_kg?.toLocaleString('fr-FR')}</td>
                    <td><span className={`badge ${a.stock_actuel_kg <= a.stock_minimum_kg ? 'badge-danger' : 'badge-success'}`}>{a.stock_actuel_kg <= a.stock_minimum_kg ? 'Critique' : 'OK'}</span></td>
                  </tr>
                ))}
                {stockData.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tableau sanitaire */}
      {afficher('sanitaire') && (
        <div className="carte" style={{ marginBottom: 24 }}>
          <div className="carte-header"><div className="carte-titre">Calendrier vaccinal</div></div>
          <div className="tableau-container">
            <table className="tableau">
              <thead><tr><th>Vaccin</th><th>Bande</th><th>Date prévue</th><th>Date réalisée</th><th>Statut</th></tr></thead>
              <tbody>
                {sanitaireData.map((v, i) => (
                  <tr key={i}>
                    <td className="font-bold">{v.vaccins_ref?.nom || '—'}</td>
                    <td>{v.bandes?.nom || '—'}</td>
                    <td className="font-mono text-xs">{v.date_prevue}</td>
                    <td className="font-mono text-xs">{v.date_realisee || '—'}</td>
                    <td><span className={`badge ${v.statut === 'realise' ? 'badge-success' : v.statut === 'retard' ? 'badge-danger' : 'badge-warning'}`}>{v.statut}</span></td>
                  </tr>
                ))}
                {sanitaireData.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris-moyen)', padding: 24 }}>Aucune donnée</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
