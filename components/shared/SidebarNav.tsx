'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/input', label: 'Add transaction' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/tax', label: 'Tax reserve' },
  { href: '/money', label: 'Money split' },
  { href: '/customers', label: 'Customers owe me' },
  { href: '/suppliers', label: 'I owe suppliers' },
  { href: '/employees', label: 'Employees' },
  { href: '/fixed-costs', label: 'Fixed costs' },
  { href: '/daily-close', label: 'Daily close' },
  { href: '/jobcenter', label: 'Jobcenter' },
  { href: '/reports', label: 'Reports' },
]

interface Props {
  userName: string
}

export default function SidebarNav({ userName }: Props) {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col fixed h-full">
      <div className="px-5 py-5 border-b border-gray-800">
        <p className="text-white font-bold text-lg">TaxKontrol</p>
        <p className="text-gray-500 text-xs mt-0.5 truncate">{userName}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
