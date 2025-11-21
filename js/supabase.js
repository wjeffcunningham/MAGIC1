// supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://dkzdfhzlewlvfmunywal.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremRmaHpsZXdsdmZtdW55d2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTU5OTIsImV4cCI6MjA3ODgzMTk5Mn0.zhUaZm6FkGkVEatHQ8UzU8IOj1siWJckXKZ9UgIYknI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);