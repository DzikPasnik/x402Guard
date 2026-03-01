import { Skeleton } from '@/components/ui/skeleton'

export default function AuditLogLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`row-${String(i)}`} className="h-12 w-full rounded" />
        ))}
      </div>
    </div>
  )
}
