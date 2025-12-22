/**
 * WhatsApp Cloud API Service
 * Handles communication with Meta's WhatsApp Business API
 * Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/
 */

import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import logger from "../logger";

const WHATSAPP_API_VERSION = "v24.0";
const WHATSAPP_API_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

export interface SendTextMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface SendTemplateMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  components?: Array<{
    type: "header" | "body" | "button";
    sub_type?: "quick_reply" | "url";
    index?: number;
    parameters: Array<{
      type: "text" | "currency" | "date_time" | "image" | "video" | "document";
      text?: string;
      currency?: {
        fallback_value: string;
        code: string;
        amount_1000: number;
      };
      date_time?: {
        fallback_value: string;
      };
      image?: {
        id?: string;
        link?: string;
      };
      video?: {
        id?: string;
        link?: string;
      };
      document?: {
        id?: string;
        link?: string;
        filename?: string;
      };
      payload?: string;
    }>;
  }>;
}

export interface SendMediaMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: "image" | "video" | "audio" | "document";
  mediaId?: string;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
}

export interface SendLocationMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface MarkAsReadParams {
  phoneNumberId: string;
  accessToken: string;
  messageId: string;
}

export interface UploadMediaParams {
  phoneNumberId: string;
  accessToken: string;
  file: Buffer;
  filename: string;
  mimeType: string;
}

export interface DownloadMediaParams {
  accessToken: string;
  mediaUrl: string;
}

export interface WhatsAppMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export interface WhatsAppMediaUploadResponse {
  id: string;
}

