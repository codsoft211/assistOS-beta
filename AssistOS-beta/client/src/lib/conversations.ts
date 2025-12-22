import { apiRequest } from "./queryClient";

export interface ConversationConfig {
  agentType: 'assistme' | 'assistbuild' | 'assistsettings';
  queryKeyRoot: string;
  defaultTitle: string;
  baseApiPath?: string;
}

export const conversationApi = {
  generateTitle: async (conversationId: string) => {
    const res = await apiRequest("POST", `/api/conversations/${conversationId}/generate-title`);
    return res.json();
  },

  rename: async (conversationId: string, title: string) => {
    const res = await apiRequest("PATCH", `/api/conversations/${conversationId}/title`, { title });
    return res.json();
  },

  updateTags: async (conversationId: string, tags: string[]) => {
    const res = await apiRequest("PATCH", `/api/conversations/${conversationId}/tags`, { tags });
    return res.json();
  },

  delete: async (conversationId: string) => {
    await apiRequest("DELETE", `/api/conversations/${conversationId}`);
  },

  create: async (title: string, agentType: string) => {
    const res = await apiRequest("POST", "/api/conversations", { title, agentType });
    return res.json();
  },

  fetchConversations: async (agentType: string) => {
    const params = new URLSearchParams();
    params.append('agentType', agentType);
    const res = await fetch(`/api/conversations?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
  },

  fetchMessages: async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  }
};

export const assistbuildConversationApi = {
  create: async (title: string) => {
    const res = await apiRequest("POST", "/api/assistbuild/conversations", { title });
    return res.json();
  },

  fetchConversations: async () => {
    const res = await fetch(`/api/assistbuild/conversations`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch AssistBuild conversations');
    return res.json();
  },

  fetchMessages: async (conversationId: string) => {
    const res = await fetch(`/api/assistbuild/conversations/${conversationId}/messages`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch AssistBuild messages');
    return res.json();
  },

  generateTitle: async (conversationId: string) => {
    const res = await apiRequest("POST", `/api/assistbuild/conversations/${conversationId}/generate-title`);
    return res.json();
  },

  rename: async (conversationId: string, title: string) => {
    const res = await apiRequest("PATCH", `/api/assistbuild/conversations/${conversationId}`, { title });
    return res.json();
  },

  updateTags: async (conversationId: string, tags: string[]) => {
    const res = await apiRequest("PATCH", `/api/assistbuild/conversations/${conversationId}`, { tags });
    return res.json();
  },

  delete: async (conversationId: string) => {
    await apiRequest("DELETE", `/api/assistbuild/conversations/${conversationId}`);
  }
};
