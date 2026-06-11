"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { ArrowLeft, Upload, RefreshCw, Trash2, Eye, ShoppingBag, FileText } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { relativeTime } from "@/components/chat/helpers"

type KbDocument = {
  id: string
  source_type: "upload" | "shopify_product"
  title: string
  file_name: string | null
  status: "processing" | "indexed" | "error" | "disabled"
  error_message: string | null
  chunk_count: number
  tags: string[]
  created_at: string
  indexed_at: string | null
}

type KbChunk = { chunk_index: number; section_heading: string | null; content: string }

const STATUS_BADGE: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700 animate-pulse",
  indexed: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
  disabled: "bg-zinc-100 text-zinc-400",
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [showProducts, setShowProducts] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [chunks, setChunks] = useState<KbChunk[] | null>(null)
  const [chunksTitle, setChunksTitle] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await adminFetch("/api/chat/admin/kb/documents")
      const data = await res.json()
      setDocuments(data.documents || [])
      setLastSync(data.products_last_sync || null)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
    const interval = setInterval(fetchDocuments, 10000)
    return () => clearInterval(interval)
  }, [fetchDocuments])

  async function syncProducts() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await adminFetch("/api/chat/admin/kb/sync-products", { method: "POST" })
      const data = await res.json()
      if (data.error) {
        setSyncResult(`Erreur : ${data.error}`)
      } else {
        setSyncResult(`${data.total} produits — ${data.created} créés, ${data.updated} mis à jour, ${data.disabled} désactivés`)
      }
      fetchDocuments()
    } catch (err) {
      setSyncResult(`Erreur : ${(err as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    const mimeByExt: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      md: "text/markdown",
      txt: "text/plain",
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    const mime = file.type || mimeByExt[ext] || ""
    if (!Object.values(mimeByExt).includes(mime)) {
      setUploadStatus("Format non supporté (pdf, docx, md, txt)")
      return
    }
    try {
      setUploadStatus(`Upload de ${file.name}…`)
      const res = await adminFetch("/api/chat/admin/kb/upload-url", {
        method: "POST",
        body: JSON.stringify({ file_name: file.name, mime_type: mime, size_bytes: file.size }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const putRes = await fetch(data.upload_url, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: file,
      })
      if (!putRes.ok) throw new Error(`upload échoué (${putRes.status})`)

      setUploadStatus(`Indexation de ${file.name}…`)
      fetchDocuments()
      const ingestRes = await adminFetch(`/api/chat/admin/kb/documents/${data.document_id}/ingest`, {
        method: "POST",
      })
      const ingestData = await ingestRes.json()
      if (ingestData.error) throw new Error(ingestData.error)
      setUploadStatus(`${file.name} indexé — ${ingestData.chunk_count} chunks ✓`)
      fetchDocuments()
    } catch (err) {
      setUploadStatus(`Erreur : ${(err as Error).message}`)
      fetchDocuments()
    }
  }

  async function viewChunks(doc: KbDocument) {
    setChunksTitle(doc.title)
    setChunks([])
    const res = await adminFetch(`/api/chat/admin/kb/documents/${doc.id}/chunks`)
    const data = await res.json()
    setChunks(data.chunks || [])
  }

  async function reindex(id: string) {
    await adminFetch(`/api/chat/admin/kb/documents/${id}/reindex`, { method: "POST" })
    fetchDocuments()
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce document et ses chunks ?")) return
    await adminFetch(`/api/chat/admin/kb/documents/${id}`, { method: "DELETE" })
    fetchDocuments()
  }

  const visible = documents.filter((d) => (showProducts ? true : d.source_type === "upload"))
  const productCount = documents.filter((d) => d.source_type === "shopify_product" && d.status === "indexed").length

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/chat" className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Base de connaissances</h1>
          <p className="text-sm text-zinc-500">Ce que le bot sait — fichiers uploadés + catalogue Shopify</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-zinc-400" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Catalogue Shopify</h2>
                <p className="text-xs text-zinc-500">
                  {productCount} produits indexés · dernière sync {lastSync ? relativeTime(lastSync) : "jamais"}
                </p>
              </div>
            </div>
            <button
              onClick={syncProducts}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sync…" : "Synchroniser"}
            </button>
          </div>
          {syncResult && <p className="mt-3 text-xs text-zinc-600">{syncResult}</p>}
          <p className="mt-2 text-[11px] text-zinc-400">Synchronisé automatiquement chaque nuit par le cron.</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors ${
            dragOver ? "border-zinc-400 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
          }`}
        >
          <Upload className="h-6 w-6 text-zinc-400" />
          <p className="mt-2 text-sm font-medium text-zinc-700">Déposer un fichier ici ou cliquer</p>
          <p className="text-xs text-zinc-400">PDF, DOCX, MD, TXT — max 25 Mo</p>
          {uploadStatus && <p className="mt-2 text-xs font-medium text-zinc-600">{uploadStatus}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.md,.txt"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Documents ({visible.length})</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={showProducts} onChange={(e) => setShowProducts(e.target.checked)} />
            Afficher les produits Shopify
          </label>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-400">
              <th className="px-5 py-2 font-medium">Titre</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Statut</th>
              <th className="px-3 py-2 font-medium">Chunks</th>
              <th className="px-3 py-2 font-medium">Indexé</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-zinc-400">
                  Aucun document uploadé. Commence par déposer une FAQ, des fiches ou des études cliniques.
                </td>
              </tr>
            )}
            {visible.map((doc) => (
              <tr key={doc.id} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                <td className="max-w-xs truncate px-5 py-2.5 text-zinc-800">{doc.title}</td>
                <td className="px-3 py-2.5">
                  <span className="flex w-fit items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                    {doc.source_type === "upload" ? <FileText className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                    {doc.source_type === "upload" ? "Fichier" : "Produit"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    title={doc.error_message || undefined}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[doc.status]}`}
                  >
                    {doc.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-zinc-500">{doc.chunk_count}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">{doc.indexed_at ? relativeTime(doc.indexed_at) : "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => viewChunks(doc)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100" title="Voir les chunks">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {doc.source_type === "upload" && (
                      <button onClick={() => reindex(doc.id)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100" title="Réindexer">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => remove(doc.id)} className="rounded p-1.5 text-red-300 hover:bg-red-50 hover:text-red-500" title="Supprimer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chunks !== null && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setChunks(null)}>
          <div className="flex-1 bg-black/30" />
          <div className="h-full w-[480px] overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold text-zinc-900">{chunksTitle}</h3>
            <p className="mb-4 text-xs text-zinc-400">{chunks.length} chunks indexés</p>
            <div className="space-y-3">
              {chunks.map((c) => (
                <div key={c.chunk_index} className="rounded-lg border border-zinc-100 p-3">
                  <div className="mb-1 text-xs font-medium text-zinc-600">
                    #{c.chunk_index} {c.section_heading ? `· ${c.section_heading}` : ""}
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-zinc-500">{c.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
