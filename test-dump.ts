import { readSheet } from "./src/lib/permissions";
import { config } from "dotenv";

config({ path: ".env.local" });

async function run() {
  try {
    const data = await readSheet("Permission!A:M");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(error);
  }
}
run();
