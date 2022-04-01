// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as dotenv from "dotenv";
import { test } from "@playwright/test";
import { prepareServer } from "./server";
import { preparePage } from "./page";

dotenv.config();

// This test shows how to authenticate a Node.js web server using
// the new proposed `RedirectCredential`, from the proposed package `@azure/identity-spa`,
// hosted here: https://github.com/Azure/azure-sdk-for-js/pull/<TBD>
//
// At the root of the `new` folder, we have a copy of the generated
// tar.gz of this package.
//
// Throughout this document, we'll point out to the challenges of the existing approach with comment sections,
// along with how our new approach solves this challenge.
// For example:
//
//     CHALLENGE (n of 5):
//     <explanation-of-the-challenge>
//
//     SOLUTION:
//     <explanation-of-the-solution>
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
    async ({ clientId, scope, credentialOptions, testMode }) => {
      console.log("State steps:", window.localStorage.steps);

      const { RedirectCredential } = (window as any).main;

      // CHALLENGE (1 of 6):
      // `loginStyle` changes authentication drastically.
      //
      // SOLUTION:
      // @azure/identity-spa contains two credentials:
      // RedirectCredential and PopupCredential.
      // Samples can be completely separated.
      const credential = new RedirectCredential({
        clientId,
        ...credentialOptions,
      });

      // CHALLENGE (2 of 6):
      // It might be weird that getToken completely obliterates
      // the currently running program (by redirecting).
      //
      // SOLUTION:
      // AuthenticationRequiredError indicates when to
      // manually authenticate.
      try {
        if (testMode === "live") {
          credential.getToken(scope);
        }
      } catch (e) {
        if (e.name === "AuthenticationRequiredError") {
          await credential.authenticate(scope, {
            // CHALLENGE (5 of 6):
            // No "state" parameter.
            // `getToken` will route to the Azure page that authenticates,
            // and after we come back from the redirection,
            // we won't be able to know at what step of the "state"
            // the redirection happened.
            //
            // SOLUTION:
            // We can specify a state parameter on .authenticate()
            state,
          });
          // The redirection to Azure happens here...
        }
      }
    },
    { clientId, scope, credentialOptions, testMode }
  );

  if (testMode === "live") {
    // Interactive login with Playwright
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
    // Redirect back with a fake code
    await page.evaluate(
      ({ homeUri }) => {
        window.location = `${homeUri}#code=ASDFASDFASDF` as any;
      },
      { homeUri }
    );
  }

  await page.evaluate(
    async ({ clientId, scope, credentialOptions, testMode }) => {
      const { RedirectCredential } = (window as any).main;

      // CHALLENGE (4 of 6):
      // How to handle multiple users in the browser?
      // At the moment, there's now way to know what user authenticated,
      // and how to manage multiple users over time.
      // Every time one authenticates, that user becomes
      // (apparently) the only user authenticated.
      //
      // SOLUTION (1 of 3):
      // An instance of the browser credentials will tie to the first account
      // authenticated based on the input parameters.
      const credential = new RedirectCredential({
        clientId,
        ...credentialOptions,
      });

      // CHALLENGE (4 of 6):
      // How to handle multiple users in the browser?
      //
      // SOLUTION (2 of 3):
      // An instance of the browser credentials will allow clearing all the
      // authenticated information (relative to the input parameters of the
      // credential constructor) at any point in time.
      const authenticationRecord = window.localStorage.authenticationRecord
        ? JSON.parse(window.localStorage.authenticationRecord)
        : undefined;
      if (authenticationRecord) {
        await credential.logout(authenticationRecord);
      }

      // CHALLENGE (3 of 6):
      // After redirection, the credential retrieves
      // the code from the URL, which might be confusing
      // since this is hidden from the user.
      //
      // AND
      // CHALLENGE (6 of 6):
      // No way to log out.
      //
      // SOLUTION:
      // The credential now has a method to control the processing of the
      // redirect CODE and the previously sent `state` parameter.
      const { state } = await credential.onPageLoad();
      console.log({ state });

      if (testMode === "live") {
        const token = await credential.getToken(scope);
        console.log("TOKEN", typeof credential);
      }

      // CHALLENGE (4 of 6):
      // How to handle multiple users in the browser?
      //
      // SOLUTION (3 of 3):
      // At any point in time, authenticate() can be called to retrieve
      // the authenticationRecord. No redirection will happen if the
      // user is already authenticated.
      if (testMode === "live") {
        const newAuthenticationRecord = await credential.authenticate(scope);
        window.localStorage.authenticationRecord = JSON.stringify(
          newAuthenticationRecord
        );
        console.log("AUTHENTICATION RECORD", newAuthenticationRecord);
      }
    },
    { clientId, scope, credentialOptions, testMode }
  );

  await stop();
});
