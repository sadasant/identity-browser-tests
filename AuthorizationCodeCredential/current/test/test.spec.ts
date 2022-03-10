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

// This test shows how to authenticate a Node.js web server using the AuthorizationCodeCredential.
// Throughout this document, we'll point out to the challenges of the existing approach with comment sections
// that will begin with "CHALLENGE", for example:
//
//     CHALLENGE (n of N):
//     <explanation-of-the-challenge>
//
// Challenges:
// 1. No API to get the authorize URI.
// 2. No notion of the "state" parameter.
// 3. How to tie Azure credentials with web service user.
// 4. Save a credential for future requests.
// 5. How to recover a credential in the future?
//
// Not in this document:
// - How to log out, since we can remove the reference in memory.

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
   * Begins the authentication process with Azure.
   */
  app.get(
    "/azureLogin",
    async (req: express.Request, res: express.Response) => {
      const username = extractUsername(req);
      checkLoggedIn(username);

      // CHALLENGE (1 of 5):
      // The current package @azure/identity does not have a way to retrieve the authorize URI.
      const url = getAuthorizeUrl(
        authorizeHost,
        tenantId,
        clientId,
        scope,
        // CHALLENGE (2 of 5):
        // We currently don't have any notion of the "state" parameter on @azure/identity
        username, // this will be sent as the "state" on the ourgoing query.
        redirectUri
      );
      console.log("Redirecting to", url);

      res.redirect(url);
    }
  );

  /**
   * Processing Azure's response
   */
  app.get(
    "/azureResponse",
    async (req: express.Request, res: express.Response): Promise<void> => {
      // The redirect will either contain a "code" or an "error"
      const authorizationCode = req.query["code"];
      if (!authorizationCode) {
        throw new Error(
          `Authentication Error "${req.query["error"]}":\n\n${req.query["error_description"]}`
        );
      }

      const username = req.query["state"] as string;
      console.log({ authorizationCode, username });

      // CHALLENGE (3 of 5):
      // No sample showcasing how to tie the Azure credentials
      // with the authenticated user of a web service.
      checkLoggedIn(username);

      const credential = new AuthorizationCodeCredential(
        tenantId,
        clientId,
        clientSecret,
        authorizationCode as string,
        redirectUri
      );

      // CHALLENGE (4 of 5):
      // How to store the credential of an authenticated user for future requests?
      const accessToken = await credentialWrapper(credential).getToken(scope);
      saveAzureState(username, { credential, accessToken });

      res.sendStatus(200);
    }
  );

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
