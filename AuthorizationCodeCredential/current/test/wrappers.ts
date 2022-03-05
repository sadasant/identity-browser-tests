// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AccessToken, TokenCredential } from "@azure/identity";
import { HttpClient, PipelineRequest } from "@azure/core-rest-pipeline";

export function credentialWrapper(
  credential: TokenCredential
): TokenCredential {
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
