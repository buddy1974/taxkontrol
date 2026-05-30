import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/getCurrentUser'
import { isDevBypassEnabled } from '@/lib/devAuth'
import SidebarNav from '@/components/shared/SidebarNav'
import DevBadge from '@/components/shared/DevBadge'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const showDevBadge = isDevBypassEnabled()

  return (
    <div className="min-h-screen bg-gray-950">
      {showDevBadge && <DevBadge />}
      <SidebarNav userName={user.name ?? user.email ?? 'User'} />
      <main className="lg:ml-56 pt-14 lg:pt-0 p-4 lg:p-8">
        {children}
      </main>
    </div>
  )
}
