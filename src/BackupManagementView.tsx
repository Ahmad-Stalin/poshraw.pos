import { useEffect, useState } from 'react'
import { api, ApiError, type BackupInfo } from './api'

const dateTime = (value: string) => new Date(value).toLocaleString('ckb', { dateStyle: 'medium', timeStyle: 'short' })
const fileSize = (value: number) => value < 1024 * 1024 ? `${(value / 1024).toFixed(0)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`
const backupKind: Record<BackupInfo['kind'], string> = { auto: 'ئۆتۆماتیکی ڕۆژانە', manual: 'دەستی', 'pre-restore': 'پێش گەڕاندنەوە' }

function BackupManagementView() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadBackups = async () => {
    try {
      setBackups(await api.backups())
      setError('')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا لیستی پاشەکەوتەکان بار بکرێت.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadBackups() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const createBackup = async () => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const backup = await api.createBackup()
      setBackups((current) => [backup, ...current.filter((item) => item.filename !== backup.filename)])
      setSuccess('پاشەکەوتی نوێ بە سەرکەوتوویی دروست کرا.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا پاشەکەوت دروست بکرێت.')
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async () => {
    if (!selectedFile) return
    const approved = window.confirm('دڵنیایت؟ هەموو داتای ئێستا لەگەڵ ناوەڕۆکی ئەم پاشەکەوتە دەگۆڕدرێت. پێش گۆڕین، سیستەم پاشەکەوتی پاراستن دروست دەکات.')
    if (!approved) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.restoreBackup(selectedFile)
      window.location.reload()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'نەتوانرا پاشەکەوتەکە بگەڕێندرێتەوە.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="backup-management">
      <div className="backup-intro"><div><span className="eyebrow">پاراستنی داتا</span><h2>پاشەکەوت و گەڕاندنەوە</h2><p>پاشەکەوتی بنکەدراوە دروست بکە، دایبگرە یان داتای لە پاشەکەوتێکی پێشوو بگەڕێنەوە.</p></div><button className="button button-primary" disabled={busy} onClick={() => { void createBackup() }}>{busy ? 'تکایە چاوەڕێ بە...' : 'دروستکردنی پاشەکەوت'}</button></div>
      <div className="backup-safety-note"><strong>پاشەکەوتی ئۆتۆماتیکی:</strong> سیستەم ڕۆژانە پاشەکەوت دەکات و ٣٠ ڕۆژی ڕابردوو دەپارێزێت. پاشەکەوتەکان هەژمار و داتای تایبەتی لەخۆدەگرن؛ فایلە داگیراوەکان لە شوێنێکی پارێزراو هەڵبگرە.</div>
      {error && <p className="report-error" role="alert">{error}</p>}
      {success && <p className="accounting-success" role="status">✓ {success}</p>}
      <div className="panel backup-list-panel"><div className="inventory-section-title"><div><h3>فایلەکانی پاشەکەوت</h3><p>هەموو پاشەکەوتەکانی ئەم ڕاژەرە</p></div><button className="text-action" onClick={() => { void loadBackups() }}>نوێکردنەوە</button></div>{loading ? <div className="report-section-empty">لیستەکە بار دەکرێت...</div> : backups.length ? <div className="backup-list">{backups.map((backup) => <div className="backup-row" key={backup.filename}><span className="backup-file-icon">▤</span><span className="backup-file-main"><strong>{backup.filename}</strong><small>{backupKind[backup.kind]} · {dateTime(backup.createdAt)} · {fileSize(backup.sizeBytes)}</small></span><a className="button button-secondary backup-download" href={`/api/admin/backups/${encodeURIComponent(backup.filename)}`}>داگرتن</a></div>)}</div> : <div className="report-section-empty">هێشتا پاشەکەوتێک دروست نەکراوە.</div>}</div>
      <div className="panel restore-panel"><div className="accounting-panel-heading"><span className="accounting-panel-icon reconcile-icon">↶</span><div><h3>گەڕاندنەوەی پاشەکەوت</h3><p>فایلی SQLite هەڵبژێرە. پێش جێبەجێکردن، پاشەکەوتی داتای ئێستا دروست دەکرێت.</p></div></div><label className="backup-file-picker">فایلی پاشەکەوت (.sqlite)<input type="file" accept=".sqlite,.db,application/vnd.sqlite3" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label>{selectedFile && <div className="selected-backup">هەڵبژێردراو: {selectedFile.name} · {fileSize(selectedFile.size)}</div>}<div className="restore-warning">ئاگاداری: گەڕاندنەوە داتای ئێستا بە داتای ناو پاشەکەوتەکە دەگۆڕێت. دوای تەواوبوون، پەڕەکە نوێ دەکرێتەوە و ئەگەر سێشنەکەت نەبوو، پێویستە دووبارە بچیتە ژوورەوە.</div><button className="button button-secondary restore-button" disabled={!selectedFile || busy} onClick={() => { void restoreBackup() }}>گەڕاندنەوەی پاشەکەوت</button></div>
    </section>
  )
}

export default BackupManagementView
