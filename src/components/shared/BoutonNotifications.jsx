import { useNotifications } from '../../hooks/useNotifications'
import toast from 'react-hot-toast'

export default function BoutonNotifications() {
  const { permission, supported, subscribed, demanderPermission, verifierAlertes } = useNotifications()

  if (!supported) return null

  const handleClick = async () => {
    if (permission === 'granted') {
      await verifierAlertes()
      toast.success('Alertes vérifiées')
    } else if (permission === 'denied') {
      toast.error('Notifications bloquées — vérifiez les paramètres du navigateur')
    } else {
      const ok = await demanderPermission()
      if (ok) toast.success('Notifications activées !')
      else toast.error('Notifications refusées')
    }
  }

  const icon = permission === 'granted' ? '🔔' : permission === 'denied' ? '🔕' : '🔔'
  const style = {
    background: 'none',
    border: '1px solid var(--bordure)',
    borderRadius: 'var(--radius-sm)',
    color: permission === 'granted' ? 'var(--vert-clair)' : 'var(--gris-moyen)',
    cursor: 'pointer',
    padding: '6px 12px',
    fontSize: '1rem',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font)',
    fontSize: '0.8rem'
  }

  return (
    <button style={style} onClick={handleClick} title="Gérer les notifications">
      {icon}
      <span>{permission === 'granted' ? 'Alertes ON' : 'Activer alertes'}</span>
    </button>
  )
}
