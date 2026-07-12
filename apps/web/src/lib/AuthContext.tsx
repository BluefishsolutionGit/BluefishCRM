import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isMfaChallenge, type LoginOutcome, type UserDto } from '@bluefish/shared'
import { api, clearToken, getToken, setToken } from './api'

export interface ClientLoginOutcome {
  requiresMfa?: true
  mfaToken?: string
}

interface AuthState {
  user: UserDto | null
  loading: boolean
  login: (email: string, password: string) => Promise<ClientLoginOutcome | undefined>
  verifyMfa: (mfaToken: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  hasPermission: (key: string) => boolean
  handleSsoOutcome: (accessToken: string) => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null)
  const [loading, setLoading] = useState(true)

  const bootstrapFromToken = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    try {
      const me = await api.me()
      setUser(me)
    } catch {
      clearToken()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { bootstrapFromToken() }, [bootstrapFromToken])

  const login = useCallback(async (email: string, password: string): Promise<ClientLoginOutcome | undefined> => {
    const outcome = (await api.login(email, password)) as LoginOutcome
    if (isMfaChallenge(outcome)) return { requiresMfa: true, mfaToken: outcome.mfaToken }
    setToken(outcome.accessToken)
    setUser(outcome.user)
    return undefined
  }, [])

  const verifyMfa = useCallback(async (mfaToken: string, code: string) => {
    const outcome = (await api.loginMfa(mfaToken, code)) as LoginOutcome
    if (isMfaChallenge(outcome)) throw new Error('Unexpected MFA challenge')
    setToken(outcome.accessToken)
    setUser(outcome.user)
  }, [])

  const handleSsoOutcome = useCallback(async (accessToken: string) => {
    setToken(accessToken)
    const me = await api.me()
    setUser(me)
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* ignore */ }
    clearToken()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!getToken()) return
    try { const me = await api.me(); setUser(me) } catch { /* ignore */ }
  }, [])

  const hasPermission = useCallback(
    (key: string) => Boolean(user?.permissions?.includes(key)),
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, login, verifyMfa, logout, refreshUser, hasPermission, handleSsoOutcome }),
    [user, loading, login, verifyMfa, logout, refreshUser, hasPermission, handleSsoOutcome],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
