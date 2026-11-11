const API_BASE = '/api';

/**
 * Enhanced fetch wrapper with JWT authentication and standardized error parsing
 */
export async function apiRequest(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
  const token = localStorage.getItem('warrantywise_token');

  const requestHeaders = {
    ...headers
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const isFormData = body instanceof FormData;
  if (!isFormData && body && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined)
  });

  // Handle unauthorized auto logout
  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    localStorage.removeItem('warrantywise_token');
    localStorage.removeItem('warrantywise_user');
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  // Handle file downloads
  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.includes('application/json')) {
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const blob = await response.blob();
    return { blob, headers: response.headers };
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  get: (url, opts) => apiRequest(url, { ...opts, method: 'GET' }),
  post: (url, body, opts) => apiRequest(url, { ...opts, method: 'POST', body }),
  put: (url, body, opts) => apiRequest(url, { ...opts, method: 'PUT', body }),
  delete: (url, opts) => apiRequest(url, { ...opts, method: 'DELETE' }),

  downloadDocument: async (id, originalName) => {
    const token = localStorage.getItem('warrantywise_token');
    const response = await fetch(`${API_BASE}/documents/${id}/download?token=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalName || 'document';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
};

