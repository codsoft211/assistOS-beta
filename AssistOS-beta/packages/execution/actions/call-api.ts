import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import axios from 'axios';

export class CallApiAction implements ActionExecutor {
  readonly name = 'call_api';
  readonly description = 'Call external HTTP/REST APIs';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.url && config.method);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const response = await axios({
        method: config.method || 'GET',
        url: config.url,
        headers: config.headers || {},
        params: config.params,
        data: config.body,
        timeout: config.timeout || 30000, // 30s default
        validateStatus: () => true, // Don't throw on any status
      });
      
      return {
        success: response.status >= 200 && response.status < 300,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to call API: ${error.message}`,
      };
    }
  }
}
