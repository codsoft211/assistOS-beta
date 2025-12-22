import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface ApiResponse {
  ok: boolean;
  status: number;
  data: any;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  data?: any;
  failOnError?: boolean;
}

/**
 * Make an authenticated API request using page.request.
 * This automatically shares cookies from the Page context, ensuring authentication works.
 * 
 * @param page - The Playwright Page instance (provides authentication context)
 * @param url - The API endpoint URL (relative or absolute)
 * @param options - Request options
 * @returns Response object with ok, status, and data
 */
export async function apiRequest(
  page: Page,
  url: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse> {
  const { method = 'GET', data, failOnError = true } = options;
  
  // Ensure URL is absolute
  const absoluteUrl = url.startsWith('http') ? url : `http://0.0.0.0:5000${url}`;
  
  // Make request using page.request (automatically includes cookies from page context)
  const requestOptions: any = {};
  if (data) {
    requestOptions.data = data;
  }
  
  let response;
  try {
    switch (method.toUpperCase()) {
      case 'GET':
        response = await page.request.get(absoluteUrl, requestOptions);
        break;
      case 'POST':
        response = await page.request.post(absoluteUrl, requestOptions);
        break;
      case 'PATCH':
        response = await page.request.patch(absoluteUrl, requestOptions);
        break;
      case 'DELETE':
        response = await page.request.delete(absoluteUrl, requestOptions);
        break;
      case 'PUT':
        response = await page.request.put(absoluteUrl, requestOptions);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  } catch (error) {
    if (failOnError) {
      throw new Error(`API request failed: ${error}`);
    }
    return {
      ok: false,
      status: 0,
      data: null,
    };
  }
  
  // Parse response data
  let responseData = null;
  try {
    const contentType = response.headers()['content-type'];
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }
  } catch (error) {
    // Response might not have a body or might not be JSON
    responseData = null;
  }
  
  // Assert status code if failOnError is true
  if (failOnError && !response.ok()) {
    throw new Error(
      `API request failed: ${method} ${url} returned ${response.status()} ${response.statusText()}\n` +
      `Response: ${JSON.stringify(responseData, null, 2)}`
    );
  }
  
  return {
    ok: response.ok(),
    status: response.status(),
    data: responseData,
  };
}

/**
 * Get all cookies from the page context.
 */
export async function getCookies(page: Page) {
  return await page.context().cookies();
}

/**
 * Get the session cookie (connect.sid) from the page context.
 */
export async function getSessionCookie(page: Page) {
  const cookies = await getCookies(page);
  return cookies.find((c) => c.name === 'connect.sid');
}

/**
 * Clear all cookies from the page context.
 * This effectively logs out the user.
 */
export async function clearSession(page: Page) {
  await page.context().clearCookies();
}

/**
 * Verify that a session cookie exists and is valid.
 */
export async function verifySessionCookie(page: Page): Promise<boolean> {
  const sessionCookie = await getSessionCookie(page);
  return !!sessionCookie && !!sessionCookie.value;
}
