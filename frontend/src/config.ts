let baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
  baseUrl = 'https://' + baseUrl;
}
export const API_BASE_URL = baseUrl;
