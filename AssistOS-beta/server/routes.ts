import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import path from "path";
import { storage } from "./storage";
import { registerRoutes as registerApiRoutes } from "../apps/api/routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve presentation folder
  app.use('/presentation', express.static(path.join(process.cwd(), 'presentation')));
  
  // Register all API routes from apps/api/routes.ts
  registerApiRoutes(app);

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  const httpServer = createServer(app);

  return httpServer;
}
