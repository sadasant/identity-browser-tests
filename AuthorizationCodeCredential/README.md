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

      // We save the credential in an in-memory cache.
      // The sample will elaborate with recommended approaches...

      // We set something that can identify the user as the state parameter.
      const state = session.username;

      // We get the authorize URL.
      const authorizeUrl = credential.getRedirectUri(scope, {
        state,
      });

      // We redirect to it.
      res.redirect(authorizeUrl);
    }
  );
```

Could have a logout method.