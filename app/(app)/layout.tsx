import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const navItems = [
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

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col fixed h-full">
        <div className="px-5 py-5 border-b border-gray-800">
          <p className="text-white font-bold text-lg">TaxKontrol</p>
          <p className="text-gray-500 text-xs mt-0.5 truncate">
            {session.user?.name ?? session.user?.email}
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 p-8">
        {children}
      </main>
    </div>
  )
}
