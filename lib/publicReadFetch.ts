const buildHeaders = (authToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
};

export const fetchPublicRead = async (
  endpoint: string,
  authToken?: string
): Promise<Response> => {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(authToken),
    cache: 'no-store'
  });

  if (!authToken || (response.status !== 401 && response.status !== 403)) {
    return response;
  }

  return fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(),
    cache: 'no-store'
  });
};
