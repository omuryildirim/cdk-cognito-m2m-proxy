import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { beforeEach, describe, expect, it } from 'vitest';
import { CognitoM2MTokenCacheProxy } from '../../src/L2/CognitoM2MTokenCacheProxy';

describe('CognitoM2MTokenCacheProxy', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' }
    });
  });

  it('creates an API Gateway with the correct name and cache settings', () => {
    new CognitoM2MTokenCacheProxy(stack, 'Proxy', {
      stage: 'dev',
      cognitoTokenEndpointUrl: 'https://example.auth.us-east-1.amazoncognito.com/oauth2/token',
      cacheTtl: Duration.minutes(10),
      cacheSize: '1.6',
      namePrefix: 'Test'
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'Test-Cognito Proxy (dev)',
      Description: 'API Gateway proxy with cache for m2m tokens for Cognito pool'
    });

    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      CacheClusterEnabled: true,
      CacheClusterSize: '1.6'
    });
  });

  it('creates a custom domain and CNAME record if customDomain is provided', () => {
    const certificate = new Certificate(stack, 'Cert', { domainName: 'auth.example.com' });
    const hostedZone = new PublicHostedZone(stack, 'Zone', { zoneName: 'example.com' });

    new CognitoM2MTokenCacheProxy(stack, 'Proxy', {
      stage: 'prod',
      cognitoTokenEndpointUrl: 'https://example.auth.us-east-1.amazoncognito.com/oauth2/token',
      cacheTtl: Duration.minutes(5),
      customDomain: {
        domainName: 'example.com',
        subDomain: 'auth',
        certificate,
        hostedZone
      }
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::DomainName', {
      DomainName: 'auth.example.com'
    });

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'auth.example.com.',
      Type: 'CNAME'
    });
  });

  it('sets up the /oauth2/token POST method with correct integration and caching', () => {
    new CognitoM2MTokenCacheProxy(stack, 'Proxy', {
      stage: 'test',
      cognitoTokenEndpointUrl: 'https://example.auth.us-east-1.amazoncognito.com/oauth2/token',
      cacheTtl: Duration.minutes(15)
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'NONE',
      Integration: {
        IntegrationHttpMethod: 'POST',
        Type: 'HTTP_PROXY',
        Uri: 'https://example.auth.us-east-1.amazoncognito.com/oauth2/token'
      }
    });
  });

  it('sets Authorization header as optional and disables request validator when disableAuthorizationHeaderValidation is true', () => {
    new CognitoM2MTokenCacheProxy(stack, 'Proxy', {
      stage: 'test',
      cognitoTokenEndpointUrl: 'https://example.auth.us-east-1.amazoncognito.com/oauth2/token',
      cacheTtl: Duration.minutes(5),
      disableAuthorizationHeaderValidation: true
    });

    const template = Template.fromStack(stack);

    // Authorization header should be optional (false means not required)
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      RequestParameters: {
        'method.request.header.Authorization': false,
        'method.request.header.Content-Type': false,
        'method.request.querystring.scope': false,
        'method.request.querystring.grant_type': false,
        'method.request.querystring.client_secret': false,
        'method.request.querystring.client_id': false
      }
    });

    // No RequestValidator should be created
    expect(template.findResources('AWS::ApiGateway::RequestValidator')).toEqual({});
  });

  it('sets Authorization header as required and enables request validator when disableAuthorizationHeaderValidation is false or omitted', () => {
    new CognitoM2MTokenCacheProxy(stack, 'Proxy', {
      stage: 'test',
      cognitoTokenEndpointUrl: 'https://example.auth.us-east-1.amazoncognito.com/oauth2/token',
      cacheTtl: Duration.minutes(5)
      // disableAuthorizationHeaderValidation is omitted (defaults to false)
    });

    const template = Template.fromStack(stack);

    // Authorization header should be required (true means required)
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      RequestParameters: {
        'method.request.header.Authorization': true,
        'method.request.header.Content-Type': false,
        'method.request.querystring.scope': false,
        'method.request.querystring.grant_type': false,
        'method.request.querystring.client_secret': false,
        'method.request.querystring.client_id': false
      }
    });

    // RequestValidator should be created
    template.resourceCountIs('AWS::ApiGateway::RequestValidator', 1);
  });
});
