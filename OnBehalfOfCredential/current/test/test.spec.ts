// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as dotenv from "dotenv";
import * as express from "express";
import { test, expect } from "@playwright/test";
import {
  AuthorizationCodeCredential,
  OnBehalfOfCredential,
} from "@azure/identity";
import {
  createDefaultHttpClient,
  createHttpHeaders,
  createPipelineRequest,
} from "@azure/core-rest-pipeline";
import { prepareServer } from "./server";
import { preparePage } from "./page";
import { credentialWrapper, sendRequest } from "./wrappers";

dotenv.config();

// This test shows how to authenticate a browser using the OnBehalfOfCredential.
// Throughout this document, we'll point out to the challenges of the existing approach with comment sections
// that will begin with "CHALLENGE", for example:
//
//     CHALLENGE (n of N):
//     <explanation-of-the-challenge>
//
// Challenges:
// 1. How to tie Azure credentials with web service user?
// 2. No sample using browser authentication and then using the `OnBehalfOfCredential`.
// 3. How to save a credential for future requests?
// 4. `loginStyle` changes authentication drastically.
// 5. No reference to the necessary scope the browser credential must use in order to be used later in the On-Behalf-Of-Flow.
// 6. How to handle multiple users in the browser?
// 7. No notion of the "state" parameter (in order to route multiple single-page applications from a single backend endpoint)
// 8. No way to log out.

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
const OBOSCOPE = "api://AAD_APP_CLIENT_ID/Read";
const homeUri = `http://localhost:${port}/index`;
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

  await preparePage(page);

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

      // CHALLENGE (1 of 8):
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

      // CHALLENGE (2 of 8):
      // No sample using browser authentication and then using the `OnBehalfOfCredential`.
      const spaAccessToken = await credentialWrapper(credential).getToken(
        scope
      );
      const oboCred = new OnBehalfOfCredential({
        tenantId,
        clientId,
        clientSecret,
        userAssertionToken: spaAccessToken.token,
      });

      // CHALLENGE (3 of 8):
      // How to store the credential of an authenticated user for future requests?
      const accessToken = await credentialWrapper(credential).getToken(scope);
      saveAzureState(username, { credential, accessToken });

      res.redirect(`${homeUri}?code=${authorizationCode}`);
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

  // THE TEST BEGINS

  // We go to the home page
  await page.goto(homeUri);

  // Create state in the web page
  await page.evaluate(() => {
    window.localStorage.steps = 0;
    setTimeout(() => {
      window.localStorage.steps = Number(window.localStorage.steps) + 1;
    }, 100);
  });

  await page.evaluate(
    ({ clientId, protocol, host, port, OBOSCOPE }) => {
      console.log("State steps:", window.localStorage.steps);

      const { newInteractiveBrowserCredential } = window as any;

      const credential = newInteractiveBrowserCredential({
        clientId,
        authorityHost: `${protocol}://${host}:${port}`,
        // CHALLENGE (4 of 8):
        // `loginStyle` changes authentication drastically.
        // // loginStyle: "popup"
      });
      console.log("CREDENTIAL", typeof credential);

      // CHALLENGE (5 of 8):
      // No reference to the necessary scope the browser credential must use in order to be used later in the On-Behalf-Of-Flow.
      credential.getToken(OBOSCOPE); // The redirection to Azure happens here...
    },
    { clientId, protocol, host, port, OBOSCOPE }
  );

  // TEST LOGIC: Force the redirection back to our home URI
  await page.evaluate(
    ({ redirectUri }) => {
      window.location = `${redirectUri}?code=ASDFASDFASDF` as any;
    },
    { redirectUri }
  );

  // We went to the redirectUri
  // Which then goes to the homeUri

  await page.evaluate(
    async ({ clientId, protocol, host, port, scope }) => {
      // TODO: Is there another way to wait for the credential to be
      // created from the index.js generated by rollup?
      function delay(timeInMs): Promise<void> {
        return new Promise((resolve) => setTimeout(() => resolve(), timeInMs));
      }
      while (!(window as any).newInteractiveBrowserCredential) {
        await delay(100);
      }
      const { newInteractiveBrowserCredential, credentialWrapper } =
        window as any;

      // CHALLENGE (6 of 8):
      // How to handle multiple users in the browser?
      // At the moment, there's now way to know what user authenticated,
      // and how to manage multiple users over time.
      // Every time one authenticates, that user becomes
      // (apparently) the only user authenticated.

      const credential = newInteractiveBrowserCredential({
        clientId,
        authorityHost: `${protocol}://${host}:${port}`,
        // CHALLENGE (1 of 8):
        // `loginStyle` changes authentication drastically.
        // // loginStyle: "popup"
      });
      console.log("CREDENTIAL", typeof credential);
      const token = await credentialWrapper(credential).getToken(scope);
      console.log("TOKEN", typeof credential);

      // CHALLENGE (7 of 8):
      // No "state" parameter.
      // `getToken` will route to the Azure page that authenticates,
      // and after we come back from the redirection,
      // we won't be able to know at what step of the "state"
      // the redirection happened.

      // CHALLENGE (8 of 8):
      // No way to log out.
    },
    { clientId, protocol, host, port, scope }
  );

  // Once authenticated, makes an authenticated call to Azure.
  const result = await page.goto(`${homeUri}/me`);
  console.log(await result.text());

  await stop();
});
