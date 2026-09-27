function UnitGlyph({ code }) {
  if (code === 'public_relations') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 13 11-5v8L4 11v2Z" />
        <path d="M15 10.5 19 9v6l-4-1.5M6.2 13.8 7.5 19h3l-1.2-4" />
      </svg>
    )
  }

  if (code === 'research') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m14.7 14.7 4.8 4.8M7.8 11.2l1.7-2 1.7 1.3 2-2.6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.3A2.8 2.8 0 0 1 7.3 2.5H11v17H7.2a2.7 2.7 0 0 0-2.7 2.7V5.3Z" />
      <path d="M19.5 5.3a2.8 2.8 0 0 0-2.8-2.8H13v17h3.8a2.7 2.7 0 0 1 2.7 2.7V5.3Z" />
    </svg>
  )
}

export default function ChoiceCard({ selected, title, description, value, code, onClick }) {
  return (
    <button
      type="button"
      className={`choice-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="choice-card__top">
        <span className={`choice-icon choice-icon--${code || 'generic'}`}>
          <UnitGlyph code={code} />
        </span>
        <span className="choice-title">{title}</span>
        <span className="choice-check" aria-hidden="true">{selected ? '✓' : ''}</span>
      </span>

      {description && <span className="choice-description">{description}</span>}

      {value && (
        <span className="choice-value">
          <span>برای شما</span>
          <small>{value}</small>
        </span>
      )}
    </button>
  )
}
