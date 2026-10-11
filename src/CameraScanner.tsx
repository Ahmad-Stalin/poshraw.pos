import { useEffect, useRef, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'

type CameraScannerProps = {
  onScan: (code: string) => void
  onClose: () => void
}

function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    const scanner = new Html5QrcodeScanner(
      'barcode-reader',
      {
        qrbox: { width: 250, height: 150 },
        fps: 10,
        aspectRatio: 1.0,
      },
      false,
    )
    scannerRef.current = scanner
    scanner.render(
      (decodedText) => {
        if (mounted) {
          onScan(decodedText)
          scanner.clear().catch(() => { /* ignore */ })
        }
      },
      () => {
        if (mounted) {
          setError('نەتوانرا کامیرا بکەوە. بە کەمترین یەک کامیرا بەکاربەنە.')
        }
      },
    )
    return () => {
      mounted = false
      scannerRef.current?.clear().catch(() => { /* ignore */ })
    }
  }, [onScan])

  return (
    <div className="camera-scanner">
      <div id="barcode-reader" style={{ width: '100%' }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-secondary" onClick={onClose}>داخستنی کامیرا</button>
    </div>
  )
}
export default CameraScanner