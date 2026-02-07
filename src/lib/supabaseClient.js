import { createClient } from '@supabase/supabase-js';

// Replace these with your actual Supabase details
const supabaseUrl = 'https://pjrpxzyiuflfgjakrmsd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqcnB4enlpdWZsZmdqYWtybXNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTUyMDgsImV4cCI6MjA4NTk5MTIwOH0._n9CapiyN5I4HoVaSJq_Zq9TbRbpjkRYUP54mCrjCXo';

export const supabase = createClient(supabaseUrl, supabaseKey);