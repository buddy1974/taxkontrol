'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import MobileDrawer from './MobileDrawer'

export default function BottomNav() {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const active = (href: string) => pathname === href

  return (
    <>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden bg-gray-900 border-t border-gray-800">
        {/* Home */}
        <Link href="/dashboard" className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5">
          <svg
            className={`w-5 h-5 ${active('/dashboard') ? 'text-blue-400' : 'text-gray-500'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          <span className={`text-xs ${active('/dashboard') ? 'text-blue-400' : 'text-gray-500'}`}>Home</span>
        </Link>

        {/* Transactions */}
        <Link href="/transactions" className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5">
          <svg
            className={`w-5 h-5 ${active('/transactions') ? 'text-blue-400' : 'text-gray-500'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span className={`text-xs ${active('/transactions') ? 'text-blue-400' : 'text-gray-500'}`}>Txns</span>
        </Link>

        {/* Add — primary CTA */}
        <Link href="/input" className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5">
          <div className="w-11 h-11 -mt-4 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/40">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className={`text-xs -mt-0.5 ${active('/input') ? 'text-blue-400' : 'text-gray-500'}`}>Add</span>
        </Link>

        {/* Tax */}
        <Link href="/tax" className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5">
          <svg
            className={`w-5 h-5 ${active('/tax') ? 'text-blue-400' : 'text-gray-500'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className={`text-xs ${active('/tax') ? 'text-blue-400' : 'text-gray-500'}`}>Tax</span>
        </Link>

        {/* More */}
        <button
          onClick={() => setDrawerOpen(v => !v)}
          className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5"
        >
          <svg
            className={`w-5 h-5 ${drawerOpen ? 'text-blue-400' : 'text-gray-500'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className={`text-xs ${drawerOpen ? 'text-blue-400' : 'text-gray-500'}`}>More</span>
        </button>
      </nav>
    </>
  )
}
