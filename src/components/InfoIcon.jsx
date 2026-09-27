export default function InfoIcon({ type }) {
  if (type === 'duration') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.2 1.9M9.2 2.8h5.6" />
      </svg>
    )
  }

  if (type === 'steps') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7.5h14M5 12h14M5 16.5h14" />
        <circle cx="7.2" cy="7.5" r="1.1" />
        <circle cx="12" cy="12" r="1.1" />
        <circle cx="16.8" cy="16.5" r="1.1" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 4.5h8l3 3v12h-11v-15Z" />
      <path d="M14.5 4.5v3h3M9 12h6M9 15.5h4.5" />
    </svg>
  )
}
