import { verifySession } from '@/lib/dal'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/dashboard/AppSidebar'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode
}) {
  await verifySession()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}
