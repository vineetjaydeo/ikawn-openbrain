import { useState } from 'react'
import { FileText, Link as LinkIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Attachment } from '@/types/chat'

interface MessageAttachmentsProps {
  attachments: Attachment[]
  onImageClick: (src: string) => void
}

function ImageAttachment({
  attachment,
  onImageClick,
}: {
  attachment: Attachment
  onImageClick: (src: string) => void
}) {
  return (
    <img
      src={attachment.thumbnailUrl || attachment.url}
      alt={attachment.filename || 'Attachment'}
      className="w-[120px] h-[90px] object-cover rounded-sm cursor-pointer transition-opacity hover:opacity-80"
      onClick={() => onImageClick(attachment.url)}
      loading="lazy"
    />
  )
}

function DocumentAttachment({ attachment }: { attachment: Attachment }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5',
          'bg-[hsl(var(--input))] border border-[hsl(var(--border))]',
          'rounded-[20px] text-xs text-[var(--text-secondary)]',
          attachment.extractedText && 'cursor-pointer'
        )}
        onClick={() => attachment.extractedText && setExpanded(!expanded)}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[200px]">{attachment.filename || 'Document'}</span>
        {attachment.extractedText && (
          expanded
            ? <ChevronUp className="h-3 w-3 shrink-0" />
            : <ChevronDown className="h-3 w-3 shrink-0" />
        )}
      </div>
      {expanded && attachment.extractedText && (
        <div className="mt-1.5 px-3 py-2 bg-[var(--surface-1)] border border-[hsl(var(--border))] rounded-sm text-xs text-[var(--text-secondary)] max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {attachment.extractedText}
        </div>
      )}
    </div>
  )
}

function LinkAttachment({ attachment }: { attachment: Attachment }) {
  if (attachment.ogTitle || attachment.ogImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex gap-3 p-2.5 max-w-[320px]',
          'bg-[var(--surface-1)] border border-[hsl(var(--border))]',
          'rounded-lg hover:border-[hsl(var(--border))]/80 transition-colors',
          'no-underline'
        )}
      >
        {attachment.ogImage && (
          <img
            src={attachment.ogImage}
            alt=""
            className="w-16 h-16 rounded-sm object-cover shrink-0"
          />
        )}
        <div className="min-w-0 flex flex-col justify-center">
          {attachment.ogTitle && (
            <p className="text-xs font-medium text-[var(--text)] truncate">
              {attachment.ogTitle}
            </p>
          )}
          {attachment.ogDescription && (
            <p className="text-[0.7rem] text-[var(--text-secondary)] line-clamp-2 mt-0.5">
              {attachment.ogDescription}
            </p>
          )}
          <p className="text-[0.65rem] text-[var(--text-tertiary)] truncate mt-1">
            {new URL(attachment.url).hostname}
          </p>
        </div>
      </a>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5',
        'bg-[hsl(var(--input))] border border-[hsl(var(--border))]',
        'rounded-[20px] text-xs text-[var(--gold)]',
        'hover:underline'
      )}
    >
      <LinkIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[200px]">
        {new URL(attachment.url).hostname}
      </span>
    </a>
  )
}

export function MessageAttachments({ attachments, onImageClick }: MessageAttachmentsProps) {
  if (!attachments.length) return null

  const images = attachments.filter((a) => a.type === 'image')
  const documents = attachments.filter((a) => a.type === 'document')
  const links = attachments.filter((a) => a.type === 'link')

  return (
    <div className="flex flex-col gap-2 mb-2.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <ImageAttachment
              key={img.id}
              attachment={img}
              onImageClick={onImageClick}
            />
          ))}
        </div>
      )}
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {documents.map((doc) => (
            <DocumentAttachment key={doc.id} attachment={doc} />
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <LinkAttachment key={link.id} attachment={link} />
          ))}
        </div>
      )}
    </div>
  )
}
