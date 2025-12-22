// Admin Documentation Routes
// Serves module documentation (README.md files) to admin interface

import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { requirePlatformAdmin } from "../middleware/auth.middleware";
import { marked } from "marked";

const router = Router();

// Apply platform admin middleware to all routes
router.use(requirePlatformAdmin);

// Module metadata
const MODULES = [
  {
    id: "purchasing",
    name: "Purchasing",
    description: "Sistema de procurement com automação AI - 20 entidades, 35 ferramentas AI, 8 workflows, 113 rotas API",
    path: "packages/modules/compras/README.md",
    entities: 20,
    tools: 35,
    workflows: 8,
    routes: 113,
  },
  {
    id: "sales",
    name: "Sales",
    description: "Gestão comercial e vendas - 5 entidades, 6 ferramentas AI, 3 workflows",
    path: "packages/modules/comercial/README.md",
    entities: 5,
    tools: 6,
    workflows: 3,
    routes: 14,
  },
  {
    id: "financial",
    name: "Financial",
    description: "Gestão financeira e contabilidade - 4 entidades, 6 ferramentas AI, 3 workflows",
    path: "packages/modules/financeiro/README.md",
    entities: 4,
    tools: 6,
    workflows: 3,
    routes: 14,
  },
  {
    id: "logistics",
    name: "Logistics",
    description: "Gestão de inventário e logística expandida - 13 entidades, 13 ferramentas AI, 6 workflows",
    path: "packages/modules/logistica/README.md",
    entities: 13,
    tools: 13,
    workflows: 6,
    routes: 45,
  },
  {
    id: "projects",
    name: "Projects",
    description: "Gestão de projetos configurável - 4 entidades core, 6 ferramentas AI genéricas, templates para construção/eventos/consultoria",
    path: "packages/modules/projetos/README.md",
    entities: 4,
    tools: 6,
    workflows: 3,
    routes: 24,
  },
];

/**
 * GET /api/admin/documentation
 * Get all module documentation
 */
router.get("/", async (req, res) => {
  try {
    const modules = MODULES.map((module) => {
      const rootPath = process.cwd();
      const fullPath = join(rootPath, module.path);

      let content = "";
      
      if (existsSync(fullPath)) {
        try {
          const markdown = readFileSync(fullPath, "utf-8");
          // Convert markdown to HTML using marked (synchronously)
          content = marked.parse(markdown, { async: false }) as string;
        } catch (readError) {
          console.warn(`[Admin Documentation] Failed to read ${module.path}:`, readError);
          content = "<p>Documentação não disponível</p>";
        }
      } else {
        console.warn(`[Admin Documentation] File not found: ${fullPath}`);
        content = "<p>Documentação não disponível</p>";
      }

      return {
        id: module.id,
        name: module.name,
        description: module.description,
        path: module.path,
        content,
        entities: module.entities,
        tools: module.tools,
        workflows: module.workflows,
        routes: module.routes,
      };
    });

    res.json({ modules });
  } catch (error: any) {
    console.error("[Admin Documentation] Error fetching documentation:", error);
    res.status(500).json({
      error: "Failed to fetch documentation",
      details: error.message,
    });
  }
});

/**
 * GET /api/admin/documentation/:moduleId
 * Get specific module documentation
 */
router.get("/:moduleId", async (req, res) => {
  try {
    const { moduleId } = req.params;
    const module = MODULES.find((m) => m.id === moduleId);

    if (!module) {
      return res.status(404).json({ error: "Module not found" });
    }

    const rootPath = process.cwd();
    const fullPath = join(rootPath, module.path);

    if (!existsSync(fullPath)) {
      return res.status(404).json({
        error: "Documentation file not found",
        path: module.path,
      });
    }

    const markdown = readFileSync(fullPath, "utf-8");
    const html = marked.parse(markdown, { async: false }) as string;

    res.json({
      id: module.id,
      name: module.name,
      description: module.description,
      content: html,
      markdown,
      entities: module.entities,
      tools: module.tools,
      workflows: module.workflows,
      routes: module.routes,
    });
  } catch (error: any) {
    console.error(`[Admin Documentation] Error fetching module ${req.params.moduleId}:`, error);
    res.status(500).json({
      error: "Failed to fetch module documentation",
      details: error.message,
    });
  }
});

/**
 * GET /api/admin/documentation/:moduleId/raw
 * Get raw markdown README for a module
 */
router.get("/:moduleId/raw", async (req, res) => {
  try {
    const { moduleId } = req.params;
    const module = MODULES.find((m) => m.id === moduleId);

    if (!module) {
      return res.status(404).send("Module not found");
    }

    const rootPath = process.cwd();
    const fullPath = join(rootPath, module.path);

    if (!existsSync(fullPath)) {
      return res.status(404).send("Documentation file not found");
    }

    const markdown = readFileSync(fullPath, "utf-8");
    
    // Set headers to display as plain text
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${module.id}-README.md"`);
    res.send(markdown);
  } catch (error: any) {
    console.error(`[Admin Documentation] Error fetching raw markdown for ${req.params.moduleId}:`, error);
    res.status(500).send("Failed to fetch raw markdown");
  }
});

export default router;
