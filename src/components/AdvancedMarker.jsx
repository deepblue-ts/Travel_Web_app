import { useEffect, useRef } from 'react'

/**
 * Google Maps Advanced Marker の極薄ラッパー。
 * props:
 *  - map: google.maps.Map インスタンス
 *  - position: { lat, lng }
 *  - onClick: () => void
 *  - title?: string
 *  - content?: HTMLElement（独自 DOM を使いたいとき）
 */
export default function AdvancedMarker({ map, position, onClick, title, content }) {
  const ref = useRef(null)

  useEffect(() => {
    const g = window.google
    if (!map || !g?.maps?.marker?.AdvancedMarkerElement) return

    const { AdvancedMarkerElement, PinElement } = g.maps.marker

    const pin = content ?? new PinElement()
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title,
      content: pin.element ?? pin,
      gmpClickable: true,
    })
    ref.current = marker

    if (onClick) marker.addListener('click', onClick)

    return () => {
      if (ref.current) ref.current.map = null
      ref.current = null
    }
  }, [map, position, onClick, title, content])

  return null
}
