import { Router } from "express";
import { db } from "../../../../apps/api/db";
import { projects, projectsConfig, clients, users } from "../../../../shared/schema";
import { eq, and, or, like, between, sql, inArray, desc, asc } from "drizzle-orm";
import { projectCodeGenerator } from "../project-code-generator.service";
import { z } from "zod";

export const projectsRoutes = Router();

/**
 * POST /api/modules/projects/list
 * Lista projetos com filtros e ordenação server-side
 */
projectsRoutes.post("/list", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized - no tenant context" });
    }

    // Schema de validação
    const querySchema = z.object({
      search: z.string().optional(),
      status: z.array(z.string()).optional(),
      ownerId: z.string().optional(),
      clientId: z.string().optional(),
      location: z.string().optional(),
      tags: z.array(z.string()).optional(),
      dateRange: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }).optional(),
      sortField: z.enum(["projectCode", "name", "status", "createdAt", "updatedAt", "startDate", "endDate", "date", "progress", "plannedBudget", "clientId"]).default("date"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
      page: z.number().default(1),
      pageSize: z.number().min(1).max(100).default(50),
      environment: z.enum(["production", "sandbox"]).default("sandbox"),
    });

    const query = querySchema.parse(req.body);
    const offset = (query.page - 1) * query.pageSize;

    // Construir condições de filtro
    const conditions = [
      eq(projects.tenantId, tenantId),
      eq(projects.environment, query.environment),
    ];

    // Busca por nome ou código
    if (query.search) {
      conditions.push(
        or(
          like(projects.name, `%${query.search}%`),
          like(projects.projectCode, `%${query.search}%`)
        )!
      );
    }

    // Filtro por status
    if (query.status && query.status.length > 0) {
      conditions.push(inArray(projects.status, query.status));
    }

    // Filtro por responsável
    if (query.ownerId) {
      conditions.push(eq(projects.ownerId, query.ownerId));
    }

    // Filtro por cliente
    if (query.clientId) {
      conditions.push(eq(projects.clientId, query.clientId));
    }

    // Filtro por localização/zona
    if (query.location) {
      conditions.push(
        sql`LOWER(${projects.metadata}->>'location') = LOWER(${query.location})`
      );
    }

    // Filtro por tags
    if (query.tags && query.tags.length > 0) {
      // Para array overlap: tags && ARRAY['tag1', 'tag2']
      conditions.push(
        sql`${projects.tags} && ARRAY[${sql.join(query.tags.map(t => sql`${t}`), sql`, `)}]::text[]`
      );
    }

    // Filtro por range de datas
    if (query.dateRange?.from || query.dateRange?.to) {
      if (query.dateRange.from && query.dateRange.to) {
        conditions.push(
          or(
            between(projects.startDate, new Date(query.dateRange.from), new Date(query.dateRange.to)),
            between(projects.endDate, new Date(query.dateRange.from), new Date(query.dateRange.to)),
            between(projects.date, new Date(query.dateRange.from), new Date(query.dateRange.to))
          )!
        );
      } else if (query.dateRange.from) {
        conditions.push(
          or(
            sql`${projects.startDate} >= ${new Date(query.dateRange.from)}`,
            sql`${projects.date} >= ${new Date(query.dateRange.from)}`
          )!
        );
      } else if (query.dateRange.to) {
        conditions.push(
          or(
            sql`${projects.endDate} <= ${new Date(query.dateRange.to)}`,
            sql`${projects.date} <= ${new Date(query.dateRange.to)}`
          )!
        );
      }
    }

    // Ordenação com whitelist segura
    const sortableColumns: Record<string, any> = {
      projectCode: projects.projectCode,
      name: projects.name,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      startDate: projects.startDate,
      endDate: projects.endDate,
      date: projects.date,
      progress: projects.progress,
      plannedBudget: projects.plannedBudget,
      clientId: clients.name,
    };
    
    const orderByColumn = sortableColumns[query.sortField] || projects.createdAt;
    const orderDirection = query.sortOrder === "asc" ? asc : desc;

    // Executar query
    const projectsList = await db
      .select({
        id: projects.id,
        projectCode: projects.projectCode,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        progress: projects.progress,
        tags: projects.tags,
        clientId: projects.clientId,
        clientName: clients.name,
        ownerId: projects.ownerId,
        ownerName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        owner: sql<string>`${projects.metadata}->>'lead'`,
        location: sql<string>`${projects.metadata}->>'location'`,
        date: projects.date,
        startDate: projects.startDate,
        endDate: projects.endDate,
        plannedBudget: projects.plannedBudget,
        actualCost: projects.actualCost,
        numberOfPeople: projects.numberOfPeople,
        pricePerPerson: projects.pricePerPerson,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(users, eq(projects.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(orderDirection(orderByColumn))
      .limit(query.pageSize)
      .offset(offset);

    // Contar total
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(and(...conditions));

    res.json({
      projects: projectsList,
      total: Number(count),
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(Number(count) / query.pageSize),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/projects/locations
 * Lista todas as localizações/zonas disponíveis
 */
projectsRoutes.get("/locations", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized - no tenant context" });
    }

    const environment = (req.query.environment as string) || "sandbox";

    const locations = await db
      .select({
        location: sql<string>`DISTINCT ${projects.metadata}->>'location'`,
      })
      .from(projects)
      .where(
        and(
          eq(projects.tenantId, tenantId),
          eq(projects.environment, environment),
          sql`${projects.metadata}->>'location' IS NOT NULL`,
          sql`${projects.metadata}->>'location' != ''`
        )
      )
      .orderBy(sql`${projects.metadata}->>'location'`);

    // Normalizar e remover duplicados (case insensitive)
    const allLocations = locations
      .map(l => l.location)
      .filter(Boolean)
      .map(l => l.trim());
    const uniqueLocations = Array.from(new Set(allLocations))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    res.json({ locations: uniqueLocations });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/modules/projects/create
 * Cria um novo projeto com geração automática de código
 */
projectsRoutes.post("/create", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Schema de validação
    const createSchema = z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      clientId: z.string().min(1, "Cliente é obrigatório"),
      description: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      date: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      ownerId: z.string().optional(),
      plannedBudget: z.string().optional(),
      priority: z.string().optional(),
      environment: z.enum(["production", "sandbox"]).default("production"),
    });

    const data = createSchema.parse(req.body);

    // Buscar configuração do tenant
    const config = await projectCodeGenerator.getConfig(user.tenantId, data.environment);

    // Validar tipo de data
    if (config) {
      if (config.dateType === "single" && !data.date) {
        return res.status(400).json({ error: "Data é obrigatória (configurado como data única)" });
      }
      if (config.dateType === "range" && (!data.startDate || !data.endDate)) {
        return res.status(400).json({ error: "Data de início e fim são obrigatórias (configurado como range)" });
      }

      // Validar status
      if (data.status && config.statusValues.length > 0) {
        const validStatuses = config.statusValues.map(s => s.value);
        if (!validStatuses.includes(data.status)) {
          return res.status(400).json({ 
            error: `Status inválido. Valores permitidos: ${validStatuses.join(", ")}` 
          });
        }
      }

      // Validar tags
      if (data.tags && config.tags.length > 0) {
        const validTags = config.tags.map(t => t.value);
        const invalidTags = data.tags.filter(t => !validTags.includes(t));
        if (invalidTags.length > 0) {
          return res.status(400).json({ 
            error: `Tags inválidas: ${invalidTags.join(", ")}. Valores permitidos: ${validTags.join(", ")}` 
          });
        }
      }
    }

    // Gerar código automático
    const projectCode = await projectCodeGenerator.generateProjectCode(user.tenantId, data.environment);

    // Criar projeto
    const [project] = await db
      .insert(projects)
      .values({
        tenantId: user.tenantId,
        environment: data.environment,
        projectCode,
        name: data.name,
        clientId: data.clientId,
        description: data.description,
        status: data.status || (config?.statusValues[0]?.value || "planning"),
        tags: data.tags || [],
        date: data.date ? new Date(data.date) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        ownerId: data.ownerId || user.id,
        plannedBudget: data.plannedBudget,
        priority: data.priority || "Medium",
        progress: 0,
        createdBy: user.id,
      })
      .returning();

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

/**
 * GET /api/modules/projects/config
 * Retorna a configuração de projetos do tenant
 */
projectsRoutes.get("/config", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const environment = (req.query.environment as "production" | "sandbox") || "production";
    const config = await projectCodeGenerator.getConfig(user.tenantId, environment);

    if (!config) {
      // Retornar configuração padrão
      return res.json({
        dateType: "range",
        codePattern: "PROJ-{YYYY}-{###}",
        statusValues: [
          { value: "planning", label: "Planejamento", color: "blue" },
          { value: "active", label: "Ativo", color: "green" },
          { value: "completed", label: "Concluído", color: "gray" },
        ],
        tags: [],
      });
    }

    res.json(config);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/modules/projects/config
 * Atualiza a configuração de projetos do tenant
 */
projectsRoutes.put("/config", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updateSchema = z.object({
      dateType: z.enum(["single", "range"]).optional(),
      codePattern: z.string().optional(),
      statusValues: z.array(z.object({
        value: z.string(),
        label: z.string(),
        color: z.string().optional(),
      })).optional(),
      tags: z.array(z.object({
        value: z.string(),
        label: z.string(),
      })).optional(),
      environment: z.enum(["production", "sandbox"]).default("production"),
    });

    const data = updateSchema.parse(req.body);
    const environment = data.environment;

    const result = await projectCodeGenerator.updateConfig(
      user.tenantId,
      {
        dateType: data.dateType,
        codePattern: data.codePattern,
        statusValues: data.statusValues,
        tags: data.tags,
      },
      environment
    );

    const config = Array.isArray(result) ? result[0] : result;
    res.json(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

/**
 * GET /api/modules/projects/dashboard
 * Dashboard com métricas e KPIs de projetos
 */
projectsRoutes.get("/dashboard", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production';
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized - no tenant context" });
    }

    const baseConditions = and(
      eq(projects.tenantId, tenantId),
      eq(projects.environment, environment)
    );

    // Total de projetos
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(baseConditions);

    // Contagem por status
    const statusCounts = await db
      .select({
        status: projects.status,
        count: sql<number>`count(*)::int`
      })
      .from(projects)
      .where(baseConditions)
      .groupBy(projects.status);

    const byStatus: Record<string, number> = {
      planning: 0,
      proposal_sent: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0
    };

    for (const { status, count } of statusCounts) {
      if (status && byStatus.hasOwnProperty(status)) {
        byStatus[status] = count;
      }
    }

    // Projetos este mês
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [thisMonthResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(
        baseConditions,
        sql`${projects.createdAt} >= ${startOfMonth}`
      ));

    // Projetos próximos 7 dias
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [upcomingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(
        baseConditions,
        or(
          and(
            sql`${projects.date} >= ${now}`,
            sql`${projects.date} <= ${nextWeek}`
          ),
          and(
            sql`${projects.startDate} >= ${now}`,
            sql`${projects.startDate} <= ${nextWeek}`
          )
        )
      ));

    // Valor total dos projetos confirmados
    const [budgetResult] = await db
      .select({ 
        total: sql<string>`COALESCE(SUM(CAST(${projects.plannedBudget} AS numeric)), 0)::text`
      })
      .from(projects)
      .where(and(
        baseConditions,
        inArray(projects.status, ['confirmed', 'in_progress', 'completed'])
      ));

    // Projetos recentes (últimos 5)
    const recentProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        projectCode: projects.projectCode,
        status: projects.status,
        date: projects.date,
        startDate: projects.startDate,
        plannedBudget: projects.plannedBudget,
        createdAt: projects.createdAt
      })
      .from(projects)
      .where(baseConditions)
      .orderBy(desc(projects.createdAt))
      .limit(5);

    // Próximos eventos (projetos com data futura)
    const upcomingProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        projectCode: projects.projectCode,
        status: projects.status,
        date: projects.date,
        startDate: projects.startDate
      })
      .from(projects)
      .where(and(
        baseConditions,
        or(
          sql`${projects.date} >= ${now}`,
          sql`${projects.startDate} >= ${now}`
        ),
        inArray(projects.status, ['confirmed', 'planning', 'proposal_sent', 'in_progress'])
      ))
      .orderBy(asc(sql`COALESCE(${projects.date}, ${projects.startDate})`))
      .limit(5);

    const total = totalResult?.count || 0;
    const confirmed = (byStatus.confirmed || 0) + (byStatus.in_progress || 0);
    const conversionRate = total > 0 ? (confirmed / total) * 100 : 0;
    const totalBudget = parseFloat(budgetResult?.total || '0') || 0;

    res.json({
      metrics: {
        total,
        byStatus,
        thisMonth: thisMonthResult?.count || 0,
        upcoming: upcomingResult?.count || 0,
        totalBudget,
        conversionRate: Math.round(conversionRate * 10) / 10
      },
      recentProjects,
      upcomingProjects
    });
  } catch (error: any) {
    console.error("[Projects API] Error getting dashboard:", error);
    res.status(500).json({ error: "Failed to get projects dashboard" });
  }
});

/**
 * GET /api/modules/projects/:id
 * Retorna um projeto específico pelo ID
 */
projectsRoutes.get("/:id", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized - no tenant context" });
    }

    const { id } = req.params;
    const environment = (req.query.environment as "production" | "sandbox") || "sandbox";

    const projectResults = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.tenantId, tenantId),
          eq(projects.environment, environment)
        )
      )
      .limit(1);

    if (projectResults.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResults[0];

    let clientName = null;
    if (project.clientId) {
      const clientResult = await db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, project.clientId))
        .limit(1);
      clientName = clientResult[0]?.name || null;
    }

    let ownerName = null;
    if (project.ownerId) {
      const ownerResult = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, project.ownerId))
        .limit(1);
      if (ownerResult[0]) {
        ownerName = `${ownerResult[0].firstName || ''} ${ownerResult[0].lastName || ''}`.trim() || null;
      }
    }

    res.json({ 
      project: {
        ...project,
        clientName,
        ownerName,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/modules/projects/:id
 * Atualiza um projeto existente
 */
projectsRoutes.patch("/:id", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const tenantId = user.tenantId;

    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      progress: z.number().min(0).max(100).optional(),
      tags: z.any().optional(),
      clientId: z.string().nullable().optional(),
      ownerId: z.string().nullable().optional(),
      date: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      numberOfPeople: z.number().int().positive().nullable().optional(),
      pricePerPerson: z.union([z.string(), z.number()]).nullable().optional(),
      plannedBudget: z.union([z.string(), z.number()]).nullable().optional(),
      actualCost: z.union([z.string(), z.number()]).nullable().optional(),
      notes: z.string().nullable().optional(),
      environment: z.enum(["production", "sandbox"]).default("sandbox"),
    });

    const data = updateSchema.parse(req.body);
    const environment = data.environment;

    // Verificar se o projeto existe e pertence ao tenant
    const existingProject = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.tenantId, tenantId),
          eq(projects.environment, environment)
        )
      )
      .limit(1);

    if (existingProject.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Preparar dados para atualização
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.progress !== undefined) updateData.progress = data.progress;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Datas
    if (data.date !== undefined) {
      updateData.date = data.date ? new Date(data.date) : null;
    }
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    }

    // Campos numéricos
    if (data.numberOfPeople !== undefined) {
      updateData.numberOfPeople = data.numberOfPeople;
    }
    if (data.pricePerPerson !== undefined) {
      updateData.pricePerPerson = data.pricePerPerson ? String(data.pricePerPerson) : null;
    }
    if (data.plannedBudget !== undefined) {
      updateData.plannedBudget = data.plannedBudget ? String(data.plannedBudget) : null;
    }
    if (data.actualCost !== undefined) {
      updateData.actualCost = data.actualCost ? String(data.actualCost) : null;
    }

    // Executar atualização
    const updatedProject = await db
      .update(projects)
      .set(updateData)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.tenantId, tenantId),
          eq(projects.environment, environment)
        )
      )
      .returning();

    if (updatedProject.length === 0) {
      return res.status(500).json({ error: "Failed to update project" });
    }

    res.json({ project: updatedProject[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

/**
 * POST /api/modules/projects/import
 * Importa projetos em massa a partir de dados CSV/JSON
 */
projectsRoutes.post("/import", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { rows, environment = "sandbox" } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Nenhum projeto para importar" });
    }

    const results = {
      imported: 0,
      errors: [] as Array<{ row: number; error: string }>,
      clientsCreated: 0,
    };

    // Cache de clientes para evitar duplicatas
    const clientCache: Record<string, string> = {};

    // Buscar clientes existentes
    const existingClients = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, user.tenantId),
          eq(clients.environment, environment)
        )
      );

    for (const client of existingClients) {
      if (client.name) {
        clientCache[client.name.toLowerCase().trim()] = client.id;
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Pular linhas sem nome
        if (!row.name || row.name.trim() === "") {
          continue;
        }

        // Encontrar ou criar cliente
        let clientId: string;
        const clientName = (row.clientName || row.name || "Cliente Genérico").trim();
        const clientKey = clientName.toLowerCase();

        if (clientCache[clientKey]) {
          clientId = clientCache[clientKey];
        } else {
          // Criar novo cliente
          const [newClient] = await db
            .insert(clients)
            .values({
              tenantId: user.tenantId,
              environment,
              name: clientName,
              status: "Ativo",
              createdBy: user.id,
            })
            .returning();
          
          clientId = newClient.id;
          clientCache[clientKey] = clientId;
          results.clientsCreated++;
        }

        // Gerar código do projeto
        const projectCode = await projectCodeGenerator.generateProjectCode(user.tenantId, environment);

        // Parsear data do evento
        let eventDate: Date | null = null;
        if (row.date && row.year) {
          const dateStr = row.date.toString().trim();
          const year = parseInt(row.year) || 2025;
          const parsed = parseDatePortuguese(dateStr, year);
          if (parsed) {
            eventDate = parsed;
          }
        }

        // Parsear valores monetários
        const parseMoneyValue = (val: string | number | null | undefined): string | null => {
          if (val === null || val === undefined || val === "" || val === "#VALUE!") return null;
          const str = String(val).replace(/[€\s]/g, "").replace(",", ".").replace(/\./g, (m, offset, s) => {
            return offset === s.lastIndexOf(".") ? "." : "";
          });
          const num = parseFloat(str);
          return isNaN(num) ? null : num.toFixed(2);
        };

        // Criar projeto
        await db
          .insert(projects)
          .values({
            tenantId: user.tenantId,
            environment,
            projectCode,
            name: row.name.trim(),
            clientId,
            clientName,
            description: row.comments || null,
            status: mapStatus(row.status),
            tags: row.eventType ? [row.eventType] : [],
            eventDate,
            date: eventDate,
            numberOfPeople: row.numberOfPeople ? parseInt(row.numberOfPeople) : null,
            pricePerPerson: parseMoneyValue(row.pricePerPerson),
            plannedBudget: parseMoneyValue(row.totalValue),
            projectType: row.eventType || null,
            priority: "Medium",
            progress: row.status === "WIN" ? 100 : 0,
            notes: row.comments || null,
            metadata: {
              lead: row.lead || null,
              location: row.location || null,
              proposalNumber: row.proposalNumber || null,
              margin: row.margin || null,
              payments: {
                first: row.payment1 || null,
                second: row.payment2 || null,
                third: row.payment3 || null,
              },
              staff: {
                total: row.staffCount || null,
                room: row.staffRoom || null,
                kitchen: row.staffKitchen || null,
              },
              contact: row.contact || null,
              email: row.email || null,
              hours: row.hours || null,
              serviceType: row.serviceType || null,
            },
            createdBy: user.id,
          });

        results.imported++;
      } catch (error: any) {
        results.errors.push({
          row: i + 1,
          error: error.message || "Erro desconhecido",
        });
      }
    }

    res.json({
      success: true,
      message: `Importados ${results.imported} projetos, ${results.clientsCreated} clientes criados`,
      ...results,
    });
  } catch (error) {
    next(error);
  }
});

