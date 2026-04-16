'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API_URL = '/api'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
        if (!res.ok) {
          router.push('/login')
          return
        }
        const user = (await res.json()) as { role: string }
        if (user.role !== 'ADMIN') {
          router.push('/')
          return
        }
        setAuthorized(true)
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    checkAdmin()
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Admin</h1>
          <Link href="/admin/users" className="text-sm text-blue-600 hover:underline">
            Usuarios
          </Link>
          <Link href="/admin/invite" className="text-sm text-blue-600 hover:underline">
            Invitar
          </Link>
          <Link href="/" className="ml-auto text-sm text-gray-500 hover:underline">
            Volver
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  )
}
