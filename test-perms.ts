import { checkPermissions } from './src/lib/permissions';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const p = await checkPermissions('sensesoil.tw@gmail.com');
  console.log(p);
}
run();
