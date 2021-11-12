# OnBehalfOfCredential challenge

## What is the OnBehalfOfCredential?

`OnBehalfOfCredential` allows users to retrieve access tokens on behalf of a specific App Registration (call it APP 1) ONLY IF they have a token previously retrieved with access to that specific app registration (APP 1).

> Documentation about the On-Behalf-Of flow: https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow

To configure the Azure App Registration, on the Azure Portal users would:

1. Select Active Directory > App registrations.
2. Go to the app you want to authenticate against.
3. On the left menu, select Expose an API > Add a scope.

The Target App Registration must also have admin consent, which can be granted as follows:

1. Select Active Directory > App registrations.
2. Go to the app you want to authenticate against.
3. On the left menu, select API permissions > Grant admin consent.

In the application that uses this credential, developers would need to first authenticate with another credential using the scope created through the steps above, then use the resulting token to call to the `OnBehalfOfCredential`, as follows:

```ts
const credential = new InteractiveBrowserCredential({ clientId });

const token = await credential.getToken("api://AAD_APP_CLIENT_ID/Read");

const oboCred = new OnBehalfOfCredential({
  tenantId: "TENANT",
  clientId: "AAD_APP_CLIENT_ID",
  clientSecret: "AAD_APP_CLIENT_SECRET",
  userAssertionToken: token.token
});

const token2 = await oboCred.getToken("https://storage.azure.com/.default");
```

After that code is received, the `AuthorizationCodeCredential` will be able to retrieve access tokens as expected.

## Why do developers use OnBehalfOfCredential?

The `OnBehalfOfCredential` is useful to grant access to a set of protected resources to specific users who previously authenticated with a less permissive credential.

Interactive credentials (public applications, as called by Azure) have several disadvantages for some scenarios, since:

1. They require user interaction.
2. They will require user interaction when the token expires.
3. They send sensitive information through the network (at a bare-minimum a valid "code").

It's common that Azure consumers may put resources outside of the access of public App Registrations. A common flow would be:

1. Have users authenticate with a public app registration via the `AuthorizationCodeCredential`. This will give them access to a group of resources A.
2. To give them limited access to a group of resources B, allow them to authenticate On-Behalf-Of an App Registration with access to Resources B on a controlled environment.

For JavaScript developers, the `OnBehalfOfCredential` will look specially interesting if they have a browser application that already authenticated using the `InteractiveBrowserCredential`. Which means that:

1. They have obtained an access token though a public application.
2. They have this authenticated credential in the browser.
3. This credential can only access Azure resources that allow CORS requests.

In that case, developers can send the authenticated token to the server, and use the `OnBehalfOfCredential` in the server to retrieve special information from the resources inaccessible from the first token.

More concisely, `OnBehalfOfCredential` is to JavaScript developers a way to grant special access in a secure environment to a token retrieved using the `InteractiveBrowserCredential`.

## What is the browser version of the InteractiveBrowserCredential?

The browser version of the `InteractiveBrowserCredential` allows users to retrieve access tokens from a single-page application. It uses the `AuthorizationCodeFlow`, but it uses an `SPA` endpoint, meaning that they expect the authentication to redirect back to the single-page application, which will then call to getToken from the browser execution of the JavaScript code, and not from the backend.

> Documentation about the endpoint in relation to the Authorization Code flow is available here: https://docs.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow#1-get-an-authorization-code

To configure the Azure App Registration, on the Azure Portal users would:

- On the "Authentication" page of the App Registration:
  - Under "Supported Account Types", select `Accounts in any organizational directory (Any Azure AD directory - Multitenant)` .
- Under "Platform Configurations":
  - Users would need to add a platform and select "SPA".
  - Users then would add a specific URI to their server.
  - If they're working with a localhost single-page application, they may put something similar to `http://localhost:8080/path` as the redirect URI.
  - Users would finally click "Configure".

One important point is that, in practice, some customers would rather have a single redirect URI for many single-page applications. In those cases, the redirect URI would point to a path that would execute some back-end code that would receive the authentication information and some other metadata (like a "state" parameter), and use the metadata to determine to what single-page application to redirect to. One can imagine this Express code as follows:

