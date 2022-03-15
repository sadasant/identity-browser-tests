// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AccessToken,
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
const homeUri = `http://localhost:${port}/index`;
const authorizeHost =
  process.env.AUTHORIZE_HOST ||
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
const clearState = process.env.CLEAR_STATE;

// The Azure Active Directory app registration should be of the type
// "web" and the redirect endpoint should point to:
const redirectUri = `${protocol}://${host}:${port}/index`;

test("Authenticates", async ({ page }) => {
  // const webpackPath = path.resolve("./webpack");
  // console.log({ webpackPath });
  // const server = childProcess.spawn("npm", ["start"], { cwd: webpackPath });
  // server.stdout.pipe(process.stdout);
  // server.stderr.pipe(process.stderr);

  // Log and continue all network requests
  await page.route("**", (route) => {
    console.log("ROUTE:" ,route.request().url());
    route.continue();
  });

  // Logging the page's console.logs
  page.on('console', async msg => {
    const values = [];
    for (const arg of msg.args()) {
      values.push(await arg.jsonValue());
    }
    console.log(...values);
  });

  // THE TEST BEGINS
  
  // await delay(20000);

  const username = "testuser";

  // We go to the home page
  await page.goto(homeUri);

  console.log(await page.content());
  // Create state in the web page
  await page.evaluate(() => {
    window.localStorage.steps = 0
    setTimeout(() => {
      window.localStorage.steps += 1;
    }, 100);
  });

  // Wait until the page loads
  // await expect(page.locator('h1')).toHaveText('Azure SDK Browser Manual Tests');

  // Authenticate
  await page.evaluate(({ clientId }) => {
    console.log("State steps:", window.localStorage.steps);
    console.log("Credential:", (window as any).InteractiveBrowserCredential);
    window.onload = () => {
      const credential = new (window as any).InteractiveBrowserCredential({
        clientId,
        // CHALLENGE (1 of 6):
        // 1. `loginStyle` changes authentication drastically.
        // // loginStyle: "popup"
      });
      credential.getToken(scope);
    }
  }, { clientId });

  // Waiting for redirection...
  await page.waitForNavigation({ url: "**/authorize" });

  // TEST LOGIC: Force the redirection
  await page.evaluate(async ({ redirectUri }) => {
    window.location = `${redirectUri}?code=ASDFASDFASDF` as any;
  }, { redirectUri });

  await page.evaluate(async ({ clientId }) => {
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

    const credential = new (window as any).InteractiveBrowserCredential({
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
  }, {
    clientId
  });

  // server.kill("SIGINT");
});
