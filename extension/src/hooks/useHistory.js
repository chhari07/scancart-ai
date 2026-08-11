import { useState, useEffect } from 'react'
import { getRecentScans } from '../services/firebase'
import { storage } from '../services/storage'

export function useHistory(user) {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [user])

  async function load() {
    setLoading(true)
    try {
      const data = user
        ? await getRecentScans(user.id, 10)
        : await storage.getScans()
      setScans(data)
    } catch { setScans([]) }
    finally { setLoading(false) }
  }

  return { scans, loading, refresh: load }
}
