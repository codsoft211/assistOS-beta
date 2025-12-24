import "dotenv/config";
import { db } from "./apps/api/db";
import { sql } from "drizzle-orm";

async function clearTables() {
    try {
        console.log("Clearing problematic tables...");
        await db.execute(sql`TRUNCATE TABLE audit_log CASCADE`);
        await db.execute(sql`TRUNCATE TABLE assistbuild_workflows CASCADE`);
        await db.execute(sql`TRUNCATE TABLE platform_settings CASCADE`);
        await db.execute(sql`TRUNCATE TABLE tenant_schemas CASCADE`);
        await db.execute(sql`TRUNCATE TABLE whatsapp_conversations CASCADE`);
        await db.execute(sql`TRUNCATE TABLE whatsapp_messages CASCADE`);
        await db.execute(sql`TRUNCATE TABLE workflow_templates CASCADE`);
        console.log("✅ Tables cleared successfully!");
    } catch (error: any) {
        console.error("❌ Failed to clear tables!");
        console.error("Error:", error.message);
    }
    process.exit(0);
}

clearTables();

