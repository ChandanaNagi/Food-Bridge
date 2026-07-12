import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fgcmuafwqqdeleoiitjz.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnY211YWZ3cXFkZWxlb2lpdGp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NjY1OTAsImV4cCI6MjA5OTM0MjU5MH0.MbkcxLL4KD3iZoIiTEoRtXTX8YN3YmeneLEUNOmT9is'

export const supabase = createClient(supabaseUrl, supabaseKey)
