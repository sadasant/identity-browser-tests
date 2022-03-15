// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AccessToken,
  InteractiveBrowserCredential,
  TokenCredential,
} from "@azure/identity";
import {
  createDefaultHttpClient,
  createHttpHeaders,
  createPipelineRequest,
} from "@azure/core-rest-pipeline";
import { delay } from "@azure/core-util";
import { test, expect } from "@playwright/test";
import { credentialWrapper, sendRequest } from "./wrappers";
import { getAuthorizeUrl } from "./utils";
import * as express from "express";
import * as dotenv from "dotenv";
import * as childProcess from "child_process";
import * as path from "path";

dotenv.config();

// This test shows how to authenticate a browser using the SinglePageApplicationCredential.
// Throughout this document, we'll point out to the challenges of the existing approach with comment sections
// that will begin with "CHALLENGE", for example:
//
//     CHALLENGE (n of N):
//     <explanation-of-the-challenge>
//
// Challenges:
// 1. `loginStyle` changes authentication drastically.
// 2. It might be weird that getToken completely obliterates the currently running program (by redirecting).
// 3. After redirection, the credential retrieves the code from the URL, which might be confusing since this is hidden from the user.
// 4. How to handle multiple users in the browser?
// 5. No "state" parameter.
// 6. No way to log out.

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
const clearState = process.env.CLEAR_STATE;

// The Azure Active Directory app registration should be of the type
// "web" and the redirect endpoint should point to:
const redirectUri = `${protocol}://${host}:${port}/`;

test("Authenticates", async ({ page }) => {
  const webpackPath = path.resolve("./webpack");
  console.log({ webpackPath });
  const server = childProcess.spawn("npm start", { cwd: webpackPath });

  // Log and continue all network requests
  await page.route("**", (route) => {
    console.log(route.request().url());
    route.continue();
  });

  // THE TEST BEGINS

  const username = "testuser";

  // We go to the home page
  await page.goto(`${homeUri}/`);

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
        timeout: 1000,
      };
    }
    setTimeout(() => {
      window.localStorage.page.steps += 1;
    }, window.localStorage.page.timeout);
  });

  // Authenticate
  await page.evaluate(() => {
    const credential = new InteractiveBrowserCredential({
      clientId,
      // CHALLENGE (1 of 6):
      // 1. `loginStyle` changes authentication drastically.
      // // loginStyle: "popup"
    });

    credential.getToken(scope);
  });

  // Waiting for redirection...
  await page.waitForNavigation({ url: "**/authorize" });

  // TEST LOGIC: Force the redirection
  await page.evaluate(async () => {
    window.location = `${redirectUri}?code=ASDFASDFASDF` as any;
  });

  await page.evaluate(async () => {
    // CHALLENGE (2 of 6):
    // 2. It might be weird that getToken completely obliterates
    // the currently running program (by redirecting).

    // CHALLENGE (3 of 6):
    // 3. After redirection, the credential retrieves
    // the code from the URL, which might be confusing
    // since this is hidden from the user.

    // CHALLENGE (4 of 6):
    // 4. How to handle multiple users in the browser?
    // At the moment, there's now way to know what user authenticated,
    // and how to manage multiple users over time.
    // Every time one authenticates, that user becomes
    // (apparently) the only user authenticated.

    const credential = new InteractiveBrowserCredential({
      clientId,
    });

    // TODO: Mock this on the browser.
    // const token = await credential.getToken(scope);

    // CHALLENGE (5 of 6):
    // 5. No "state" parameter.
    // `getToken` will route to the Azure page that authenticates,
    // and after we come back from the redirection,
    // we won't be able to know at what step of the "state"
    // the redirection happened.

    // CHALLENGE (6 of 6):
    // 6. No way to log out.
  });

  server.kill("SIGINT");
});
