import type { Duration } from 'aws-cdk-lib';
import {
  EndpointType,
  HttpIntegration,
  RequestValidator,
  RestApi
} from 'aws-cdk-lib/aws-apigateway';
import type { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { CnameRecord, type IHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

/**
 * Properties for configuring an API Gateway proxy with caching capabilities
 * for Cognito machine-to-machine (M2M) token requests.
 */
export interface CognitoM2MTokenCacheProxyProps {
  /**
   * The deployment stage or environment (e.g., 'dev', 'staging', 'prod').
   * Used for naming resources and determining environment-specific configurations.
   */
  stage: string;

  /**
   * The target Cognito OAuth token endpoint URL to proxy requests to.
   * Example: 'https://your-domain.auth.region.amazoncognito.com/oauth2/token'
   */
  cognitoTokenEndpointUrl: string;

  /**
   * The time-to-live duration for cached tokens in the API Gateway cache.
   * Determines how long tokens will be cached before a new request is made.
   */
  cacheTtl: Duration;

  /**
   * The size of the API Gateway cache cluster.
   * Valid values: '0.5', '1.6', '6.1', '13.5', '28.4', '58.2', '118', '237'.
   * @default '0.5'
   */
  cacheSize?: string;

  /**
   * Optional prefix for resource names.
   * Useful when deploying multiple instances of this construct in the same stack.
   * @default - No prefix is used
   */
  namePrefix?: string;

  /**
   * Configuration for the custom domain for the API Gateway.
   */
  customDomain?: {
    /**
     * The root domain for the API Gateway.
     * Example: 'example.com'
     */
    domainName: string;
    /**
     * The subdomain for the API Gateway. This will be used to generate the
     * full url and CNAME record.
     * Example: 'auth.example.com'
     */
    subDomain: string;
    /**
     * An AWS Certificate Manager certificate for the custom domain.
     * Must be valid for the combination of subdomain and domain.
     * Needs to be created in the 'us-east-1' region.
     */
    certificate: Certificate;
    /**
     * The hosted zone for the custom domain.
     * This is used to create a CNAME record for the custom domain.
     */
    hostedZone: IHostedZone;
  };

  /**
   * Flag to enable Authorization header validation.
   * OAuth2 standard recommends using the Authorization header for client credentials.
   * Refer to: https://datatracker.ietf.org/doc/html/rfc6749#section-2.3.1
   */
  enableAuthorizationHeaderValidation?: boolean;
}

export class CognitoM2MTokenCacheProxy extends Construct {
  public readonly api: RestApi;

  constructor(scope: Construct, id: string, props: CognitoM2MTokenCacheProxyProps) {
    super(scope, id);

    const {
      stage,
      cognitoTokenEndpointUrl,
      cacheTtl,
      customDomain,
      cacheSize = '0.5',
      namePrefix,
      enableAuthorizationHeaderValidation
    } = props;

    const resolvedNamePrefix = namePrefix ? `${namePrefix}-` : '';

    // Create the API Gateway
    this.api = new RestApi(this, `${resolvedNamePrefix}CognitoApiProxy-${stage}`, {
      restApiName: `${resolvedNamePrefix}Cognito Proxy (${stage})`,
      description: 'API Gateway proxy with cache for m2m tokens for Cognito pool',
      ...(customDomain && {
        domainName: {
          domainName: `${customDomain.subDomain}.${customDomain.domainName}`,
          certificate: customDomain.certificate,
          endpointType: EndpointType.EDGE
        }
      }),
      deployOptions: {
        stageName: stage,
        cacheClusterEnabled: true,
        cacheDataEncrypted: true,
        cacheClusterSize: cacheSize,
        cacheTtl,
        methodOptions: {
          '/oauth2/token/POST': {
            cachingEnabled: true,
            cacheTtl
          }
        }
      }
    });

    // Add HTTP integration
    const httpProxyIntegration = new HttpIntegration(cognitoTokenEndpointUrl, {
      httpMethod: 'POST',
      proxy: true,
      options: {
        cacheKeyParameters: [
          // These cache key parameters are used to ensure that the API Gateway cache
          // correctly differentiates between requests that may result in different
          // Cognito tokens or responses. Caching based on these values prevents
          // returning an incorrect token when the input parameters differ.
          //
          // - 'method.request.header.Authorization': Different Authorization headers (if used) could result in different tokens.
          // - 'method.request.header.Content-Type': Some M2M token requests may vary (e.g., form vs. JSON) based on content type.
          // - 'method.request.querystring.scope': The requested scope(s) affect the granted token's permissions and value.
          // - 'method.request.querystring.grant_type': The OAuth2 grant type (e.g., client_credentials) determines token behavior and validity.
          // - 'method.request.querystring.client_secret': Different client secrets may produce different tokens or errors.
          // - 'method.request.querystring.client_id': Different client IDs (applications) will result in different tokens.
          // - 'integration.request.querystring.bodyCacheKey': API Gateway does allow caching based on the request body. Since the body is
          //     not available in the request parameters, we use a custom cache key to cache based on the request body.
          'method.request.header.Authorization',
          'method.request.header.Content-Type',
          'method.request.querystring.scope',
          'method.request.querystring.grant_type',
          'method.request.querystring.client_secret',
          'method.request.querystring.client_id',
          'integration.request.querystring.bodyCacheKey'
        ],
        requestParameters: {
          'integration.request.querystring.bodyCacheKey': 'method.request.body'
        }
      }
    });

    const methodOptions = {
      requestParameters: {
        'method.request.header.Authorization': !!enableAuthorizationHeaderValidation,
        'method.request.header.Content-Type': false,
        'method.request.querystring.scope': false,
        'method.request.querystring.grant_type': false,
        'method.request.querystring.client_secret': false,
        'method.request.querystring.client_id': false
      },
      ...(enableAuthorizationHeaderValidation && {
        requestValidator: new RequestValidator(this, `RequestValidator-${stage}`, {
          restApi: this.api,
          requestValidatorName: `${resolvedNamePrefix}M2MTokenRequestValidator-${stage}`,
          validateRequestParameters: true,
          validateRequestBody: false
        })
      })
    };

    const oauthTokenResource = this.api.root.addResource('oauth2').addResource('token');
    oauthTokenResource.addMethod('POST', httpProxyIntegration, methodOptions);

    // Add a cname record for the custom domain
    if (customDomain && this.api.domainName) {
      new CnameRecord(this, 'CustomDomainAliasRecord', {
        recordName: customDomain.subDomain,
        zone: customDomain.hostedZone,
        domainName: this.api.domainName.domainNameAliasDomainName
      });
    }
  }
}
