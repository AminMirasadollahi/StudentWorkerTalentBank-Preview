import { useEffect, useRef } from 'react'
import { trackStudentWorkerEvent } from './lib/analytics'

export default function AnalyticsBridge({ children }) {
  const successTracked = useRef(false)

  useEffect(() => {
    void trackStudentWorkerEvent('page_view')

    const handleClick = event => {
      const trigger = event.target instanceof Element
        ? event.target.closest('[data-analytics-action="form-start"]')
        : null

      if (trigger && !trigger.disabled) {
        void trackStudentWorkerEvent('form_started')
      }
    }

    const detectSuccess = () => {
      if (successTracked.current) return
      if (document.querySelector('.submission-modal-icon.is-success')) {
        successTracked.current = true
        void trackStudentWorkerEvent('submission_success')
      }
    }

    document.addEventListener('click', handleClick)

    const observer = new MutationObserver(detectSuccess)
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    detectSuccess()

    return () => {
      document.removeEventListener('click', handleClick)
      observer.disconnect()
    }
  }, [])

  return children
}
