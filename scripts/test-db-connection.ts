import "../load-env";
import { db } from "../apps/api/db";

async function testConnection() {
  try {
    console.log("Testing database connection...");
    console.log("DATABASE_URL:", process.env.DATABASE_URL?.substring(0, 50) + "...");
    
    const result = await db.execute("SELECT 1 as test");
    console.log("✅ Database connection successful!");
    console.log("Result:", result);
  } catch (error: any) {
    console.error("❌ Database connection failed!");
    console.error("Error:", error.message);
    console.error("Code:", error.code);
  }
  process.exit(0);
}

testConnection();
