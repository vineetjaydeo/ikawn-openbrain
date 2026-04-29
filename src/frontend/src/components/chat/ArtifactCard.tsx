import { useState } from 'react'
import { ExternalLink, Download, Loader2 } from 'lucide-react'
import type { Artifact } from '@/stores/chat'

interface ArtifactCardProps {
  artifact: Artifact
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownloadPdf() {
    setError(null)
    setDownloading(true)
    try {
      const res = await fetch('/api/artifacts/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: artifact.url,
          title: artifact.title || artifact.filename || 'artifact',
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`PDF render failed (${res.status}): ${text || res.statusText}`)
      }
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${(artifact.title || 'artifact').replace(/[^\w\-. ]+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 14,
        background: '#0F0F0F',
        border: '1px solid #2A2A2A',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #2A2A2A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#F5F5F5',
            fontFamily: 'Inter, sans-serif',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={artifact.title || artifact.filename}
        >
          {artifact.title || artifact.filename || 'HTML artifact'}
        </span>
        <span style={{ fontSize: 11, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {artifact.type || 'html'}
        </span>
      </div>

      <iframe
        title={artifact.title || 'Artifact preview'}
        src={artifact.url}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{ width: '100%', height: 600, border: 'none', background: '#FFFFFF', display: 'block' }}
      />

      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #2A2A2A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        {error && (
          <span style={{ fontSize: 12, color: '#F87171', marginRight: 'auto' }}>{error}</span>
        )}
        <a
          href={artifact.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: '#A8A8A8',
            background: 'transparent',
            border: '1px solid #2A2A2A',
            borderRadius: 8,
            padding: '6px 10px',
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <ExternalLink size={13} />
          Open
        </a>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: '#0A0A0A',
            background: '#FFC01C',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            cursor: downloading ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            opacity: downloading ? 0.7 : 1,
          }}
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {downloading ? 'Rendering' : 'Download PDF'}
        </button>
      </div>
    </div>
  )
}
