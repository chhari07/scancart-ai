import { useState, useEffect } from 'react'
import { authService } from '../services/auth'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const u = await authService.getCurrentUser()
    setUser(u)
    setLoading(false)
  }

  return {
    user,
    loading,
    isLoggedIn: !!user,
    login: authService.redirectToLogin,
    signup: authService.redirectToSignUp,
    logout: async () => { await authService.logout(); setUser(null) },
    refresh: load,
  }
}
