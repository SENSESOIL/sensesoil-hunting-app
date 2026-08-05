const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('hunting_tasks')
    .select('id, text, status, order_index, created_at')
    .eq('hunter_name', '拾壤')
    .order('order_index', { ascending: true });

  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

run();