```ts
app.get(
  "/azureResponse",
  async (req: express.Request, res: express.Response): Promise<void> => {
    // The redirect will either contain a "code" or an "error"
    const authorizationCode = req.query["code"];

    // Error handling will probably happen here...

    // If a "state" parameter was sent on the query of the /authorize request,
    // we would be able to receive it back here.
    const singlePageApplicationPath = req.query["state"];

    // Then we should redirect to the single-page application based on the state...
    res.redirect(`${singlePageApplicationPath}/?code=${authorizationCode}`);
  }
);
```

It's important to note that the current `InteractiveBrowserCredential` does not allow users to provide metadata for a scenario similar to the above one.

## Current approach

Besides setting up the App Registration to point to the redirect endpoint of the application, developers need to:

1. Authenticate on the browser.
  - Using either popup or redirect.
2. Handle the redirection from Azure IN THE BROWSER.
3. Send the browser token to the backend.
4. Use the `OnBehalfOfCredential` in the backend.

To initiate authentication on the browser, uses would use the `InteractiveBrowserCredential`. In principle, it's possible to use this credential only providing a `clientId`, as follows:

```ts
const clientId = "my-client-id";
const credential = new InteractiveBrowserCredential({
  clientId,
  // loginStyle: "redirect"
})
```

If no `loginStyle` is provided, this credential will use the `popup` login style.

If no `loginStyle` is provided, users are able to wait for the token using `await`, as follows:

```ts
const accessToken = await credential.getToken(scope);
```

This call will open a popup window, and after users finish the interactive flow, the promise will resolve with an access token.

The `popup` approach is not ideal because many browsers prevent popups from appearing. In those cases, users will need to manually enable popups before continuing to work with the browser app.

If users prefer to use the redirect approach, they will need to specify the `loginStyle` as `redirect`. When doing so, users will need to process the redirection on page load. The best way to do this at the moment is to initialize the credential and call to `getToken` on page load, as follows:

```ts
window.onload = async () => {
  const clientId = "my-client-id";
  const credential = new InteractiveBrowserCredential({
    clientId,
    // loginStyle: "redirect"
  })
  const accessToken = await credential.getToken(scope);
  // Once they have a token, silent authentication will work in the rest of the app.
}
```

Once they have a token, silent authentication will work in the rest of the application.

The credential is able to authenticate using the received code from the redirection at any point in the application, however, the longer it takes for the code to reach the point where a token is requested (explicitly through `getToken`, or implicitly through one of the SDK client methods), the higher the risk to have something else change the hash of the page, thus losing the ability to authenticate, and forcing the credential to trigger the redirection the next time `getToken` is called.

It's also important to note that, once a user is authenticated, a single credential can't authenticate another user, or logout.

Logout is particularly important because the endpoint used to authenticate single-page applications can cache the credentials that succeeded the last time, making it impossible to willingly change the authenticated user unless the browser local cached memory on the Azure endpoint side is cleared.

To link the browser flow with the On-Behalf-Of flow, applications would need to ensure the `scope` used to authenticate matches the custom scope of the application that has the client ID that will be used from the backend, at the time the `OnBehalfOfCredential` is created. There's currently no obvious way to notice this scope requirement, other than reading the docs very carefully.

Once they have authenticated with the correct scope, they will be able to send that access-token to the service via a POST request. An example would be as follows:

```ts
async function doServiceRequest() {
  // Get an access token silently from the already-authenticated credential,
  // using a custom scope created for the application that will be used at the time the OnBehalfOfCredential is instantiated.
  const onBehalfOfScope = "api://AAD_APP_CLIENT_ID/Read";
  const accessToken = await credential.getToken(onBehalfOfScope);

  // Build formData object.
  let formData = new FormData();
  formData.append('userAssertionToken', accessToken);

  await fetch("/azureServiceRequestPath", {
    method: "post",
    body: 
  })
}
```

From the service side, this POST request with the access-token would allow the service to retrieve a token using the On-Behalf-Of flow, as follows:

