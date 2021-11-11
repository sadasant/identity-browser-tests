# AuthorizationCodeCredential challenge

## What is the AuthorizationCodeCredential?

`AuthorizationCodeCredential` is a credential that allows users to retrieve access tokens from Azure AD once they have a `code` that is received from Azure.

> Documentation about the endpoint in relation to the Authorization Code flow is available here: https://docs.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow#1-get-an-authorization-code

To configure the Azure App Registration, on the Azure Portal users would:

- On the "Authentication" page of the App Registration:
  - Under "Supported Account Types", select `Accounts in any organizational directory (Any Azure AD directory - Multitenant)` .
- Under "Platform Configurations":
  - Users would need to add a platform and select "Web".
  - Users then would add a specific URI to their server.
  - If they're working with a localhost server, they may put something similar to `http://localhost:8080/path` as the redirect URI.
  - Users would finally click "Configure".

In the application that uses this credential, users would need to redirect their application users to the `/authorize` endpoint, specifying a query parameters `response_type` with the value `code`, and `redirect_uri` with the escaped version of the redirect URI configured in the App Registration. This endpoint will request users to manually authenticate using their credentials, and then it will redirect back to the redirect URI configured.

The initial redirection can be made from the browser directly, or from the service. In either case, the redirection from Azure will include a `code` query parameter, which then can be used to initialize the `AuthorizationCodeCredential`.

```ts
const credential = new AuthorizationCodeCredential(
  tenantId,
  clientId,
  authorizationCode, // HERE!!!
  redirectUri
);
```

After that code is received, the `AuthorizationCodeCredential` will be able to retrieve access tokens as expected.

## Why do users use AuthorizationCodeCredential?

The [Authorization Code Flow](https://docs.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow) is used to provide interactive authentication to users from any application in any platform. As long as the user can go to the `/authorize` URL, and the redirection to the configured server succeeds, the application is then authenticated in the name of the user.

Interactive authentications are mainly used when applications don't know the user details until the user is actively interacting with the application.

JavaScript developers mainly work on two forms of applications:

- Backend applications for the web (like REST APIs and hosts of single page applications).
- Front-end applications (like the code within a single-page application).

In many cases, JavaScript developers do not know in advance what are the details of their users, such as when using an application that may connect to Azure optionally. In those cases, the Authentication Code Flow is really the only end-user flow possible for JavaScript developers.

Although the redirection could be handled from the browser as well as from Node, our SDK intends to provide a better recourse for browser users through the `InteractiveBrowserCredential`, whereas the Node users have no alternative to use the authentication code flow.

## Current approach

Besides setting up the App Registration to point to the redirect endpoint of the application, developers need to:

1. Make users go to the `/authenticate` endpoint.
2. Handle the redirection from Azure.

To make users go to the `/authenticate` endpoint, developers need to build the authenticate endpoint URI. The current approach is only showcased in one of our manual tests, and goes as follows:

```ts
function getAuthorizeUrl(
  tenantId: string,
  clientId: string,
  scopes: string,
  state: string // IMPORTANT, see below
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state,  // IMPORTANT, see below
  });
  const query = params.toString();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${query}`;
}
```

> **IMPORTANT:**  
> The `state` parameter is necessary for backend apps to identify the metadata around the authentication. For example: the user ID, or the domain of the client application authenticating, in case more than one clients are being served by the same API.

This means that developers using the `AuthorizationCodeCredential` would need to know how to build this URL before they use the credential, and they wouldn't be able to count with documentation to see how to approach this clearly.

Developers would need to make users go to the `/authorize` URI. As long as that is documented, it shouldn't be very challenging.

Here's how it would look for Node.js users using Express:

```ts
app.get(
  "/azureLogin",
  async (req: express.Request, res: express.Response) => {
    // Probably authenticate (non-Azure) the user making this request...

    // Build the /authorize URI.
    const authorizeUrl = getAuthorizeUrl(
      tenantId,
      clientId,
      scope,
      session.username // STATE
    );

    // Redirect the user.
    res.redirect(authorizeUrl);
  }
);
```

After the interactive process finishes, the final redirect needs to be handled. Here's how it would look for developers using Express:

```ts
app.get(
  "/azureResponse",
  async (req: express.Request, res: express.Response): Promise<void> => {
    // The redirect will either contain a "code" or an "error"
    const authorizationCode = req.query["code"];

    // Error handling will probably happen here...

    // If a "state" parameter was sent on the query of the /authorize request,
    // we would be able to receive it back here.
    const username = req.query["state"];

    // We could access and/or update a record on the database,
    // or on an in-memory cache...

    // With the code received, we can create the AuthorizationCodeCredential
    const credential = new AuthorizationCodeCredential(
      tenantId,
      clientId,
      authorizationCode as string,
      redirectUri
    );

    // Then we can retrieve a token calling to `getToken`,
    // or pass the credential to an SDK client, then use the client...

    // Then we should redirect users again to a page they can interact with:
    res.redirect("/");
  }
);
```

Once we have finished the authentication, tokens can be retrieved, and the SDK clients can be used. At this point however, it might not be clear what to do to send authenticated requests to Azure on another endpoint, through a completely separate request to the Express API.

Developers need to figure out how to retrieve the instance of the credential to use it with an SDK client, or to retrieve the instance of the SDK client that was created with the credential, or to retrieve a token and to provide their own credential.

To change the authenticated user, developers need to go through the flow again and store it in a different place.

There's no current notion of "logging out" or removing those credentials from memory. If no persistence is used, and if the access token is not stored in a database, exiting the process will remove any notion of the authenticated account, however if users decide to use persistence caching or if they try to clear the footprint of that account, they will be unable to do so.

## Current issues

1. No detailed sample with express in any of the Azure services.
2. No way to get the `/authorize` URL through the `@azure/identity` package.
3. No recommendation on how to redirect users to the `/authorize` URL.
3. No notion of the `state` parameter.
  - Therefore no way to tie a redirect code with the authenticating user, or with the application the user is coming from.
4. No recommended way to cache the credential per user session (or the token).
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