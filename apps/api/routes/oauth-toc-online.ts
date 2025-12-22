import { Router } from "express";
import { db } from "../db";
import { tenantConnectorConfigs } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { TOCOnlineConnector } from "../../../packages/connectors/toc-online";
import crypto from "crypto";

const router = Router();
export const callbackRouter = Router();

const pendingOAuthStates = new Map<string, {
  tenantId: string;
  userId: string;
  configId: number;
  redirectUri: string;
  createdAt: number;
}>();

setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  pendingOAuthStates.forEach((data, state) => {
    if (now - data.createdAt > 10 * 60 * 1000) {
      keysToDelete.push(state);
    }
  });
  keysToDelete.forEach(key => pendingOAuthStates.delete(key));
}, 60000);

router.get("/authorize", async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId;

    if (!user || !tenantId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const configId = parseInt(req.query.configId as string);
    if (isNaN(configId)) {
      return res.status(400).json({ error: "configId inválido" });
    }

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, configId),
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.connectorType, 'toc-online')
      ))
      .limit(1);

    if (!config) {
      return res.status(404).json({ error: "Configuração do TOC Online não encontrada" });
    }

    const credentials = config.companyCredentials as {
      clientId?: string;
      clientSecret?: string;
      oauthUrl?: string;
      apiUrl?: string;
    };

    if (!credentials.clientId || !credentials.clientSecret) {
      return res.status(400).json({ 
        error: "Credenciais OAuth incompletas",
        message: "Configure o Client ID e Client Secret primeiro" 
      });
    }

    const state = crypto.randomBytes(32).toString('hex');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/oauth/toc-online/callback/`;

    pendingOAuthStates.set(state, {
      tenantId,
      userId: user.id,
      configId,
      redirectUri,
      createdAt: Date.now(),
    });

    const connector = new TOCOnlineConnector();
    await connector.configure({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      oauthUrl: credentials.oauthUrl,
      apiUrl: credentials.apiUrl,
    }, {
      tenantId,
      userId: user.id,
      connectorId: configId.toString(),
    });

    const authUrl = connector.getAuthorizationUrl(redirectUri, state);

    console.log(`[OAuth TOC] Redirecting to authorization: ${authUrl}`);
    res.redirect(authUrl);
  } catch (error: any) {
    console.error("[OAuth TOC] Authorization error:", error);
    res.status(500).json({ error: "Erro ao iniciar autorização OAuth", details: error.message });
  }
});

callbackRouter.get("/", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error(`[OAuth TOC] Authorization denied: ${error} - ${error_description}`);
      return res.redirect(`/studio?oauth=error&message=${encodeURIComponent(error_description as string || error as string)}`);
    }

    if (!code || !state) {
      return res.redirect('/studio?oauth=error&message=Parâmetros OAuth em falta');
    }

    const stateData = pendingOAuthStates.get(state as string);
    if (!stateData) {
      return res.redirect('/studio?oauth=error&message=Estado OAuth inválido ou expirado');
    }

    pendingOAuthStates.delete(state as string);

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, stateData.configId),
        eq(tenantConnectorConfigs.tenantId, stateData.tenantId)
      ))
      .limit(1);

    if (!config) {
      return res.redirect('/studio?oauth=error&message=Configuração não encontrada');
    }

    const credentials = config.companyCredentials as {
      clientId: string;
      clientSecret: string;
      oauthUrl?: string;
      apiUrl?: string;
    };

    const connector = new TOCOnlineConnector();
    await connector.configure({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      oauthUrl: credentials.oauthUrl,
      apiUrl: credentials.apiUrl,
    }, {
      tenantId: stateData.tenantId,
      userId: stateData.userId,
      connectorId: stateData.configId.toString(),
    });

    await connector.exchangeCodeForTokens(
      code as string,
      stateData.redirectUri
    );

    const tokens = connector.getTokens();

    await db.update(tenantConnectorConfigs)
      .set({
        companyCredentials: {
          ...credentials,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          connectedAt: new Date().toISOString(),
        },
        isEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(tenantConnectorConfigs.id, stateData.configId));

    console.log(`[OAuth TOC] Successfully connected for tenant ${stateData.tenantId}`);
    res.redirect('/studio?oauth=success&connector=toc-online');
  } catch (error: any) {
    console.error("[OAuth TOC] Callback error:", error);
    res.redirect(`/studio?oauth=error&message=${encodeURIComponent(error.message)}`);
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId;

    if (!user || !tenantId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const { configId } = req.body;
    if (!configId) {
      return res.status(400).json({ error: "configId é obrigatório" });
    }

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, configId),
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.connectorType, 'toc-online')
      ))
      .limit(1);

    if (!config) {
      return res.status(404).json({ error: "Configuração não encontrada" });
    }

    const credentials = config.companyCredentials as {
      clientId: string;
      clientSecret: string;
      oauthUrl?: string;
      apiUrl?: string;
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: number;
    };

    if (!credentials.refreshToken) {
      return res.status(400).json({ error: "Refresh token não disponível. Re-autorize a conexão." });
    }

    const connector = new TOCOnlineConnector();
    await connector.configure({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      oauthUrl: credentials.oauthUrl,
      apiUrl: credentials.apiUrl,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      tokenExpiresAt: credentials.tokenExpiresAt,
    }, {
      tenantId,
      userId: user.id,
      connectorId: configId.toString(),
    });

    await connector.refreshAccessToken();
    const tokens = connector.getTokens();

    await db.update(tenantConnectorConfigs)
      .set({
        companyCredentials: {
          ...credentials,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
        },
        updatedAt: new Date(),
      })
      .where(eq(tenantConnectorConfigs.id, configId));

    res.json({ success: true, message: "Token atualizado com sucesso" });
  } catch (error: any) {
    console.error("[OAuth TOC] Refresh error:", error);
    res.status(500).json({ error: "Erro ao atualizar token", details: error.message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = (req as any).tenantId;

    if (!user || !tenantId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const configId = parseInt(req.query.configId as string);
    if (isNaN(configId)) {
      return res.status(400).json({ error: "configId inválido" });
    }

    const [config] = await db.select().from(tenantConnectorConfigs)
      .where(and(
        eq(tenantConnectorConfigs.id, configId),
        eq(tenantConnectorConfigs.tenantId, tenantId),
        eq(tenantConnectorConfigs.connectorType, 'toc-online')
      ))
      .limit(1);

    if (!config) {
      return res.status(404).json({ error: "Configuração não encontrada" });
    }

    const credentials = config.companyCredentials as {
      clientId?: string;
      clientSecret?: string;
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: number;
      connectedAt?: string;
    };

    const hasCredentials = !!(credentials.clientId && credentials.clientSecret);
    const isConnected = !!credentials.accessToken;
    const tokenExpired = credentials.tokenExpiresAt ? Date.now() >= credentials.tokenExpiresAt : false;

    res.json({
      configId,
      hasCredentials,
      isConnected,
      tokenExpired,
      connectedAt: credentials.connectedAt,
      tokenExpiresAt: credentials.tokenExpiresAt,
      status: !hasCredentials ? 'unconfigured' : 
              !isConnected ? 'disconnected' : 
              tokenExpired ? 'expired' : 'connected',
    });
  } catch (error: any) {
    console.error("[OAuth TOC] Status error:", error);
    res.status(500).json({ error: "Erro ao verificar status", details: error.message });
  }
});

export default router;
