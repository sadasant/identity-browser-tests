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
const serverSecret = process.env.SERVER_SECRET;
const azureUsername = process.env.AZURE_USERNAME;
const azurePassword = process.env.AZURE_PASSWORD;
const protocol = process.env.PROTOCOL || "http";
const host = process.env.HOST || "localhost";
const port = process.env.PORT;
const scope = "https://graph.microsoft.com/.default";
const authorizeHost =
  process.env.AUTHORIZE_HOST ||
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;

// The Azure Active Directory app registration should be of the type
// "spa" and the redirect endpoint should point to:
const homeUri = `http://localhost:${port}/`;

const testMode = process.env.TEST_MODE;
const credentialOptions =
  testMode === "live"
    ? { redirectUri: homeUri }
    : { authorityHost: `${protocol}://${host}:${port}` };

test("Authenticates with a popup", async ({ page }) => {
  const { app, start, stop } = await prepareServer({ serverSecret, port });

  await preparePage(page);

  await start();

  // THE TEST BEGINS

  // We go to the home page
  await page.goto(homeUri);

  const firstAuthentication = async ({
    clientId,
    scope,
    credentialOptions,
    testMode,
  }) => {
    const { InteractiveBrowserCredential } = (window as any).main;

    const credential = new InteractiveBrowserCredential({
      clientId,
      ...credentialOptions,
      // CHALLENGE (1 of 6):
      // `loginStyle` changes authentication drastically.
    });

    if (testMode === "live") {
      credential.getToken(scope); // The redirection to Azure happens here...
    }
  };

  if (testMode === "live") {
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.evaluate(firstAuthentication, {
        clientId,
        scope,
        credentialOptions,
        testMode,
      }),
    ]);

    // Interactive popup login with Playwright
    await popup.waitForNavigation();
    await popup.waitForSelector(`input[type="email"]`);
    await popup.fill(`input[type="email"]`, azureUsername);
    await popup.waitForSelector(`input[type="submit"]`);
    await popup.click(`input[type="submit"]`);
    await popup.waitForLoadState("networkidle");
    await popup.waitForSelector(`input[type="password"]`);
    await popup.fill(`input[type="password"]`, azurePassword);
    await popup.waitForSelector(`input[type="submit"]`);
    await popup.click(`input[type="submit"]`);
    await popup.waitForSelector(`input[type="submit"]`);
    await popup.click(`input[type="submit"]`);
    await popup.waitForEvent("close");
  } else {
    // Redirect back with a fake code
    await page.evaluate(firstAuthentication, {
      clientId,
      scope,
      credentialOptions,
      testMode,
    });
    await page.evaluate(
      ({ homeUri }) => {
        window.location = `${homeUri}#code=ASDFASDFASDF` as any;
      },
      { homeUri }
    );
  }

  await page.evaluate(
    async ({ clientId, scope, credentialOptions, testMode }) => {
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
        ...credentialOptions,
        // CHALLENGE (1 of 6):
        // `loginStyle` changes authentication drastically.
      });

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
    { clientId, scope, credentialOptions, testMode }
  );

  await stop();
});
