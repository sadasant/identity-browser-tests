// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AccessToken,
  AuthorizationCodeCredential,
  TokenCredential,
} from "@azure/identity";
import {
  createDefaultHttpClient,
  createHttpHeaders,
  createPipelineRequest,
} from "@azure/core-rest-pipeline";
import { delay } from "@azure/core-util";
import { test, expect } from "@playwright/test";
import { prepareServer } from "./server";
import { credentialWrapper, sendRequest } from "./wrappers";
import { getAuthorizeUrl } from "./utils";
import * as express from "express";
import * as dotenv from "dotenv";

dotenv.config();

// This test shows how to authenticate a Node.js web server using the OnBehalfOfCredential.
// Throughout this document, we'll point out to the challenges of the existing approach with comment sections
// that will begin with "CHALLENGE", for example:
//
//     CHALLENGE (n of N):
//     <explanation-of-the-challenge>
//
// Challenges:
// 1. `loginStyle` changes authentication drastically.
// 2. No "state" parameter.
// 3. No sample showcasing the scope the browser credential must use for the On-Behalf-Of-Flow.
// 4. It might be weird that getToken completely obliterates the currently running program (by redirecting).
// 5. After redirection, the credential retrieves the code from the URL, which might be confusing since this is hidden from the user.
// 6. How to handle multiple users in the browser?
// 7. No way to log out.
// 8. No sample using browser authentication and then using the `OnBehalfOfCredential`.

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const serverSecret = process.env.SERVER_SECRET;
const azureUsername = process.env.AZURE_USERNAME;
const azurePassword = process.env.AZURE_PASSWORD;
const protocol = process.env.PROTOCOL || "http";
const host = process.env.HOST || "localhost";
const port = process.env.PORT;
const homeUri = `http://localhost:${port}`;
const authorizeHost =
  process.env.AUTHORIZE_HOST ||
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
const clearState = process.env.CLEAR_STATE;

// The Azure Active Directory app registration should be of the type
// "web" and the redirect endpoint should point to:
const redirectUri = `${protocol}://${host}:${port}/azureResponse`;

test("Authenticates", async ({ page }) => {
  const {
    app,
    database,
    extractUsername,
    extractToken,
    checkLoggedIn,
    saveAzureState,
    start,
    stop,
  } = await prepareServer({ serverSecret, port });

  /**
   * Sends a request to Azure's /me
   */
  app.get(
    "/me",
    async (req: express.Request, res: express.Response): Promise<void> => {
      const username = extractUsername(req);
      checkLoggedIn(username);

      const token = extractToken(username);

      const request = createPipelineRequest({
        url: "https://graph.microsoft.com/v1.0/me",
        method: "GET",
        headers: createHttpHeaders({
          Authorization: `Bearer ${token}`,
        }),
      });

      const client = createDefaultHttpClient();
      const response = await sendRequest(client, request);
      res.send(JSON.stringify(response));
    }
  );

  await start();

  // Log and continue all network requests
  await page.route("**", (route) => {
    console.log(route.request().url());
    route.continue();
  });

  // THE TEST BEGINS

  const username = "testuser";

  // We go to the home page
  await page.goto(`${homeUri}/`);
  await expect(loginResponse.status(), "The home page request should have succeeded").toBe(200);

  if (clearState) {
    // Create state in the web page
    await page.evaluate(() => {
      window.localStorage.page = undefined;
    });
  }

  // Create state in the web page
  await page.evaluate(() => {
    if (!window.localStorage.pageState) {
      window.localStorage.page = {
        steps: 0,
        timeout: 1000
      }
    }
    setTimeout(() => {
      window.localStorage.page.steps += 1;
    }, window.localStorage.page.timeout);
  });

  // Authenticate
  await page.evaluate(() => {
    const credential = new InteractiveBrowserCredential({
      clientId,
      // CHALLENGE (1 of 8):
      // 1. `loginStyle` changes authentication drastically.
      // // loginStyle: "popup"
    });

    // CHALLENGE (2 of 8):
    // 2. No "state" parameter.
    // `getToken` will route to the Azure page that authenticates,
    // and after we come back from the redirection,
    // we won't be able to know at what step of the "state"
    // the redirection happened.
    
    // CHALLENGE (3 of 8):
    // 3. No sample showcasing the scope the browser credential
    // must use for the On-Behalf-Of-Flow.

    // CHALLENGE (4 of 8):
    // 4. It might be weird that getToken completely obliterates
    // the currently running program (by redirecting).

    credential.getToken(`api://${clientId}/Read`)
  });

  // Waiting for redirection...
  await page.waitForNavigation({ url: '**/azureResponse' })

  await page.evaluate(() => {
    // 5. After redirection, the credential retrieves
    // the code from the URL, which might be confusing
    // since this is hidden from the user.

    // CHALLENGE (3 of 8):
    // 4. How to handle multiple users in the browser?
    // At the moment, there's now way to know what user authenticated,
    // and how to manage multiple users over time.
    // Every time one authenticates, that user becomes
    // (apparently) the only user authenticated.
  });

  await stop();
});
