# cdk-cognito-m2m-proxy

[AWS CDK construct package](https://www.npmjs.com/package/cdk-cognito-m2m-proxy) for setting up a cached Amazon API Gateway proxy endpoint with Cognito machine-to-machine (M2M) authentication.

- [Getting started](#getting-started)  
- [Introduction](#introduction)
    - [Token Request Flow](#token-request-flow)
- [Constructs](#constructs)
  - [L2: CognitoM2MTokenCacheProxy](#l2-cognitom2mtokencacheproxy)
    - [Example Usage](#example-usage)
    - [Configuration Options](#configuration-options)
  - [L3: CognitoM2MWithTokenCache](#l3-cognitom2mwithtokencache)
    - [Example Usage](#example-usage-1)
    - [Configuration Options](#configuration-options-1)
- [Cache Considerations](#cache-considerations)
- [Cache Keys](#cache-keys)
 
## Getting Started

### Installation

To use `cdk-cognito-m2m-proxy` in your AWS CDK TypeScript project, install it via npm:

```bash
npm install --save-dev cdk-cognito-m2m-proxy
```

This package has the following peer dependencies, which must also be installed in your project:

- aws-cdk (^2.1013.0)
- aws-cdk-lib (^2.193.0)
- constructs (^10.4.2)
You can install them together using:

```bash
npm install --save-dev aws-cdk@^2.1013.0 aws-cdk-lib@^2.193.0 constructs@^10.4.2
```

### Usage
For detailed example usage, please refer to the [L2 construct usage](#example-usage) and [L3 construct usage](#example-usage-1) sections below.

## Introduction

As AWS [announced](https://aws.amazon.com/about-aws/whats-new/2024/05/amazon-cognito-tiered-pricing-m2m-usage/), a new pricing model has been introduced for AWS Cognito's Machine-to-Machine (M2M) authentication services. Under this model, costs are calculated based on two dimensions ([see detailed pricing](https://aws.amazon.com/cognito/pricing/)):

- A monthly base fee per app client (prorated to the second)
- A per-transaction fee for each successful token response

For applications with frequent token requests, these transaction costs can accumulate rapidly. To help reduce these expenses, AWS [officially recommends](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-caching-tokens.html#amazon-cognito-user-pools-using-tokens-caching-tokens-API-gateway) implementing token caching.

This package provides two AWS CDK constructs that implement token caching via an API Gateway proxy layer. These constructs handle the complexity of setting up a secure and efficient caching mechanism, requiring only that you redirect your token requests to the provided API Gateway endpoint instead of the Cognito endpoint.

#### Token Request Flow

When using these constructs, client applications should direct their token requests to the API Gateway endpoint rather than directly to Cognito:

```mermaid
sequenceDiagram
    autonumber
    participant client as Client
    participant proxy as API Gateway (proxy)
    participant cognito as Cognito User Pool
    participant api as Protected API

    %% Step 1: Client requests token for M2M
    client->>proxy: Request Cognito Token
    alt token not cached
        proxy->>cognito: Authenticate (M2M credentials)
        cognito-->>proxy: ID/Access Token
        proxy-->>proxy: Cache token
        proxy-->>client: Token
    else token is cached
        proxy-->>proxy: Retrieve token from cache
        proxy-->>client: Token from cache
    end

    %% Step 2: Client uses token to call protected API directly
    client->>api: Call Protected Endpoint (with Cognito token)
    api-->>client: API Response
```

1. The client requests a token from the API Gateway endpoint.
2. The API Gateway checks if a matching token response is already cached:
   1. If cached: Returns the cached token (no Cognito charges incurred).
   2. If not cached: Forwards the request to Cognito, caches the response, and then returns the token.
3. Subsequent identical requests within the cache TTL period are served from the cache.

## Constructs

For existing Cognito user pools, the L2 construct `CognitoM2MTokenCacheProxy` adds caching capabilities without requiring modifications to the user pool configuration. For new implementations, the L3 construct `CognitoM2MWithTokenCache` provisions both a Cognito user pool and an integrated caching layer in a single, cohesive solution.

---

### L2: CognitoM2MTokenCacheProxy

This Level 2 (L2) construct creates an API Gateway with caching enabled to serve as a proxy for Cognito token requests. It's designed for use with an existing Cognito user pool, allowing you to add token caching without modifying your current Cognito setup.

#### Example Usage

```typescript
// For an existing Cognito user pool
const tokenCacheProxy = new CognitoM2MTokenCacheProxy(this, 'TokenCacheProxy', {
  stage: props.stage,
  cognitoTokenEndpointUrl: 'https://your-domain.auth.region.amazoncognito.com/oauth2/token',
  cacheTtl: Duration.minutes(55), // Set slightly below your token expiration time
  cacheSize: '0.5', // For light to moderate usage
  namePrefix: 'myapp',
  customDomain: {
    domainName: 'example.com',
    subDomain: 'auth',
    certificate: myCertificate, // ACM certificate for the domain
    hostedZone: myHostedZone // Route 53 hosted zone
  }
});
```

#### Configuration Options

The `CognitoM2MTokenCacheProxyProps` interface provides the following configuration options:

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `stage` | string | Deployment environment (e.g., 'dev', 'staging', 'prod') | Yes |
| `cognitoTokenEndpointUrl` | string | Full URL to your Cognito token endpoint | Yes |
| `cacheTtl` | Duration | Time-to-live for cached tokens | Yes |
| `cacheSize` | string | API Gateway cache size in GB (e.g., "0.5", "1.6", etc.). [See AWS Docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html). | No, default: "0.5" |
| `namePrefix` | string | Optional prefix for resource names | No |
| `enableAuthorizationHeaderValidation` | boolean | Flag to enable Authorization header validation | No |
| `customDomain` | object | Configuration for custom domain setup | No |

> [!Tip]
OAuth2 standard recommends using the Authorization header for client credentials. Refer to [RFC6749](https://datatracker.ietf.org/doc/html/rfc6749#section-2.3.1). Using `enableAuthorizationHeaderValidation` will enforce Authorization header. 

---

### L3: CognitoM2MWithTokenCache

This Level 3 (L3) construct creates a Cognito user pool and an API Gateway with caching enabled as a proxy for token requests. The user pool is exposed for integrating with app clients, resource servers, and other resources.

#### Example Usage

```typescript
const serviceUserPool = new CognitoM2MWithTokenCache(this, 'CognitoPoolWithM2MCache', {
  stage: props.stage,
  cacheTtl: Duration.minutes(50),
  customCacheAPIDomain: {
    domainName: 'example.com',
    subDomain: 'auth',
    certificate: myCertificate, // ACM certificate for the domain
    hostedZone: myHostedZone // Route 53 hosted zone
  }
});
```

#### Configuration Options

The `CognitoM2MWithTokenCacheProps` interface provides the following configuration options:

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `stage` | string | Deployment environment (e.g., 'dev', 'staging', 'prod') | Yes |
| `cacheTtl` | Duration | Time-to-live for cached tokens | Yes |
| `cacheSize` | string | API Gateway cache size in GB (e.g., "0.5", "1.6", etc.). [See AWS Docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html). | No, default: "0.5" |
| `namePrefix` | string | Optional prefix for resource names | No |
| `userPoolProps` | CognitoUserPoolProps | Optional properties for custom Cognito User Pool settings | No |
| `enableAuthorizationHeaderValidation` | boolean | Flag to enable Authorization header validation | No |
| `customCacheAPIDomain` | object | Configuration for custom domain setup | No |

> [!Tip]
OAuth2 standard recommends using the Authorization header for client credentials. Refer to [RFC6749](https://datatracker.ietf.org/doc/html/rfc6749#section-2.3.1). Using `enableAuthorizationHeaderValidation` will enforce Authorization header. 

The construct exposes the user pool so it can be used to create app clients, resource servers, etc., as you normally would.

```typescript
// Example: Create a custom resource server scope
const todoReadScope = new ResourceServerScope({
  scopeName: "todo:read",
  scopeDescription: "todo read scope",
});

// Attach the scope to a resource server
const todoApiResourceServer = new UserPoolResourceServer(this, `TodoApi`, {
  identifier: `TodoApi`,
  userPool: serviceUserPool.userPool, // Reference from the construct
  scopes: [todoReadScope]
});

// Create an app client that uses the scope
new UserPoolClient(this, `AppClient`, {
  userPool: serviceUserPool.userPool, // Reference from the construct
  accessTokenValidity: Duration.minutes(60),
  generateSecret: true,
  refreshTokenValidity: Duration.days(1),
  enableTokenRevocation: true,
  oAuth: {
    flows: {
      clientCredentials: true,
    },
    scopes: [
      OAuthScope.resourceServer(
        todoApiResourceServer,
        todoReadScope
      )
    ],
  },
});
```

---

## Cache Considerations

- Use a **cache TTL** slightly below your token expiration time to ensure optimal caching while avoiding expired tokens.
- Choose a **cache size** appropriate for your workload:
  - '0.5' for light to moderate usage (up to ~1000 requests/second). Start small and scale as needed; 0.5 GB is often sufficient.
  - Larger sizes are available for higher throughput. **Note:** Different sizes incur different costs.
- Tokens are cached based on authorization header and scope parameters, ensuring proper isolation between different clients.

## Cache Keys

These constructs use a cache key that includes the following parameters:

| **Cache Key Name**            | **Type**       | **Description**                                                                  |
|-------------------------------|----------------|----------------------------------------------------------------------------------|
| `Authorization`               | Header         | The `Authorization` header containing client credentials (e.g., Basic Auth).     |
| `Content-Type`                | Header         | The `Content-Type` header specifying the format of the request body (e.g., application/x-www-form-urlencoded).|
| `scope`                       | Query String   | The `scope` query string parameter defining the requested permissions.           |
| `grant_type`                  | Query String   | The `grant_type` query string parameter specifying the OAuth grant type.         |
| `client_secret`               | Query String   | The `client_secret` query string parameter for client authentication.            |
| `client_id`                   | Query String   | The `client_id` query string parameter identifying the client application.       |
| `bodyCacheKey`                | Custom         | A custom parameter derived from the POST request body to ensure cache uniqueness even if parameters are sent in the body.|