```ts
app.post(
  "/azureServiceRequestPath",
  async (req: express.Request, res: express.Response): Promise<void> => {
    // Check that we're logged in, and that we have authenticated before...

    // Retrieve the SPA access token from the request body:
    const userAssertionToken = req.body.userAssertionToken;

  const oboCred = new OnBehalfOfCredential({
    tenantId: "TENANT",
    clientId: "AAD_APP_CLIENT_ID",
    clientSecret: "AAD_APP_CLIENT_SECRET",
    userAssertionToken
  });

    // use the credential...
  }
);
```

## Current issues

1. There's no current way to pass metadata to the authentication endpoint in order to route multiple single-page applications from a single backend endpoint.
2. Although the `loginStyle` parameter allows users to change how the authentication happens, it is currently implied that changing this property will have no effect on how the architecture of the application needs to be.
3. No acknowledgement of the possibility of multiple users being authenticated in the browser.
4. No way to log out.
5. No sample using browser authentication and then using the `OnBehalfOfCredential`.
6. There's no in-code reference to the necessary scope the browser credential must use in order to be used later in the On-Behalf-Of-Flow.

## Draft of a new approach

Consider we would create a draft using browser authentication and then using the `OnBehalfOfCredential`. On the Node.js side, it shouldn't be a problem to keep the current `OnBehalfOfCredential` as is since it supports any token, and it has no way to distinguish a good token from a bad one.

On the client side, to facilitate initializing a credential that will then target the `OnBehalfOfCredential` on the browser side, we provide a new method that will validate the scope used on the first credential, as follows:

```ts
const credential = new InteractiveBrowserCredential({ clientId });

// The main point here is to have an obvious way for users to know they are using an OBO scope.
// On the docs related to the OnBehalfOfCredential, we would always use this method.
const oboScope = validateOBOScope("api://AAD_APP_CLIENT_ID/Read");

const token = await credential.getToken(oboScope);

const oboCred = new OnBehalfOfCredential({
  tenantId: "TENANT",
  clientId: "AAD_APP_CLIENT_ID",
  clientSecret: "AAD_APP_CLIENT_SECRET",
  userAssertionToken: token.token
});

// This is the target service scope, so this remains unchanged.
const token2 = await oboCred.getToken("https://storage.azure.com/.default");
```

Now, let's focus on the changes we can provide to the browser experience.

First, since the `popup` login vs the `redirect` login change heavily how an application is structured, we could separate the `InteractiveBrowserCredential` in two:

- `SPAPopupCredential`.
- `SPARedirectCredential`.

These credentials would be:

- Part of a new plugin package, `@azure/identity-browser`.
- Named after the `spa` redirect endpoint on the AAD app registration.
- Throws on Node.js (not isomorphic).

`SPAPopupCredential` would have:

- Would work exactly as the default behavior of the `InteractiveBrowserCredential` today (using the `popup` login style).
- Uses will be able to call `getToken` anytime, even through SDK methods, and trust the credential will authenticate and then their code will proceed as usual, without page reload.

`SPARedirectCredential` would have:

- `disableAutomaticAuthentication` set to true (can't change it).
  - Meaning that if `getToken` can't authenticate silently, an `AuthenticationRequiredError` is thrown and the manual flow can be triggered then.
- Would have a method called `onPageLoad()`, that would make it obvious to users that it would need to be executed on page load.

```ts
const credential = new SPARedirectCredential(clientId);
const client = new Client("url", credential);

window.onload = () => {
  await credential.onPageLoad();
}

async function authenticate(): boolean {
  // To manually authenticate only if getToken throws an AuthenticationRequiredError
  try {
    await credential.getToken(scope);
    return true;
  } catch(e) {
    if (e.name === "AuthenticationRequiredError") {
      await credential.authenticate();
      // Redirect happens.
    }
    return false;
  }
}

async function getAzureValues() {
  await client.method(); // Will throw if the token is expired, or if the user hasn't authenticated.
}
```

IMPORTANT: Could we provide a method to clear the cache?