// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export { InteractiveBrowserCredential } from "@azure/identity";

export function credentialWrapper(credential) {
  return {
    async getToken(scopes) {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      return {
        token: "TOKEN",
        expiresOnTimestamp: date.getTime(),
      };
    }
  }
};
