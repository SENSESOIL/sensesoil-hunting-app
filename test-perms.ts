import { checkPermissions } from "./src/lib/permissions";
import { config } from "dotenv";

config({ path: ".env.local" });

async function test() {
  const result = await checkPermissions("sensesoil.tw@gmail.com");
  console.log("Result for sensesoil.tw@gmail.com:");
  console.dir(result, { depth: null });
}

test();
