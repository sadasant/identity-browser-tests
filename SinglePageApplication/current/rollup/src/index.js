// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { InteractiveBrowserCredential } from "@azure/identity";

window.newInteractiveBrowserCredential = (...params) => {
  try {
    return new InteractiveBrowserCredential(...params);
  } catch(e) {
    console.log("ERROR", e.message);
  }
}

window.credentialWrapper = credential => ({
  async getToken(scopes) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return {
      token: "TOKEN",
      expiresOnTimestamp: date.getTime(),
    };
  },
});
