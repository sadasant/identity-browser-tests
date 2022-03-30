// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as dotenv from "dotenv";
import { test } from "@playwright/test";
import { prepareServer } from "./server";
import { preparePage } from "./page";

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

// The Azure Active Directory app registration should be of the type
// "web" and the redirect endpoint should point to:
const redirectUri = `${protocol}://${host}:${port}/index`;

test("Authenticates", async ({ page }) => {
  const { app, start, stop } = await prepareServer({ serverSecret, port });

  await preparePage(page);

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
    async ({ clientId, protocol, host, port, scope }) => {
      console.log("State steps:", window.localStorage.steps);

      const { InteractiveBrowserCredential } = (window as any).main;

      const credential = new InteractiveBrowserCredential({
        clientId,
        authorityHost: `${protocol}://${host}:${port}`,
        // CHALLENGE (1 of 6):
        // `loginStyle` changes authentication drastically.
        loginStyle: "redirect",
      });

      credential.getToken(scope); // The redirection to Azure happens here...
    },
    { clientId, protocol, host, port, scope }
  );

  // TEST LOGIC: Force the redirection back to our home URI
  await page.evaluate(
    ({ homeUri }) => {
      window.location = `${homeUri}#code=ASDFASDFASDF` as any;
    },
    { homeUri }
  );

  await page.evaluate(
    async ({ clientId, protocol, host, port, scope }) => {
      const { InteractiveBrowserCredential, credentialWrapper } = (
        window as any
      ).main;

      // CHALLENGE (2 of 6):
      // It might be weird that getToken completely obliterates
      // the currently running program (by redirecting).

      // CHALLENGE (3 of 6):
      // After redirection, the credential retrieves
      // the code from the URL, which might be confusing
      // since this is hidden from the user.

      // CHALLENGE (4 of 6):
      // How to handle multiple users in the browser?
      // At the moment, there's now way to know what user authenticated,
      // and how to manage multiple users over time.
      // Every time one authenticates, that user becomes
      // (apparently) the only user authenticated.

      const credential = new InteractiveBrowserCredential({
        clientId,
        authorityHost: `${protocol}://${host}:${port}`,
        // CHALLENGE (1 of 6):
        // `loginStyle` changes authentication drastically.
        loginStyle: "redirect",
      });
      console.log("CREDENTIAL", typeof credential);
      const token = await credentialWrapper(credential).getToken(scope);
      console.log("TOKEN", typeof credential);

      // CHALLENGE (5 of 6):
      // No "state" parameter.
      // `getToken` will route to the Azure page that authenticates,
      // and after we come back from the redirection,
      // we won't be able to know at what step of the "state"
      // the redirection happened.

      // CHALLENGE (6 of 6):
      // No way to log out.
    },
    { clientId, protocol, host, port, scope }
  );

  await stop();
});
