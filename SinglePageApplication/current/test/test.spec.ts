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

const testMode = process.env.TEST_MODE;
const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const serverSecret = process.env.SERVER_SECRET;
const azureUsername = process.env.AZURE_USERNAME;
const azurePassword = process.env.AZURE_PASSWORD;
const protocol = process.env.PROTOCOL || "http";
const host = process.env.HOST || "localhost";
const port = process.env.PORT;
const scope = "https://graph.microsoft.com/.default";
const homeUri = `http://localhost:${port}/`;
const authorizeHost =
  process.env.AUTHORIZE_HOST ||
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;

// The Azure Active Directory app registration should be of the type
// "web" and the redirect endpoint should point to:
const redirectUri = `${protocol}://${host}:${port}/`;

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
    async ({ clientId, protocol, host, port, scope, homeUri, testMode }) => {
      console.log("State steps:", window.localStorage.steps);

      const { InteractiveBrowserCredential } = (window as any).main;

      const credential = new InteractiveBrowserCredential({
        clientId,
        ...(testMode === "live"
          ? {
              redirectUri: homeUri,
            }
          : {
              authorityHost: `${protocol}://${host}:${port}`,
            }),
        // CHALLENGE (1 of 6):
        // `loginStyle` changes authentication drastically.
        loginStyle: "redirect",
      });

      if (testMode === "live") {
        credential.getToken(scope); // The redirection to Azure happens here...
      }
    },
    { clientId, protocol, host, port, scope, homeUri, testMode }
  );

  function delay(timeInMs): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), timeInMs));
  }
  if (testMode === "live") {
    await page.waitForNavigation();
    await page.waitForSelector(`input[type="email"]`);
    await page.fill(`input[type="email"]`, azureUsername);
    await page.waitForSelector(`input[type="submit"]`);
    await page.click(`input[type="submit"]`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(`input[type="password"]`);
    await page.fill(`input[type="password"]`, azurePassword);
    await page.waitForSelector(`input[type="submit"]`);
    await page.click(`input[type="submit"]`);
    await page.waitForSelector(`input[type="submit"]`);
    await page.click(`input[type="submit"]`);
    await page.waitForURL(`${homeUri}**`);
  } else {
    await page.evaluate(
      ({ homeUri }) => {
        window.location = `${homeUri}#code=ASDFASDFASDF` as any;
      },
      { homeUri }
    );
  }

  await page.evaluate(
    async ({ clientId, protocol, host, port, scope, homeUri, testMode }) => {
      const { InteractiveBrowserCredential } = (window as any).main;

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
        ...(testMode === "live"
          ? {
              redirectUri: homeUri,
            }
          : {
              authorityHost: `${protocol}://${host}:${port}`,
            }),
        // CHALLENGE (1 of 6):
        // `loginStyle` changes authentication drastically.
        loginStyle: "redirect",
      });
      console.log("CREDENTIAL", typeof credential);

      if (testMode === "live") {
        const token = await credential.getToken(scope);
        console.log("TOKEN", typeof credential);
      }

      // CHALLENGE (5 of 6):
      // No "state" parameter.
      // `getToken` will route to the Azure page that authenticates,
      // and after we come back from the redirection,
      // we won't be able to know at what step of the "state"
      // the redirection happened.

      // CHALLENGE (6 of 6):
      // No way to log out.
    },
    { clientId, protocol, host, port, scope, homeUri, testMode }
  );

  await stop();
});
