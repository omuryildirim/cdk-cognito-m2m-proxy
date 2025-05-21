import type { Duration } from 'aws-cdk-lib';
import type { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import type { IHostedZone } from 'aws-cdk-lib/aws-route53';

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
}
