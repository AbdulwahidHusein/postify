// Same precedence as Next.js: .env.local wins over .env. Missing files are fine.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
