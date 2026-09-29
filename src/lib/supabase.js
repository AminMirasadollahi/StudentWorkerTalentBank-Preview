import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://pmwxryavkrjcdobwkryw.supabase.co'
const fallbackPublishableKey = 'sb_publishable_HybJBqEBQVXaDYE2KbQlLg_jGIwi7on'

export const campaignCode =
  import.meta.env.VITE_CAMPAIGN_CODE || 'library-student-worker-1405-01'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackPublishableKey

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

export async function getOpenCampaign() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('code,privacy_notice_version,form_schema_version')
    .eq('code', campaignCode)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function submitStudentWorkerApplication(payload) {
  const { error } = await supabase
    .from('applications')
    .insert(payload)

  if (error) throw error
}
