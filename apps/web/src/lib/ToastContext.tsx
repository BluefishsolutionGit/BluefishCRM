import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const showToast = useCallback((msg: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    setToast(msg)
    timer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 26,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2E1A6B',
            color: '#fff',
            borderRadius: 11,
            padding: '11px 20px',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 12px 30px rgba(14,31,25,.3)',
            zIndex: 99,
            animation: 'fadeUp .2s ease',
          }}
        >
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  )
}
