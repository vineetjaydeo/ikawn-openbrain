import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Attachment } from '@/types/api'

interface UploadResult {
  upload: (file: File) => Promise<Attachment>
  isUploading: boolean
}

/**
 * File upload hook.
 * Uses presigned URL for large files, direct upload for small ones.
 * Returns an Attachment object ready to attach to a chat message.
 */
export function useUpload(): UploadResult {
  const [isUploading, setIsUploading] = useState(false)

  const upload = useCallback(async (file: File): Promise<Attachment> => {
    setIsUploading(true)
    try {
      const isImage = file.type.startsWith('image/')
      const attachmentType: Attachment['type'] = isImage ? 'image' : 'document'

      // Use presigned upload for all files
      const { uploadUrl, publicUrl } = await api.upload.presign(file.name, file.type)

      // Upload directly to R2/S3
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      return {
        type: attachmentType,
        url: publicUrl,
        filename: file.name,
        name: file.name,
        contentType: file.type,
      }
    } finally {
      setIsUploading(false)
    }
  }, [])

  return { upload, isUploading }
}
