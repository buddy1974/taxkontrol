'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { signOut } from 'next-auth/react'

const DRAWER_ITEMS = [
  { href: '/money', label: 'Money split' },
  { href: '/customers', label: 'Customers owe me' },
  { href: '/suppliers', label: 'I owe suppliers' },
  { href: '/employees', label: 'Employees' },
  { href: '/fixed-costs', label: 'Fixed costs' },
  { href: '/daily-close', label: 'Daily close' },
  { href: '/cash', label: 'Cash control' },
  { href: '/jobcenter', label: 'Jobcenter' },
  { href: '/reports', label: 'Reports' },
  { href: '/import', label: 'Import bank' },
  { href: '/settings', label: 'Settings' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function MobileDrawer({ open, onClose }: Props) {
  const pathname = usePathname()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    onCloseRef.current()
  }, [pathname])

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 md:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 rounded-t-2xl transition-transform duration-300 ease-out md:hidden ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>

        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide px-5 pb-3">
          More
        </p>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          {DRAWER_ITEMS.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-3.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="px-4 pb-6 border-t border-gray-800 pt-3">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full rounded-xl px-4 py-3.5 text-sm font-medium text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
