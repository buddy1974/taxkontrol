import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SidebarNav from '@/components/shared/SidebarNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-950">
      <SidebarNav userName={session.user?.name ?? session.user?.email ?? 'User'} />
      <main className="lg:ml-56 pt-14 lg:pt-0 p-4 lg:p-8">
        {children}
      </main>
    </div>
  )
}
