# AuthorizationCodeCredential challenge

## Current issues

1. No detailed sample with express in any of the Azure services.
2. No way to get the `/authorize` URL through the `@azure/identity` package.
3. No recommended way to cache the credential per user session (or the token).
  - Fixable via documentation.
4. No way to intuitively identify what user authenticated.
  - No notion of the `state` parameter.
5. No way to log out.
  - Of course, users can create new credentials.
  - The `/authorize` endpoint doesn't seem to cache the last successful authentication, however, the silent flow will work while the token is valid, and there's no way to force MSAL to clear its cache.

## Draft of a new approach

A `WebRedirectCredential()`:

- Part of a new plugin package, `@azure/identity-browser`.
- Named after the `web` redirect endpoint on the AAD app registration.
- Throws on the browser.
- `disableAutomaticAuthentication` set to true (can't change it).
- `getToken()` will only work with silent auth.

```ts
// disableAutomaticAuthentication set to true forcefully.
// getToken() will only work with silent auth.
const credential = new WebRedirectCredential(
  tenantId,
  clientId,
  redirectUri
);
```

Has a `getRedirectUri` method:

```ts
  app.get(
    "/azureLogin",
    async (req: express.Request, res: express.Response) => {
      // Here we authenticate...
      
      // Then we make the credential.
      const credential = new WebRedirectCredential(
        tenantId,
        clientId,
        redirectUri
      );

      // We save the credential in an in-memory cache, or not...
      // The sample will elaborate with recommended approaches.

      // We set something that can identify the user as the state parameter.
      const state = session.username; // or ID

      // We get the authorize URL.
      const authorizeUrl = credential.getRedirectUri(scope, {
        state,
      });

      // We redirect to it.
      res.redirect(authorizeUrl);
    }
  );
```

Authenticates with `authenticate()`, and uses the `authenticationRecord` to quickly store serialized info that can be used to retrieve the account from the cache:

```ts
  app.get(
    "/azureResponse",
    async (req: express.Request, res: express.Response): Promise<void> => {
      const authorizationCode = req.query["code"];
      if (!authorizationCode) {
        // throw...
      }

      const username = req.query["state"];

      // Check that we're logged in, and that the state is valid...


      // Either retrieve the credential from in-memory cache, or:
      const credential = new WebRedirectCredential(
        tenantId,
        clientId,
        redirectUri
      );

      const authenticationRecord = await credential.authenticate(scope, {
        authorizationCode
      });
      // save the authenticationRecord in a database or in-memory cache...

      // Go to home, or acknowledge the authentication has completed...
    }
  );

  // A separate endpoint that uses the Azure API:
  app.get(
    "/me",
    async (req: express.Request, res: express.Response): Promise<void> => {
      // Check that we're logged in, and that we have authenticated before...

      // Retrieve the authentication record...
      // const authenticationRecord = //...

      const credential = new WebRedirectCredential(
        tenantId,
        clientId,
        redirectUri,
        { authenticationRecord }
      );

      // use the credential...
    }
  );
```

IMPORTANT: Could we provide a method to clear the cache?