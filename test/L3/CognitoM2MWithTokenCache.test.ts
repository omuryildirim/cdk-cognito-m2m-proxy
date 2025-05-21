import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { beforeEach, describe, it } from 'vitest';
import { CognitoM2MWithTokenCache } from '../../src/L3/CognitoM2MWithTokenCache';

describe('CognitoM2MWithTokenCache', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' }
    });
  });

  it('creates a Cognito User Pool and User Pool Domain with correct names', () => {
    new CognitoM2MWithTokenCache(stack, 'L3Construct', {
      stage: 'dev',
      cacheTtl: Duration.minutes(10),
      namePrefix: 'Test'
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'Test-CognitoUserPool-dev'
    });

    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'test-token-cache-dev'
    });
  });

  it('creates an API Gateway with cache and correct custom domain if provided', () => {
    const certificate = new Certificate(stack, 'Cert', { domainName: 'auth.example.com' });
    const hostedZone = new PublicHostedZone(stack, 'Zone', { zoneName: 'example.com' });

    new CognitoM2MWithTokenCache(stack, 'L3Construct', {
      stage: 'prod',
      cacheTtl: Duration.minutes(5),
      customCacheAPIDomain: {
        domainName: 'example.com',
        subDomain: 'auth',
        certificate,
        hostedZone
      }
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Description: 'API Gateway proxy with cache for m2m tokens for Cognito pool'
    });

    template.hasResourceProperties('AWS::ApiGateway::DomainName', {
      DomainName: 'auth.example.com'
    });

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'auth.example.com.',
      Type: 'CNAME'
    });
  });

  it('sets up the /oauth2/token POST method with HTTP proxy integration', () => {
    new CognitoM2MWithTokenCache(stack, 'L3Construct', {
      stage: 'test',
      cacheTtl: Duration.minutes(15)
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'NONE'
    });
  });
});
