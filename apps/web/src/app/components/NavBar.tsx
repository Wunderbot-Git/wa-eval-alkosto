'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavBarProps {
  userEmail?: string
  userRole?: string
  onLogout?: () => void
}

export default function NavBar({ userEmail, userRole, onLogout }: NavBarProps) {
  const pathname = usePathname()

  const isActive = (path: string) =>
    pathname === path ? 'text-sm font-medium text-blue-600 hover:underline' : 'text-sm text-blue-600 hover:underline'

  const isAdmin = userRole === 'ADMIN' || userRole === 'INTERNAL_ALKOSTO'

  return (
    <nav className="border-b bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-bold text-gray-900">Sistema de Evaluacion</h1>
        {isAdmin && <Link href="/workspace" className={isActive('/workspace')}>Revisión V1</Link>}
        <Link href="/dashboard" className={isActive('/dashboard')}>
          Dashboard
        </Link>
        <Link href="/runs" className={isActive('/runs')}>
          Runs
        </Link>
        {isAdmin && (
          <>
            <Link href="/catalogs" className={isActive('/catalogs')}>
              Catalogos
            </Link>
            <Link href="/upload" className={isActive('/upload')}>
              Subir Conversaciones
            </Link>
            <Link href="/admin/invite" className={isActive('/admin/invite')}>
              Admin
            </Link>
          </>
        )}
        {userEmail && (
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-gray-500">{userEmail}</span>
            {onLogout && (
              <button
                onClick={onLogout}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Salir
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
