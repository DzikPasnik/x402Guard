'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MetadataViewerProps {
  readonly metadata: Record<string, unknown>
}

export function MetadataViewer({ metadata }: MetadataViewerProps) {
  const [expanded, setExpanded] = useState(false)
  const keys = Object.keys(metadata)

  if (keys.length === 0) {
    return <span className="text-xs text-muted-foreground">--</span>
  }

  const summary = keys
    .slice(0, 3)
    .map((k) => `${k}: ${JSON.stringify(metadata[k])}`)
    .join(', ')

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="max-w-[200px] truncate text-xs text-muted-foreground">
          {summary}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>
      {expanded && (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  )
}
