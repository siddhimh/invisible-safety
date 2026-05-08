import { useEffect, useRef, useState } from 'react'

export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  align = 'start',
  minWidth,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef(null)
  const buttonRef = useRef(null)

  const selectedIdx = options.findIndex((o) => o.value === value)
  const selectedLabel =
    selectedIdx >= 0 ? options[selectedIdx].label : options[0]?.label ?? ''
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function open() {
    if (isOpen) return
    setIsOpen(true)
    setActiveIdx(selectedIdx >= 0 ? selectedIdx : 0)
  }

  function close() {
    setIsOpen(false)
    setActiveIdx(-1)
    buttonRef.current?.focus()
  }

  function pick(idx) {
    const opt = options[idx]
    if (!opt) return
    onChange?.(opt.value)
    setIsOpen(false)
    setActiveIdx(-1)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        open()
        return
      }
      setActiveIdx((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) {
        open()
        return
      }
      setActiveIdx((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        e.preventDefault()
        open()
        return
      }
      if (activeIdx >= 0) {
        e.preventDefault()
        pick(activeIdx)
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault()
        close()
      }
    } else if (e.key === 'Tab') {
      // Let Tab move focus out naturally, but collapse the menu first
      // so it doesn't visually trail behind.
      setIsOpen(false)
      setActiveIdx(-1)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`dropdown ${className}`}
      onKeyDown={onKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? close() : open())}
      >
        <span className="dropdown-value">{selectedLabel}</span>
        <svg
          className={`dropdown-chevron${isOpen ? ' is-open' : ''}`}
          width="10"
          height="6"
          viewBox="0 0 12 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 2 L6 6 L10 2" />
        </svg>
      </button>

      {isOpen && (
        <ul
          className={`dropdown-menu dropdown-menu-${align}`}
          role="listbox"
          aria-label={ariaLabel}
          style={
            minWidth && align !== 'stretch' ? { minWidth } : undefined
          }
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIdx
            return (
              <li
                key={String(opt.value)}
                role="option"
                aria-selected={isSelected}
                className={
                  'dropdown-option' +
                  (isActive ? ' is-active' : '') +
                  (isSelected ? ' is-selected' : '')
                }
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(i)
                }}
              >
                <span className="dropdown-option-label">{opt.label}</span>
                {isSelected && (
                  <svg
                    className="dropdown-option-check"
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 8.5 L6.5 12 L13 4" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