export class WhatsAppAPIService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: WHATSAPP_API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    } as any);
  }

  async sendTextMessage(
    params: SendTextMessageParams,
  ): Promise<WhatsAppMessageResponse> {
    const { phoneNumberId, accessToken, to, text, previewUrl = false } = params;

    try {
      logger.info(`[WhatsApp API] Sending text message to ${to}`);

      const response = await this.axiosInstance.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: previewUrl,
            body: text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      logger.info(
        `[WhatsApp API] Text message sent successfully: ${response.data.messages[0].id}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error({
        errorMessage: error.message,
        errorResponse: error.response?.data,
        errorStatus: error.response?.status,
        errorCode: error.code,
        fullError: error,
      }, `[WhatsApp API] Error sending text message`);
      throw new Error(
        `Failed to send WhatsApp message: ${error.response?.data?.error?.message || error.message || 'Unknown error'}`,
      );
    }
  }

  async sendTemplateMessage(
    params: SendTemplateMessageParams,
  ): Promise<WhatsAppMessageResponse> {
    const {
      phoneNumberId,
      accessToken,
      to,
      templateName,
      templateLanguage,
      components = [],
    } = params;

    try {
      logger.info(
        `[WhatsApp API] Sending template message '${templateName}' to ${to}`,
      );

      console.error(
        "Payload being sent to WhatsApp API:",
        JSON.stringify(
          {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLanguage },
              components: components.length > 0 ? components : undefined,
            },
          },
          null,
          2,
        ),
      );

      const response = await this.axiosInstance.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: templateName,
            language: {
              code: templateLanguage,
            },
            components: components.length > 0 ? components : undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      logger.info(
        `[WhatsApp API] Template message sent successfully: ${response.data.messages[0].id}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        {
          message: error.message,
          responseData: error.response?.data,
          responseText: error.response?.data
            ? JSON.stringify(error.response.data, null, 2)
            : "No data",
          status: error.response?.status,
          headers: error.response?.headers,
          stack: error.stack,
        },
        "[WhatsApp API] Error sending template message:",
      );

      throw new Error(
        `Failed to send WhatsApp template: ${
          error.response?.data?.error?.message ||
          error.response?.data ||
          error.message
        }`,
      );
    }
  }

  async sendMediaMessage(
    params: SendMediaMessageParams,
  ): Promise<WhatsAppMessageResponse> {
    const {
      phoneNumberId,
      accessToken,
      to,
      type,
      mediaId,
      mediaUrl,
      caption,
      filename,
    } = params;

    if (!mediaId && !mediaUrl) {
      throw new Error("Either mediaId or mediaUrl must be provided");
    }

    try {
      logger.info(`[WhatsApp API] Sending ${type} message to ${to}`);

      const mediaBody: any = mediaId ? { id: mediaId } : { link: mediaUrl };

      if (
        caption &&
        (type === "image" || type === "video" || type === "document")
      ) {
        mediaBody.caption = caption;
      }

      if (filename && type === "document") {
        mediaBody.filename = filename;
      }
      const response = await this.axiosInstance.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type,
          [type]: mediaBody,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      logger.info(
        `[WhatsApp API] Media message sent successfully: ${response.data.messages[0].id}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error sending media message:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send WhatsApp media: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async sendLocationMessage(
    params: SendLocationMessageParams,
  ): Promise<WhatsAppMessageResponse> {
    const {
      phoneNumberId,
      accessToken,
      to,
      latitude,
      longitude,
      name,
      address,
    } = params;

    try {
      logger.info(`[WhatsApp API] Sending location message to ${to}`);

      const response = await this.axiosInstance.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "location",
          location: {
            latitude,
            longitude,
            name,
            address,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      logger.info(
        `[WhatsApp API] Location message sent successfully: ${response.data.messages[0].id}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error sending location message:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send WhatsApp location: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async markAsRead(params: MarkAsReadParams): Promise<{ success: boolean }> {
    const { phoneNumberId, accessToken, messageId } = params;

    try {
      logger.info(`[WhatsApp API] Marking message ${messageId} as read`);

      await this.axiosInstance.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      logger.info(`[WhatsApp API] Message marked as read successfully`);
      return { success: true };
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error marking message as read:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to mark WhatsApp message as read: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async uploadMedia(
    params: UploadMediaParams,
  ): Promise<WhatsAppMediaUploadResponse> {
    const { phoneNumberId, accessToken, file, filename, mimeType } = params;

    try {
      logger.info(`[WhatsApp API] Uploading media file: ${filename}`);

      const FormData = require("form-data");
      const formData = new FormData();

      formData.append("file", file, {
        filename,
        contentType: mimeType,
      });
      formData.append("messaging_product", "whatsapp");

      const response = await this.axiosInstance.post(
        `/${phoneNumberId}/media`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...formData.getHeaders(),
          },
        },
      );

      logger.info(
        `[WhatsApp API] Media uploaded successfully: ${response.data.id}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error uploading media:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to upload WhatsApp media: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async downloadMedia(params: DownloadMediaParams): Promise<Buffer> {
    const { accessToken, mediaUrl } = params;

    try {
      logger.info(`[WhatsApp API] Downloading media from: ${mediaUrl}`);

      const response = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        responseType: "arraybuffer",
      });

      logger.info(`[WhatsApp API] Media downloaded successfully`);
      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error downloading media:`,
        error.response?.data || error.message,
      );
      throw new Error(`Failed to download WhatsApp media: ${error.message}`);
    }
  }

  async getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
    try {
      logger.info(`[WhatsApp API] Getting media URL for: ${mediaId}`);

      const response = await this.axiosInstance.get(`/${mediaId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      logger.info(`[WhatsApp API] Media URL retrieved successfully`);
      return response.data.url;
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error getting media URL:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to get WhatsApp media URL: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Download media from WhatsApp Cloud API by media ID
   * Combines getMediaUrl + downloadMedia into a single operation
   *
   * @param mediaId - WhatsApp media ID
   * @param phoneNumberId - WhatsApp phone number ID (not currently used by API, but kept for consistency)
   * @param accessToken - WhatsApp access token
   * @returns Buffer containing the media content
   */
  async downloadMediaById(
    mediaId: string,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<Buffer> {
    try {
      logger.info(`[WhatsApp API] Downloading media by ID: ${mediaId}`);

      // Step 1: Get the media URL
      const mediaUrl = await this.getMediaUrl(mediaId, accessToken);

      // Step 2: Download the media from the URL
      const mediaBuffer = await this.downloadMedia({ accessToken, mediaUrl });

      logger.info(
        `[WhatsApp API] Media downloaded successfully by ID: ${mediaId}`,
      );
      return mediaBuffer;
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error downloading media by ID:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get message templates from WhatsApp Business API
   * Documentation: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
   *
   * @param wabaId - WhatsApp Business Account ID
   * @param accessToken - WhatsApp access token
   * @returns Array of message templates
   */
  async getMessageTemplates(
    wabaId: string,
    accessToken: string,
  ): Promise<any[]> {
    try {
      logger.info(
        `[WhatsApp API] Fetching message templates for WABA: ${wabaId}`,
      );

      const response = await this.axiosInstance.get(
        `/${wabaId}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            limit: 1000,
          },
        },
      );

      const templates = response.data.data || [];
      logger.info(
        `[WhatsApp API] Fetched ${templates.length} templates successfully`,
      );

      return templates;
    } catch (error: any) {
      logger.error(
        `[WhatsApp API] Error fetching message templates:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to fetch WhatsApp templates: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }
}

export const whatsappAPIService = new WhatsAppAPIService();
