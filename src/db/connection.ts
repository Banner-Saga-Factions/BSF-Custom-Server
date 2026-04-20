import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

// MED-5: validate DB_PORT at startup so misconfiguration fails fast
const dbPort = Number(process.env.DB_PORT);
if (process.env.DB_PORT !== undefined && isNaN(dbPort)) {
    throw new Error(`DB_PORT must be a number, got: "${process.env.DB_PORT}"`);
}

export const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: dbPort || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "bsf",
    waitForConnections: true,
    connectionLimit: 10,
});

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
}

export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(sql, params);
    return rows[0] ?? null;
}
