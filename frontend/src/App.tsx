import { useEffect, useState } from 'react'

type ApiStatus = 'cargando' | 'conectado' | 'sin conexión'

export default function App() {
  const [status, setStatus] = useState<ApiStatus>('cargando')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'conectado' : 'sin conexión'))
      .catch(() => setStatus('sin conexión'))
  }, [])

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold">Evaluador semántico</h1>
      <p className="mt-2 text-slate-600">Lógica de primer orden en interpretaciones finitas.</p>
      <p className="mt-4 text-sm">API: {status}</p>
    </main>
  )
}
