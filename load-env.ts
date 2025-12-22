/**
 * Global environment variable loader
 * 
 * This file MUST be imported first in any entry point to ensure
 * .env variables are loaded before any other modules are evaluated.
 * 
 * Usage: import './load-env' (as the very first import)
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: resolve(__dirname, '.env') });
