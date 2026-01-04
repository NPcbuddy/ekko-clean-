import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let poolInstance: Pool | null = null;

export function getDb() {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    if (!poolInstance) {
      // Remove sslmode from connection string and configure SSL directly
      const url = new URL(databaseUrl);
      url.searchParams.delete('sslmode');
      const cleanConnectionString = url.toString();
      
      poolInstance = new Pool({
        connectionString: cleanConnectionString,
        ssl: {
          rejectUnauthorized: false, // Allow self-signed certificates (required for Supabase)
        },
      });
    }

    dbInstance = drizzle(poolInstance, { schema });
  }

  return dbInstance;
}