// Função auxiliar para parsear datas em português
function parseDatePortuguese(dateStr: string, year: number): Date | null {
  const months: Record<string, number> = {
    "janeiro": 0, "jan": 0,
    "fevereiro": 1, "fev": 1,
    "março": 2, "marco": 2, "mar": 2,
    "abril": 3, "abr": 3,
    "maio": 4, "mai": 4, "may": 4,
    "junho": 5, "jun": 5, "june": 5,
    "julho": 6, "jul": 6,
    "agosto": 7, "ago": 7,
    "setembro": 8, "set": 8,
    "outubro": 9, "out": 9,
    "novembro": 10, "nov": 10,
    "dezembro": 11, "dez": 11,
  };

  // Tentar extrair dia e mês
  const normalized = dateStr.toLowerCase().replace(/[\/\-\.]/g, " ").trim();
  
  // Padrão: "16 janeiro" ou "16 / janeiro"
  const match = normalized.match(/(\d{1,2})\s*(\w+)/);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase();
    const month = months[monthStr];
    
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Tentar formato "dd-mm" ou similar
  const numMatch = normalized.match(/(\d{1,2})\s*(\d{1,2})/);
  if (numMatch) {
    const day = parseInt(numMatch[1]);
    const month = parseInt(numMatch[2]) - 1;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  return null;
}

// Mapear status do CSV para status do sistema
function mapStatus(csvStatus: string | null | undefined): string {
  if (!csvStatus) return "planning";
  const status = csvStatus.toString().toUpperCase().trim();
  
  switch (status) {
    case "WIN":
      return "confirmed";
    case "PROPOSTA ENVIADA":
      return "proposal_sent";
    case "LOST":
      return "cancelled";
    default:
      return "planning";
  }
}


