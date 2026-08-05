const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.from('hunting_tasks').select('*');
  console.log('Tasks:', data?.length);
  
  if (data && data.length > 0) {
    // Delete all tasks
    const { error: delErr } = await supabase.from('hunting_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) {
        console.error("Delete Error", delErr);
    } else {
        console.log('Deleted all tasks to trigger auto-populate');
    }
  }
}

run();
