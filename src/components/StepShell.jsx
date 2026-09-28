const chapters = [
  { label: 'آشنایی با همکاری', from: 1, to: 2 },
  { label: 'درباره شما', from: 3, to: 8 },
  { label: 'حوزه همکاری', from: 9, to: 10 },
  { label: 'زمان‌های در دسترس', from: 11, to: 11 },
  { label: 'مهارت‌ها و توانمندی‌ها', from: 12, to: 13 },
  { label: 'تجربه و هدف', from: 14, to: 16 },
  { label: 'حریم خصوصی و مرور', from: 17, to: 18 },
]

function chapterFor(step) {
  const index = chapters.findIndex(chapter => step >= chapter.from && step <= chapter.to)
  return {
    index: index < 0 ? 0 : index,
    chapter: chapters[index < 0 ? 0 : index],
  }
}

function BookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.3A2.8 2.8 0 0 1 7.3 2.5H11v17H7.2a2.7 2.7 0 0 0-2.7 2.7V5.3Z" />
      <path d="M19.5 5.3a2.8 2.8 0 0 0-2.8-2.8H13v17h3.8a2.7 2.7 0 0 1 2.7 2.7V5.3Z" />
    </svg>
  )
}

export default function StepShell({
  eyebrow,
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = 'ادامه',
  nextDisabled = false,
  step,
  total,
}) {
  const progress = Math.round((step / total) * 100)
  const { index: chapterIndex, chapter } = chapterFor(step)

  return (
    <main className={`experience-shell chapter-tone-${chapterIndex}`}>
      <header className="system-hero" aria-label="معرفی سامانه همکاری دانشجویی">
        <span className="system-hero__shape system-hero__shape--one" aria-hidden="true" />
        <span className="system-hero__shape system-hero__shape--two" aria-hidden="true" />
        <span className="system-hero__shape system-hero__shape--three" aria-hidden="true" />

        <div className="system-hero__inner">
          <div className="system-hero__identity">
            <span className="system-hero__mark"><BookMark /></span>
            <div className="system-hero__copy">
              <span className="system-hero__institution">دانشکده علوم انسانی شهید رجایی بابل</span>
              <strong className="system-hero__title">همکاری دانشجویی با کتابخانه</strong>
              <p>تجربه، یادگیری و مشارکت؛ همراه با فرصت‌های روابط عمومی و پژوهش</p>
            </div>
          </div>
        </div>
      </header>

      <section className="journey-stage">
        <div className="stage-progress" aria-label={`مرحله ${step} از ${total}`}>
          <div className="stage-progress__meta">
            <span className="stage-progress__chapter">
              <strong>بخش {chapterIndex + 1} از {chapters.length}</strong>
              <span>{chapter.label}</span>
            </span>
            <span className="stage-progress__count">{step} از {total}</span>
          </div>

          <div className="chapter-scale" aria-hidden="true">
            {chapters.map((item, index) => {
              const state = index < chapterIndex ? 'done' : index === chapterIndex ? 'active' : 'upcoming'
              return (
                <span key={item.label} className={`chapter-scale__item is-${state}`}>
                  {item.label}
                </span>
              )
            })}
          </div>

          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <section className="question-panel">
          <div className="question-panel__inner">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h1>{title}</h1>
            {description && <p className="description">{description}</p>}
            <div className="step-content">{children}</div>
          </div>
        </section>

        <nav className="nav-row" aria-label="حرکت بین سؤال‌ها">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
            disabled={!onBack}
          >
            <span aria-hidden="true">→</span>
            بازگشت
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onNext}
            disabled={nextDisabled}
          >
            {nextLabel}
            <span aria-hidden="true">←</span>
          </button>
        </nav>
      </section>
    </main>
  )
}
