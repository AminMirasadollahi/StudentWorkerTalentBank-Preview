// SWTB17 public intake regression tests: no network, Supabase or real student data.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { digitsOnly, isValidEntryYearOther, toAsciiDigits } from '../src/lib/digits.mjs'

const intake = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('Persian and Arabic-Indic digit scripts convert to ASCII without losing leading zeros', () => {
  assert.equal(toAsciiDigits('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789')
  assert.equal(toAsciiDigits('٠٩١٢٣٤٥٦٧٨٩'), '09123456789')
  assert.equal(toAsciiDigits('سال ۱۴۰۵ / ١٤٠٥'), 'سال 1405 / 1405')
  assert.equal(toAsciiDigits(null), '')
  assert.equal(toAsciiDigits(undefined), '')
})

test('digitsOnly handles paste, mixed scripts, punctuation, limits and deletions', () => {
  assert.equal(digitsOnly('۰۹۱-٢٣٤ ۵۶۷۸۹'), '09123456789')
  assert.equal(digitsOnly(' ٠٩۱۲۳۴۵۶۷۸۹more', 11), '09123456789')
  assert.equal(digitsOnly('۰۹۱۲۳۴۵۶۷۸۹۰', 11), '09123456789')
  assert.equal(digitsOnly('۱۴۰۵', 4), '1405')
  assert.equal(digitsOnly(''), '')
  assert.equal(digitsOnly('ABC?!'), '')
  assert.equal(digitsOnly(1405), '1405')
})

test('other year is validated during step 7, before final form submission', () => {
  for (const valid of ['۱۳۹۷', '١٣٩٧', '1397', '13۹۷', '۱۳۰۰', '۱۵۰۰', ' ۱۴۰۵ ']) {
    assert.equal(isValidEntryYearOther(valid), true, valid)
  }
  for (const invalid of ['', '۰', '۱۴', '۱۴۰', '۱۲۹۹', '۱۵۰۱', 'ABCD', '۱۴۰۵x', null]) {
    assert.equal(isValidEntryYearOther(invalid), false, String(invalid))
  }
  assert.match(intake, /!isValidEntryYearOther\(form\.entryYearOther\)/)
  assert.match(intake, /Number\(toAsciiDigits\(rawEntryYear\)\)/)
})

test('public form covers all three numeric identifiers and older local drafts', () => {
  assert.match(intake, /studentNumber: digitsOnly\(merged\.studentNumber\)/)
  assert.match(intake, /phone: digitsOnly\(merged\.phone, 11\)/)
  assert.match(intake, /socialPhone: digitsOnly\(merged\.socialPhone, 11\)/)
  assert.match(intake, /entryYearOther: digitsOnly\(merged\.entryYearOther, 4\)/)
  assert.match(intake, /set\('studentNumber', digitsOnly\(event\.target\.value\)\)/)
  assert.match(intake, /set\('phone', digitsOnly\(event\.target\.value, 11\)\)/)
  assert.match(intake, /set\('socialPhone', digitsOnly\(event\.target\.value, 11\)\)/)
  assert.match(intake, /set\('entryYearOther', digitsOnly\(event\.target\.value, 4\)\)/)
  assert.match(intake, /const studentNumber = digitsOnly\(form\.studentNumber\)/)
  assert.match(intake, /submitStudentWorkerApplication\(\{/)
  for (const field of ['student_number', 'phone', 'social_phone', 'entry_year', 'client_submission_id', 'campaign_code']) {
    assert.match(intake, new RegExp(field + ':'))
  }
})

test('draft deletion requires explicit confirmation; success-screen new-form flow stays distinct', () => {
  assert.match(intake, /const confirmDraftReset = \(\) => \{\s*if \(window\.confirm\(/)
  assert.match(intake, /window\.confirm\([^)]*\)\) \{\s*resetDraft\(\)/)
  assert.match(intake, /className="link-button danger-link" onClick=\{confirmDraftReset\}/)
  assert.match(intake, /submissionStatus === 'success' && \([\s\S]*?onClick=\{resetDraft\}/)
  assert.equal((intake.match(/onClick=\{resetDraft\}/g) || []).length, 1)
  assert.equal((intake.match(/onClick=\{confirmDraftReset\}/g) || []).length, 1)
})
