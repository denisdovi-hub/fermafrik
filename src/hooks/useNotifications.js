import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// Clé VAPID publique — à générer sur https://web-push-codelab.glitch.me/
// ou avec: npx web-push generate-vapid-keys
// Remplacer par votre vraie clé VAPID publique dans .env
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export function useNotifications() {
  const { profil } = useAuthStore()
  const [permission, setPermission] = useState(Notification.permission)
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window)
  }, [])

  const demanderPermission = async () => {
    if (!supported) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') {
      await abonner()
      return true
    }
    return false
  }

  const abonner = async () => {
    try {
      if (!VAPID_PUBLIC_KEY) {
        console.warn('Clé VAPID manquante — notifications push désactivées')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })

      const subJson = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        user_id: profil?.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      }, { onConflict: 'user_id,endpoint' })

      setSubscribed(true)
    } catch (err) {
      console.error('Erreur abonnement push:', err)
    }
  }

  // Notif locale (sans serveur push — fonctionne quand l'app est ouverte)
  const notifierLocal = (titre, message, options = {}) => {
    if (permission !== 'granted') return
    const notif = new Notification(titre, {
      body: message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: options.tag || 'fermetrack',
      ...options
    })
    notif.onclick = () => {
      window.focus()
      if (options.url) window.location.href = options.url
    }
  }

  // Vérifier les vaccins en retard et notifier
  const verifierAlertes = async () => {
    if (permission !== 'granted') return
    const today = new Date().toISOString().split('T')[0]

    const { data: vaccinsRetard } = await supabase
      .from('calendrier_vaccinal')
      .select('*, vaccins_ref(nom), bandes(nom)')
      .eq('statut', 'prevu')
      .lt('date_prevue', today)

    if (vaccinsRetard?.length > 0) {
      notifierLocal(
        `⚠️ ${vaccinsRetard.length} vaccination(s) en retard`,
        vaccinsRetard.map(v => `${v.bandes?.nom}: ${v.vaccins_ref?.nom}`).join('\n'),
        { tag: 'vaccins-retard', url: '/sanitaire' }
      )
    }

    // Stocks critiques
    const { data: stocks } = await supabase
      .from('stock_aliments')
      .select('nom, stock_actuel_kg, stock_minimum_kg')

    const critique = stocks?.filter(s => s.stock_actuel_kg <= s.stock_minimum_kg) || []
    if (critique.length > 0) {
      notifierLocal(
        `🌽 ${critique.length} stock(s) critique(s)`,
        critique.map(s => `${s.nom}: ${s.stock_actuel_kg}kg`).join('\n'),
        { tag: 'stock-critique', url: '/stock' }
      )
    }
  }

  return { permission, supported, subscribed, demanderPermission, notifierLocal, verifierAlertes }
}
