import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profil: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await get().fetchProfil(session.user.id)
    }
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await get().fetchProfil(session.user.id)
      } else {
        set({ user: null, profil: null })
      }
    })
  },

  fetchProfil: async (userId) => {
    const { data } = await supabase
      .from('profils')
      .select('*')
      .eq('id', userId)
      .single()
    set({ user: { id: userId }, profil: data })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profil: null })
  },

  // Permissions selon rôle
  peutEcrire: () => {
    const role = get().profil?.role
    return ['admin', 'gerant', 'technicien'].includes(role)
  },
  peutGererCompta: () => {
    const role = get().profil?.role
    return ['admin', 'comptable'].includes(role)
  },
  estAdmin: () => get().profil?.role === 'admin',
}))
