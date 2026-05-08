import { useEffect, useRef, useState } from 'react'

const NYC_BBOX = '-74.27,40.49,-73.68,40.92'
const NYC_PROXIMITY = '-73.98,40.75'
const GEOCODE_LIMIT = 5
const DEBOUNCE_MS = 250

export function SearchBox({ accessToken, onSelect, onClear, hasPin }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const requestIdRef = useRef(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setError(null)
      setIsLoading(false)
      return
    }
    if (!accessToken) {
      setError('Missing Mapbox token')
      setResults([])
      return
    }

    const handle = setTimeout(() => {
      const myId = ++requestIdRef.current
      setIsLoading(true)
      setError(null)

      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json` +
        `?access_token=${accessToken}` +
        `&bbox=${NYC_BBOX}` +
        `&proximity=${NYC_PROXIMITY}` +
        `&country=us` +
        `&limit=${GEOCODE_LIMIT}` +
        `&autocomplete=true`

      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((json) => {
          // Drop responses that have been superseded by a newer keystroke.
          if (myId !== requestIdRef.current) return
          setResults(json.features ?? [])
          setActiveIdx(-1)
          setIsOpen(true)
          setIsLoading(false)
        })
        .catch((err) => {
          if (myId !== requestIdRef.current) return
          console.error('geocode failed', err)
          setError('Search failed')
          setResults([])
          setIsLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [query, accessToken])

  function chooseResult(result) {
    if (!result) return
    const [lng, lat] = result.center
    onSelect?.({
      longitude: lng,
      latitude: lat,
      placeName: result.place_name,
      bbox: result.bbox,
    })
    setQuery(result.place_name)
    setIsOpen(false)
    setActiveIdx(-1)
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!results.length) return
      setIsOpen(true)
      setActiveIdx((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!results.length) return
      setIsOpen(true)
      setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      const pick = activeIdx >= 0 ? results[activeIdx] : results[0]
      if (pick) {
        e.preventDefault()
        chooseResult(pick)
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        setIsOpen(false)
        setActiveIdx(-1)
      } else if (query) {
        setQuery('')
        onClear?.()
      }
    }
  }

  function onClearClick() {
    setQuery('')
    setResults([])
    setIsOpen(false)
    setActiveIdx(-1)
    setError(null)
    onClear?.()
    inputRef.current?.focus()
  }

  const showClear = query.length > 0 || hasPin

  return (
    <div className="search-box" ref={containerRef}>
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden="true">
          {/* Inline SVG so we don't need an icon font / asset round-trip. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search address or place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="Search for an address or place in New York City"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-activedescendant={activeIdx >= 0 ? `search-result-${activeIdx}` : undefined}
        />
        {isLoading && <span className="search-spinner" aria-hidden="true" />}
        {showClear && !isLoading && (
          <button
            type="button"
            className="search-clear"
            onClick={onClearClick}
            aria-label="Clear search"
            title="Clear (Esc)"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (results.length > 0 || error) && (
        <ul className="search-results" role="listbox">
          {error && <li className="search-error">{error}</li>}
          {results.map((r, i) => (
            <li
              id={`search-result-${i}`}
              key={r.id ?? `${r.place_name}-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className={`search-result${i === activeIdx ? ' search-result-active' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                chooseResult(r)
              }}
            >
              <div className="search-result-name">{primaryLabel(r)}</div>
              <div className="search-result-context">{contextLabel(r)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function primaryLabel(r) {
  if (r.text) return r.text
  const idx = r.place_name?.indexOf(',') ?? -1
  return idx > 0 ? r.place_name.slice(0, idx) : r.place_name ?? ''
}

function contextLabel(r) {
  const idx = r.place_name?.indexOf(',') ?? -1
  return idx > 0 ? r.place_name.slice(idx + 1).trim() : ''
}
