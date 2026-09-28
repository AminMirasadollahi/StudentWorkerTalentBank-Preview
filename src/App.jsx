import { useEffect, useMemo, useState } from 'react'
import StepShell from './components/StepShell'
import ChoiceCard from './components/ChoiceCard'
import InfoIcon from './components/InfoIcon'
import { availabilitySlots, entryYears, majors, skills, units, weekDays } from './data'

const STORAGE_KEY = 'student-worker-form-v2'
const TOTAL_STEPS = 18

const initialForm = {
  fullName: '',
  studentNumber: '',
  phone: '',
  socialPhone: '',
  major: '',
  majorOther: '',
  entryYear: '',
  currentSemester: '',
  primaryUnit: '',
  secondaryUnits: [],
  availability: [],
  selectedSkills: [],
  topSkills: [],
  otherSkill: '',
  hasExperience: null,
  experienceSummary: '',
  benefitExpectation: '',
  portfolioUrl: '',
  consentCurrent: false,
  consentTalentBank: false,
}

function readDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...initialForm, ...saved }
  } catch {
    return initialForm
  }
}

export default function App() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(readDraft)
  const [showAllSkills, setShowAllSkills] = useState(false)
  const [prototypeNotice, setPrototypeNotice] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.querySelector('.question-panel')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [step])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const toggleArray = (key, value, max = Infinity) => {
    setForm(prev => {
      const values = prev[key]
      if (values.includes(value)) {
        return { ...prev, [key]: values.filter(item => item !== value) }
      }
      if (values.length >= max) return prev
      return { ...prev, [key]: [...values, value] }
    })
  }

  const toggleSkill = code => {
    setForm(prev => {
      const selected = prev.selectedSkills.includes(code)
      return {
        ...prev,
        selectedSkills: selected
          ? prev.selectedSkills.filter(item => item !== code)
          : [...prev.selectedSkills, code],
        topSkills: selected
          ? prev.topSkills.filter(item => item !== code)
          : prev.topSkills,
      }
    })
  }

  const primaryUnit = units.find(unit => unit.code === form.primaryUnit)

  const visibleSkills = useMemo(() => {
    if (showAllSkills || !form.primaryUnit) return skills
    return skills.filter(skill => skill.units.includes(form.primaryUnit))
  }, [showAllSkills, form.primaryUnit])

  const skillGroups = useMemo(() => {
    const map = new Map()
    visibleSkills.forEach(skill => {
      if (!map.has(skill.category)) map.set(skill.category, [])
      map.get(skill.category).push(skill)
    })
    return [...map.entries()]
  }, [visibleSkills])

  const skillLabel = code => skills.find(skill => skill.code === code)?.label || code
  const unitLabel = code => units.find(unit => unit.code === code)?.label || code

  const back = () => setStep(current => Math.max(0, current - 1))
  const next = () => setStep(current => Math.min(TOTAL_STEPS - 1, current + 1))

  const resetDraft = () => {
    setForm(initialForm)
    localStorage.removeItem(STORAGE_KEY)
    setStep(0)
    setShowAllSkills(false)
    setPrototypeNotice(false)
  }

  const pages = [
    <StepShell
      key="welcome"
      step={1}
      total={TOTAL_STEPS}
      eyebrow="فرصت همکاری دانشجویی"
      title="آشنایی کوتاه با این فرصت"
      description="پیش از شروع، ویدیوی معرفی کتابخانه و چند نکته کوتاه را ببینید."
      onNext={next}
      nextLabel="شروع فرم"
    >
      <div className="welcome-panel">
        <div className="video-placeholder" role="img" aria-label="جایگاه ویدیوی معرفی کتابخانه">
          <span className="video-placeholder__orb" aria-hidden="true" />
          <span className="play-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z" /></svg>
          </span>
          <strong>ویدیوی کوتاه معرفی کتابخانه</strong>
          <small>در نسخه نهایی، نمای سه‌بعدی کتابخانه از آپارات در همین بخش پخش می‌شود.</small>
        </div>

        <div className="info-grid">
          <div>
            <span className="info-grid__icon"><InfoIcon type="duration" /></span>
            <span><strong>۴ تا ۶ دقیقه</strong><small>زمان تقریبی تکمیل</small></span>
          </div>
          <div>
            <span className="info-grid__icon"><InfoIcon type="steps" /></span>
            <span><strong>یک سؤال در هر مرحله</strong><small>ساده و بدون فرم طولانی</small></span>
          </div>
          <div>
            <span className="info-grid__icon"><InfoIcon type="draft" /></span>
            <span><strong>ذخیره موقت</strong><small>فقط روی همین دستگاه</small></span>
          </div>
        </div>

        <div className="prototype-badge">
          <strong>نسخه آزمایشی</strong>
          <span>فعلاً هیچ اطلاعاتی به سرور ارسال نمی‌شود.</span>
        </div>
      </div>
    </StepShell>,

    <StepShell
      key="intro"
      step={2}
      total={TOTAL_STEPS}
      eyebrow="قبل از شروع"
      title="این همکاری قرار است برای شما هم ارزش داشته باشد"
      description="پیشنهاد می‌کنیم قبل از ثبت درخواست، برای خودتان روشن کنید دوست دارید این تجربه چه چیزی به شما اضافه کند."
      onBack={back}
      onNext={next}
    >
      <div className="note-stack">
        <article className="soft-note soft-note--value">
          <span className="soft-note__number">۱</span>
          <span>
            <strong>ارزشی که برای خودتان می‌سازید</strong>
            <p>تجربه واقعی، یادگیری مهارت، ساخت نمونه‌کار، آشنایی با فضای کاری دانشگاه، کار تیمی یا شناخت بهتر علایق و توانایی‌های خودتان می‌تواند بخشی از دستاورد این مسیر باشد.</p>
          </span>
        </article>
        <article className="soft-note soft-note--commitment">
          <span className="soft-note__number">۲</span>
          <span>
            <strong>همکاری منعطف، اما قابل اتکا</strong>
            <p>کلاس، امتحان و شرایط پیش‌بینی‌نشده طبیعی است و درباره زمان‌بندی با هم هماهنگ می‌کنیم. در محدوده‌ای که با هم توافق می‌کنیم، هماهنگی و مسئولیت‌پذیری متقابل برایمان مهم است.</p>
          </span>
        </article>
        <article className="soft-note soft-note--benefits">
          <span className="soft-note__number">۳</span>
          <span>
            <strong>مزایای رسمی و مالی</strong>
            <p>در چارچوب ضوابط دانشگاه، مواردی مانند گواهی یا ثبت همکاری و حق‌الزحمه دانشجوکاری می‌تواند پیگیری شود. مبلغ مالی محدود است و بهتر است تنها انگیزه این همکاری نباشد.</p>
          </span>
        </article>
      </div>
    </StepShell>,

    <StepShell
      key="name"
      step={3}
      total={TOTAL_STEPS}
      title="نام و نام خانوادگی شما؟"
      description="همان نامی که در اطلاعات دانشگاهی شما ثبت شده است."
      onBack={back}
      onNext={next}
      nextDisabled={form.fullName.trim().length < 3}
    >
      <label className="input-shell">
        <span className="input-shell__label">نام و نام خانوادگی</span>
        <input
          autoFocus
          className="text-input"
          value={form.fullName}
          onChange={event => set('fullName', event.target.value)}
          placeholder="مثلاً محمد امین..."
          autoComplete="name"
        />
      </label>
    </StepShell>,

    <StepShell
      key="student-number"
      step={4}
      total={TOTAL_STEPS}
      title="شماره دانشجویی"
      description="برای تشخیص درخواست‌های تکراری و تطبیق اولیه اطلاعات."
      onBack={back}
      onNext={next}
      nextDisabled={!/^\d{5,20}$/.test(form.studentNumber)}
    >
      <label className="input-shell">
        <span className="input-shell__label">شماره دانشجویی</span>
        <input
          autoFocus
          inputMode="numeric"
          dir="ltr"
          className="text-input ltr"
          value={form.studentNumber}
          onChange={event => set('studentNumber', event.target.value.replace(/\D/g, ''))}
          placeholder="401234567"
        />
        <small>با اعداد انگلیسی وارد کنید.</small>
      </label>
    </StepShell>,

    <StepShell
      key="phone"
      step={5}
      total={TOTAL_STEPS}
      title="راه ارتباطی شما"
      description="یک شماره برای تماس لازم است. اگر شماره‌ای که در ایتا یا شبکه‌های اجتماعی استفاده می‌کنید متفاوت است، آن را هم وارد کنید."
      onBack={back}
      onNext={next}
      nextDisabled={
        !/^09\d{9}$/.test(form.phone)
        || (form.socialPhone && !/^09\d{9}$/.test(form.socialPhone))
      }
    >
      <div className="contact-fields">
        <label className="input-shell">
          <span className="input-shell__label">شماره همراه برای تماس <em>لازم</em></span>
          <input
            autoFocus
            inputMode="tel"
            dir="ltr"
            className="text-input ltr"
            value={form.phone}
            onChange={event => set('phone', event.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="09123456789"
            autoComplete="tel"
          />
          <small>اگر برای هماهنگی لازم باشد از این شماره با شما تماس می‌گیریم.</small>
        </label>

        <label className="input-shell input-shell--social">
          <span className="input-shell__label">شماره ایتا / شبکه اجتماعی <em>اختیاری</em></span>
          <input
            inputMode="tel"
            dir="ltr"
            className="text-input ltr"
            value={form.socialPhone}
            onChange={event => set('socialPhone', event.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="اگر با شماره تماس فرق دارد"
          />
          <small>اگر خالی بگذارید، همان شماره تماس را برای ارتباط در گروه یا پیام‌رسان در نظر می‌گیریم.</small>
        </label>
      </div>
    </StepShell>,

    <StepShell
      key="major"
      step={6}
      total={TOTAL_STEPS}
      title="رشته تحصیلی"
      description="فهرست رشته‌ها پیش از انتشار نهایی با رشته‌های فعال دانشکده تطبیق داده می‌شود."
      onBack={back}
      onNext={next}
      nextDisabled={!form.major || (form.major === 'سایر' && form.majorOther.trim().length < 2)}
    >
      <label className="input-shell">
        <span className="input-shell__label">رشته</span>
        <select
          className="select-input"
          value={form.major}
          onChange={event => setForm(prev => ({
            ...prev,
            major: event.target.value,
            majorOther: event.target.value === 'سایر' ? prev.majorOther : '',
          }))}
        >
          <option value="">انتخاب کنید</option>
          {majors.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      {form.major === 'سایر' && (
        <label className="input-shell input-shell--conditional">
          <span className="input-shell__label">نام رشته</span>
          <input
            autoFocus
            className="text-input"
            value={form.majorOther}
            onChange={event => set('majorOther', event.target.value.slice(0, 120))}
            placeholder="نام رشته را بنویسید"
          />
        </label>
      )}
    </StepShell>,

    <StepShell
      key="entry-year"
      step={7}
      total={TOTAL_STEPS}
      title="سال ورود"
      description="سال ورودتان به دانشگاه را انتخاب کنید."
      onBack={back}
      onNext={next}
      nextDisabled={!form.entryYear}
    >
      <div className="chip-grid chip-grid--years">
        {entryYears.map(year => (
          <button
            key={year}
            type="button"
            className={`chip ${Number(form.entryYear) === year ? 'selected' : ''}`}
            onClick={() => set('entryYear', year)}
          >
            {year}
          </button>
        ))}
      </div>
    </StepShell>,

    <StepShell
      key="semester"
      step={8}
      total={TOTAL_STEPS}
      title="الان ترم چندم هستید؟"
      onBack={back}
      onNext={next}
      nextDisabled={!form.currentSemester}
    >
      <div className="chip-grid chip-grid--semesters">
        {Array.from({ length: 10 }, (_, index) => index + 1).map(semester => (
          <button
            key={semester}
            type="button"
            className={`chip ${Number(form.currentSemester) === semester ? 'selected' : ''}`}
            onClick={() => set('currentSemester', semester)}
          >
            ترم {semester}
          </button>
        ))}
      </div>
    </StepShell>,

    <StepShell
      key="primary-unit"
      step={9}
      total={TOTAL_STEPS}
      eyebrow="اولویت همکاری"
      title="اولویت اصلی شما برای همکاری کدام حوزه است؟"
      description="در این مرحله فقط یک گزینه را به‌عنوان اولویت اصلی انتخاب کنید. در مرحله بعد می‌توانید دو حوزه دیگر را هم به‌عنوان اولویت‌های بعدی مشخص کنید."
      onBack={back}
      onNext={next}
      nextDisabled={!form.primaryUnit}
    >
      <div className="choice-list">
        {units.map(unit => (
          <ChoiceCard
            key={unit.code}
            code={unit.code}
            selected={form.primaryUnit === unit.code}
            title={unit.label}
            description={unit.description}
            value={unit.value}
            onClick={() => {
              setForm(prev => ({
                ...prev,
                primaryUnit: unit.code,
                secondaryUnits: prev.secondaryUnits.filter(code => code !== unit.code),
              }))
              setShowAllSkills(false)
            }}
          />
        ))}
      </div>
    </StepShell>,

    <StepShell
      key="secondary-units"
      step={10}
      total={TOTAL_STEPS}
      title="در صورت تمایل، اولویت‌های بعدی‌تان را هم مشخص کنید"
      description={`اولویت اصلی شما «${primaryUnit?.label || ''}» است. می‌توانید یکی، هر دو، یا هیچ‌کدام از حوزه‌های باقی‌مانده را انتخاب کنید.`}
      onBack={back}
      onNext={next}
    >
      <div className="choice-list choice-list--secondary">
        {units.filter(unit => unit.code !== form.primaryUnit).map(unit => (
          <ChoiceCard
            key={unit.code}
            code={unit.code}
            selected={form.secondaryUnits.includes(unit.code)}
            title={unit.label}
            description={unit.description}
            onClick={() => toggleArray('secondaryUnits', unit.code, 2)}
          />
        ))}
      </div>
      <p className="helper-text">انتخاب این بخش به معنی تعهد قطعی نیست؛ فقط کمک می‌کند علایق شما را بهتر بشناسیم.</p>
    </StepShell>,

    <StepShell
      key="availability"
      step={11}
      total={TOTAL_STEPS}
      title="معمولاً چه زمان‌هایی امکان همکاری دارید؟"
      description="یک تصویر کلی کافی است؛ برنامه دقیق بعداً متناسب با کلاس‌ها، امتحانات و شرایط شما با توافق دوطرفه تنظیم می‌شود."
      onBack={back}
      onNext={next}
      nextDisabled={form.availability.length === 0}
    >
      <div className="availability-table">
        <div className="availability-head">
          <span>روز</span>
          {availabilitySlots.map(slot => (
            <span key={slot.key}>{slot.label}<small>{slot.hours}</small></span>
          ))}
        </div>
        {weekDays.map(day => (
          <div className="availability-row" key={day}>
            <strong className="availability-day">{day}</strong>
            {availabilitySlots.map(slot => {
              const key = `${day}|${slot.key}`
              const selected = form.availability.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  className={`slot ${selected ? 'selected' : ''}`}
                  aria-label={`${day}، ${slot.label} ${slot.hours}`}
                  aria-pressed={selected}
                  data-slot-label={slot.label}
                  data-slot-hours={slot.hours}
                  onClick={() => toggleArray('availability', key)}
                >
                  <span className="slot-box" aria-hidden="true">{selected ? '✓' : ''}</span>
                  <span className="slot-mobile-copy">
                    <strong>{slot.label}</strong>
                    <small>{slot.hours}</small>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="helper-text helper-text--accent">لازم نیست همه زمان‌های انتخاب‌شده در نهایت به ساعت کاری تبدیل شوند؛ این فقط برای شناخت اولیه ظرفیت زمانی شماست.</p>
    </StepShell>,

    <StepShell
      key="skills"
      step={12}
      total={TOTAL_STEPS}
      eyebrow="بانک مهارت‌ها"
      title="چه مهارت‌هایی دارید؟"
      description={`فعلاً مهارت‌های نزدیک‌تر به «${primaryUnit?.label || 'حوزه انتخابی'}» را می‌بینید. اگر مهارت دیگری دارید، با یک کلیک همه دسته‌ها را باز کنید.`}
      onBack={back}
      onNext={next}
      nextDisabled={form.selectedSkills.length === 0}
    >
      <div className="skills-toolbar">
        <span className="selection-counter"><strong>{form.selectedSkills.length}</strong> مهارت انتخاب شده</span>
        <button type="button" className="link-button link-button--boxed" onClick={() => setShowAllSkills(value => !value)}>
          {showAllSkills ? 'بازگشت به مهارت‌های مرتبط' : 'نمایش همه مهارت‌ها'}
        </button>
      </div>

      <div className="skill-groups">
        {skillGroups.map(([category, items]) => (
          <section className="skill-group" key={category}>
            <h3>{category}</h3>
            <div className="chip-grid">
              {items.map(skill => (
                <button
                  key={skill.code}
                  type="button"
                  className={`chip skill ${form.selectedSkills.includes(skill.code) ? 'selected' : ''}`}
                  onClick={() => toggleSkill(skill.code)}
                >
                  {form.selectedSkills.includes(skill.code) && <span className="chip-check" aria-hidden="true">✓</span>}
                  {skill.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <label className="input-shell input-shell--other" htmlFor="other-skill">
        <span className="input-shell__label">مهارت دیگری دارید که در فهرست نیست؟</span>
        <input
          id="other-skill"
          className="text-input"
          value={form.otherSkill}
          onChange={event => set('otherSkill', event.target.value.slice(0, 300))}
          placeholder="اختیاری — نام مهارت یا ابزار را بنویسید"
        />
      </label>
    </StepShell>,

    <StepShell
      key="top-skills"
      step={13}
      total={TOTAL_STEPS}
      title="سه نقطه قوت اصلی شما کدام‌اند؟"
      description="از میان مهارت‌هایی که انتخاب کردید، حداکثر سه موردی را مشخص کنید که بیشتر روی آن‌ها حساب می‌کنید."
      onBack={back}
      onNext={next}
      nextDisabled={form.topSkills.length === 0}
    >
      <div className="chip-grid">
        {form.selectedSkills.map(code => (
          <button
            key={code}
            type="button"
            className={`chip skill chip--strong ${form.topSkills.includes(code) ? 'selected' : ''}`}
            onClick={() => toggleArray('topSkills', code, 3)}
          >
            {form.topSkills.includes(code) && <span className="chip-check" aria-hidden="true">✓</span>}
            {skillLabel(code)}
          </button>
        ))}
      </div>
      <div className="selection-footnote">
        <span className={form.topSkills.length === 3 ? 'is-complete' : ''}>{form.topSkills.length} از ۳</span>
        <p>لازم نیست حتماً سه مورد انتخاب کنید؛ یک یا دو نقطه قوت اصلی هم کافی است.</p>
      </div>
    </StepShell>,

    <StepShell
      key="experience"
      step={14}
      total={TOTAL_STEPS}
      title="قبلاً تجربه مرتبطی داشته‌اید؟"
      description="تجربه رسمی لازم نیست؛ فعالیت دانشجویی، پروژه شخصی، کار داوطلبانه یا تمرین جدی هم می‌تواند مرتبط باشد."
      onBack={back}
      onNext={next}
      nextDisabled={form.hasExperience === null || (form.hasExperience && form.experienceSummary.trim().length < 3)}
    >
      <div className="two-choice">
        <button
          type="button"
          className={`chip chip--binary ${form.hasExperience === true ? 'selected' : ''}`}
          onClick={() => set('hasExperience', true)}
        >
          بله، تجربه‌ای داشته‌ام
        </button>
        <button
          type="button"
          className={`chip chip--binary ${form.hasExperience === false ? 'selected' : ''}`}
          onClick={() => setForm(prev => ({ ...prev, hasExperience: false, experienceSummary: '' }))}
        >
          فعلاً نه
        </button>
      </div>
      {form.hasExperience && (
        <label className="input-shell input-shell--textarea">
          <span className="input-shell__label">خیلی کوتاه درباره تجربه‌تان بنویسید</span>
          <textarea
            className="textarea"
            value={form.experienceSummary}
            onChange={event => set('experienceSummary', event.target.value.slice(0, 800))}
            placeholder="مثلاً طراحی پوستر برای انجمن، کمک در اجرای یک رویداد، کار با Excel در یک پروژه و..."
          />
          <small>{form.experienceSummary.length} / ۸۰۰</small>
        </label>
      )}
    </StepShell>,

    <StepShell
      key="benefit"
      step={15}
      total={TOTAL_STEPS}
      eyebrow="این سؤال برای ما مهم است"
      title="دوست دارید از این همکاری چه چیزی به دست بیاورید؟"
      description="چه چیزی باعث می‌شود در پایان همکاری احساس کنید زمانی که گذاشته‌اید برای خودتان هم ارزشمند بوده است؟"
      onBack={back}
      onNext={next}
      nextDisabled={form.benefitExpectation.trim().length < 3}
    >
      <div className="example-tags" aria-label="چند مثال">
        <span>کسب تجربه</span>
        <span>یادگیری مهارت</span>
        <span>ساخت نمونه‌کار</span>
        <span>آشنایی با فضای کاری</span>
        <span>کار تیمی</span>
        <span>شناخت بهتر علایق</span>
      </div>
      <label className="input-shell input-shell--textarea">
        <span className="input-shell__label">پاسخ خودتان</span>
        <textarea
          autoFocus
          className="textarea large"
          value={form.benefitExpectation}
          onChange={event => set('benefitExpectation', event.target.value.slice(0, 500))}
          placeholder="لازم نیست رسمی بنویسید؛ چیزی را بنویسید که واقعاً برای خودتان مهم است."
        />
        <small>{form.benefitExpectation.length} / ۵۰۰</small>
      </label>
    </StepShell>,

    <StepShell
      key="portfolio"
      step={16}
      total={TOTAL_STEPS}
      title="نمونه‌کار مرتبطی دارید؟"
      description="اختیاری است. اگر جایی نمونه فعالیت شما دیده می‌شود، لینک آن را بفرستید."
      onBack={back}
      onNext={next}
    >
      <label className="input-shell">
        <span className="input-shell__label">لینک نمونه‌کار</span>
        <input
          dir="ltr"
          className="text-input ltr"
          value={form.portfolioUrl}
          onChange={event => set('portfolioUrl', event.target.value)}
          placeholder="https://..."
        />
        <small>Google Drive، GitHub، کانال، صفحه شخصی یا هر لینک قابل مشاهده دیگری.</small>
      </label>
    </StepShell>,

    <StepShell
      key="consent"
      step={17}
      total={TOTAL_STEPS}
      eyebrow="حریم خصوصی"
      title="انتخاب شما درباره استفاده از اطلاعات"
      description="فقط اطلاعات لازم برای بررسی همکاری را می‌گیریم. نگهداری اطلاعات برای فرصت‌های آینده کاملاً اختیاری است."
      onBack={back}
      onNext={next}
      nextDisabled={!form.consentCurrent}
    >
      <label className={`consent-card ${form.consentCurrent ? 'selected' : ''}`}>
        <input
          type="checkbox"
          checked={form.consentCurrent}
          onChange={event => set('consentCurrent', event.target.checked)}
        />
        <span>
          <strong>بررسی همین درخواست <em>لازم</em></strong>
          <small>با استفاده از اطلاعات ثبت‌شده برای بررسی درخواست همکاری دانشجویی حاضر موافقم.</small>
        </span>
      </label>
      <label className={`consent-card ${form.consentTalentBank ? 'selected' : ''}`}>
        <input
          type="checkbox"
          checked={form.consentTalentBank}
          onChange={event => set('consentTalentBank', event.target.checked)}
        />
        <span>
          <strong>بانک استعدادهای دانشجویی <em>اختیاری</em></strong>
          <small>مایلم اطلاعات مهارتی و راه ارتباطی من برای بررسی فرصت‌های همکاری دانشجویی آینده نیز نگهداری شود.</small>
        </span>
      </label>
      <div className="privacy-note">
        اطلاعاتی مانند کد ملی، آدرس منزل یا اطلاعات مالی در این فرم دریافت نمی‌شود.
      </div>
    </StepShell>,

    <StepShell
      key="review"
      step={18}
      total={TOTAL_STEPS}
      eyebrow="مرور نهایی"
      title="یک نگاه آخر؛ بعد ثبت"
      description="این نسخه هنوز آزمایشی است و دکمه ثبت نهایی عمداً به دیتابیس متصل نشده است."
      onBack={back}
      onNext={() => setPrototypeNotice(true)}
      nextLabel="ثبت نهایی — آزمایشی"
    >
      <div className="review-grid">
        <div><span>نام</span><strong>{form.fullName}</strong></div>
        <div><span>رشته / ورودی</span><strong>{form.major === 'سایر' ? form.majorOther : form.major} / {form.entryYear}</strong></div>
        <div><span>شماره تماس</span><strong dir="ltr">{form.phone}</strong></div>
        <div><span>ایتا / شبکه اجتماعی</span><strong dir="ltr">{form.socialPhone || form.phone}</strong></div>
        <div><span>اولویت همکاری</span><strong>{unitLabel(form.primaryUnit)}</strong></div>
        <div><span>سایر حوزه‌ها</span><strong>{form.secondaryUnits.length ? form.secondaryUnits.map(unitLabel).join('، ') : '—'}</strong></div>
        <div><span>مهارت‌ها</span><strong>{form.selectedSkills.length} مورد</strong></div>
        <div className="review-grid__wide"><span>نقاط قوت اصلی</span><strong>{form.topSkills.map(skillLabel).join('، ')}</strong></div>
      </div>

      <div className="review-benefit">
        <span>چیزی که می‌خواهید از این تجربه به دست بیاورید</span>
        <p>{form.benefitExpectation}</p>
      </div>

      {prototypeNotice && (
        <div className="prototype-alert">
          <strong>ثبت آزمایشی انجام شد.</strong>
          <span>اتصال Production هنوز فعال نشده است؛ بنابراین هیچ اطلاعاتی از مرورگر شما خارج نشد.</span>
        </div>
      )}

      <button type="button" className="link-button danger-link" onClick={resetDraft}>
        پاک کردن پاسخ‌های آزمایشی و شروع دوباره
      </button>
    </StepShell>,
  ]

  return <div className="app" dir="rtl">{pages[step]}</div>
}
