// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export function getAuthorizeUrl(
  authorizeHost: string,
  tenantId: string,
  clientId: string,
  scopes: string,
  state: string,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });
  const query = params.toString();
  // Here's how the real call would look:
  // return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${query}`;
  return `${authorizeHost}/authorize?${query}`;
}
