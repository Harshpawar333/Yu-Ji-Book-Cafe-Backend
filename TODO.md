# Yu-Ji Book Café POS - Lambda Migration TODO

## ✅ Completed
- [x] Install serverless framework and dependencies
- [x] Create lambda.js handler
- [x] Create serverless.yml configuration
- [x] Update server.js to export app (Lambda compatible)
- [x] Create deployment script

## 🔄 Testing & Development

### Local Testing with Serverless Offline
- [ ] Test locally with: `npx serverless offline`
- [ ] Verify all routes work: `/api/customers`, `/api/menu`, `/api/orders`, etc.
- [ ] Test health check endpoint: `/api/health`
- [ ] Test with frontend (update VITE_API_BASE_URL to http://localhost:3001)
- [ ] Test CORS from frontend
- [ ] Verify Supabase connection in serverless-offline mode
- [ ] Test with different HTTP methods (GET, POST, PATCH, DELETE)
- [ ] Load test to check cold start performance

### Code Optimization
- [ ] Reduce JSON payload limit from 10MB to 6MB in server.js (Lambda limit)
  ```javascript
  app.use(express.json({ limit: "6mb" }));
  ```
- [ ] Review and optimize Supabase queries for Lambda timeout (29s max)
- [ ] Add connection pooling optimization for Supabase client
- [ ] Minimize dependencies to reduce Lambda package size
- [ ] Consider removing unused routes/dependencies

## 🚀 AWS Deployment Preparation

### AWS Account Setup
- [ ] Install AWS CLI: `brew install awscli` (macOS)
- [ ] Configure AWS credentials: `aws configure`
  - AWS Access Key ID
  - AWS Secret Access Key
  - Default region: ap-south-1 (Mumbai)
  - Default output format: json
- [ ] Create IAM user with Lambda deployment permissions
- [ ] Set up AWS credentials profile for different environments

### Environment Variables & Secrets
- [ ] Move secrets to AWS Systems Manager Parameter Store:
  ```bash
  aws ssm put-parameter --name "/yuji-pos/dev/SUPABASE_URL" --value "your-url" --type "String"
  aws ssm put-parameter --name "/yuji-pos/dev/SUPABASE_PUBLISHABLE_KEY" --value "your-key" --type "SecureString"
  aws ssm put-parameter --name "/yuji-pos/dev/SUPABASE_SERVICE_ROLE_KEY" --value "your-key" --type "SecureString"
  aws ssm put-parameter --name "/yuji-pos/dev/JWT_SECRET" --value "your-secret" --type "SecureString"
  ```
- [ ] OR use AWS Secrets Manager for better security
- [ ] Update serverless.yml to reference SSM parameters
- [ ] Create separate parameter sets for dev/staging/production

### Initial Deployment
- [ ] Deploy to dev stage: `./deploy.sh dev`
- [ ] Test deployed endpoint
- [ ] Check CloudWatch logs for any errors
- [ ] Verify API Gateway configuration
- [ ] Test CORS from production frontend domain

## 📊 Monitoring & Observability

### CloudWatch
- [ ] Enable CloudWatch logs for Lambda function
- [ ] Set up log retention (7-30 days)
- [ ] Create CloudWatch dashboard with:
  - Invocation count
  - Error rate
  - Duration/latency
  - Throttles
  - Cold start metrics
- [ ] Set up CloudWatch alarms:
  - Error rate > 5%
  - Average duration > 3s
  - Cold start > 3s
  - Throttles detected

### X-Ray Tracing
- [ ] Enable AWS X-Ray in serverless.yml:
  ```yaml
  provider:
    tracing:
      lambda: true
      apiGateway: true
  ```
- [ ] Add X-Ray SDK to instrument code
- [ ] Review traces for performance bottlenecks

### Cost Monitoring
- [ ] Set up AWS Budgets with alerts
- [ ] Monitor Lambda invocation costs
- [ ] Track API Gateway request costs
- [ ] Review CloudWatch logs costs

## 🔒 Security & Performance

### API Gateway
- [ ] Configure custom domain: api.yuji-cafe.com
- [ ] Set up AWS WAF rules:
  - Rate limiting (per IP)
  - SQL injection protection
  - XSS protection
- [ ] Enable API throttling: 100 requests/second
- [ ] Configure request validation
- [ ] Add API keys for external integrations (if needed)

### Lambda Optimization
- [ ] Test cold start times (target: <2s)
- [ ] Enable provisioned concurrency for production (if needed):
  ```yaml
  functions:
    api:
      provisionedConcurrency: 1
  ```
- [ ] Configure reserved concurrency limits
- [ ] Optimize Lambda memory (test 512MB, 1024MB)
- [ ] Review Lambda timeout (currently 29s)

### Network & VPC
- [ ] Evaluate if VPC is needed (adds cold start latency)
- [ ] If VPC required:
  - Create VPC with private/public subnets
  - Configure NAT Gateway for internet access
  - Update serverless.yml with VPC config
  - Add VPC endpoints for AWS services

## 🏗️ Infrastructure as Code

### Multi-Environment Setup
- [ ] Create separate stages: dev, staging, production
- [ ] Create stage-specific serverless configs:
  - `serverless.dev.yml`
  - `serverless.staging.yml`
  - `serverless.prod.yml`
- [ ] Set up different AWS accounts/regions per stage (optional)
- [ ] Configure stage-specific environment variables

### CI/CD Pipeline
- [ ] Set up GitHub Actions workflow:
  - Run tests on PR
  - Deploy to dev on merge to develop branch
  - Deploy to staging on merge to staging branch
  - Deploy to prod on release tags
- [ ] Add deployment approval for production
- [ ] Configure automatic rollback on errors
- [ ] Set up Slack/email notifications for deployments

## 🌐 Frontend Integration

### Update Frontend Configuration
- [ ] Update `VITE_API_BASE_URL` in frontend:
  - Dev: Lambda dev endpoint
  - Production: Lambda prod endpoint or custom domain
- [ ] Test all API calls from frontend
- [ ] Verify CORS configuration works
- [ ] Update error handling for Lambda-specific errors
- [ ] Add loading states for cold start delays

### DNS & Domain
- [ ] Register custom domain (if not already)
- [ ] Create SSL certificate in AWS ACM
- [ ] Configure custom domain in API Gateway
- [ ] Update Route53 DNS records
- [ ] Update CORS allowed origins

## 📦 Deployment Process

### Pre-Deployment Checklist
- [ ] Run all tests: `npm test`
- [ ] Test locally with serverless-offline
- [ ] Review changes in git
- [ ] Update version in package.json
- [ ] Create git tag for release

### Deployment Steps
1. [ ] Deploy to dev: `./deploy.sh dev`
2. [ ] Test dev environment thoroughly
3. [ ] Deploy to staging: `./deploy.sh staging`
4. [ ] Run integration tests on staging
5. [ ] Deploy to production: `./deploy.sh prod`
6. [ ] Smoke test production
7. [ ] Monitor CloudWatch for 30 minutes

### Post-Deployment
- [ ] Verify all endpoints working
- [ ] Check CloudWatch metrics
- [ ] Review error logs
- [ ] Test from multiple regions (if global)
- [ ] Update documentation with new endpoints
- [ ] Notify team of deployment

## 🔧 Maintenance & Operations

### Regular Tasks
- [ ] Review CloudWatch logs weekly
- [ ] Check cost dashboard monthly
- [ ] Update dependencies quarterly
- [ ] Review and rotate secrets quarterly
- [ ] Performance testing quarterly

### Backup & Disaster Recovery
- [ ] Document rollback procedure
- [ ] Test rollback process
- [ ] Keep previous 5 deployments available
- [ ] Document incident response plan

### Documentation
- [ ] Update README with Lambda deployment instructions
- [ ] Document architecture diagram
- [ ] Create runbook for common issues
- [ ] Document monitoring and alerting
- [ ] Create troubleshooting guide

## 🎯 Quick Commands Reference

```bash
# Local development
npm run dev                          # Run Express locally (port 3001)
npx serverless offline              # Run with serverless-offline

# Testing
npm test                            # Run tests
npx serverless invoke local -f api  # Test Lambda locally

# Deployment
./deploy.sh dev                     # Deploy to dev
./deploy.sh staging                 # Deploy to staging  
./deploy.sh prod                    # Deploy to production

# Monitoring
npx serverless logs -f api --stage dev --tail  # Watch logs
npx serverless info --stage dev                # Get endpoint info

# Cleanup
npx serverless remove --stage dev              # Remove stack
```

## 📝 Notes

- Lambda cold start: ~1-2s (optimize if needed)
- API Gateway timeout: 29s max (Lambda timeout should be less)
- Lambda payload limit: 6MB (reduced from 10MB)
- Supabase is serverless-friendly (no persistent connections)
- Consider Edge functions for lower latency (CloudFront + Lambda@Edge)
