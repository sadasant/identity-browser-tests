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
// 1. No API to get the authorize URI.
// 2. `loginStyle` changes authentication drastically.
// 3. How to handle multiple users in the browser?
// 4. No way to log out.
// 5. No sample using browser authentication and then using the `OnBehalfOfCredential`.
// 6. No sample showcasing the scope the browser credential must use for the On-Behalf-Of-Flow.

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const serverSecret = process.env.SERVER_SECRET;
const azureUsername = process.env.AZURE_USERNAME;
const azurePassword = process.env.AZURE_PASSWORD;
const protocol = process.env.PROTOCOL || "http";
const host = process.env.HOST || "localhost";
const port = process.env.PORT;
const scope = "https://graph.microsoft.com/.default";
const homeUri = `http://localhost:${port}`;
const authorizeHost =
  process.env.AUTHORIZE_HOST ||
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;

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

      // CHALLENGE (5 of 5):
      // How to recover a credential in the future?
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

  // Authenticates on the test server
  const loginResponse = await page.goto(
    `${homeUri}/login?username=${username}`
  );
  await expect(loginResponse.status(), "Login should have succeeded").toBe(200);
  await expect(
    database[username].loggedIn,
    "Database should report the user has logged in"
  ).toBeTruthy();

  // Authenticates on the test server
  await page.goto(`${homeUri}/azureLogin`);

  // Once authenticated, makes an authenticated call to Azure.
  const result = await page.goto(`${homeUri}/me`);
  console.log(await result.text());

  await stop();
});
