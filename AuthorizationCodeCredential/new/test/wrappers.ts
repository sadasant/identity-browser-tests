// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AccessToken,
  AuthenticationRecord,
  TokenCredential,
} from "@azure/identity";
import { HttpClient, PipelineRequest } from "@azure/core-rest-pipeline";

export function credentialWrapper(
  credential: TokenCredential
): TokenCredential & {
  authenticate(
    scopes: string | string[],
    authorizationCode: string,
    options: GetTokenOptions = {}
  ): Promise<AuthenticationRecord | undefined>;
} {
  return {
    async getToken(scopes: string | string[]): Promise<AccessToken> {
      if (process.env.TEST_MODE !== "playback") {
        return credential.getToken(scopes);
      }
      const date = new Date();
      date.setDate(date.getDate() + 1);
      return {
        token: "TOKEN",
        expiresOnTimestamp: date.getTime(),
      };
    },
    async authenticate(
      scopes: string | string[],
      authorizationCode: string
    ): Promise<AuthenticationRecord> {
      if (process.env.TEST_MODE !== "playback") {
        return credential.authenticate(scopes, authorizationCode);
      }
      return {
        authority: "authority",
        clientId: "client-id",
        homeAccountId: "home-account-id",
        tenantId: "tenant-id",
        username: "username",
      };
    },
  };
}

export async function sendRequest(
  client: HttpClient,
  request: PipelineRequest
): Promise<any> {
  if (process.env.TEST_MODE !== "playback") {
    return client.sendRequest(request);
  }
  return {
    value: "PLAYBACK SUCCESSFUL RESPONSE",
  };
}
