'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

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
  { href: '/cash', label: 'Cash control' },
  { href: '/jobcenter', label: 'Jobcenter' },
  { href: '/reports', label: 'Reports' },
  { href: '/import', label: 'Import bank statement' },
  { href: '/settings', label: 'Settings' },
]

interface Props {
  userName: string
}

export default function SidebarNav({ userName }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 h-14">
        <div>
          <p className="text-white font-bold text-base">TaxKontrol</p>
          <p className="text-gray-500 text-xs truncate max-w-[200px]">{userName}</p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-gray-400 hover:text-white p-2"
          aria-label="Toggle menu"
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black bg-opacity-60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile slide-in drawer */}
      <div className={`lg:hidden fixed top-14 left-0 bottom-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm transition-colors ${
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
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Desktop sidebar — unchanged */}
      <aside className="hidden lg:flex w-56 bg-gray-900 border-r border-gray-800 flex-col fixed h-full">
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
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
