import { createClient } from '@supabase/supabase-js';

// Pakai 'as string' biar TypeScript yakin ini pasti bentuknya teks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);