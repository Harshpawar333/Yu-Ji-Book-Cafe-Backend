/**
 * AWS Lambda Handler for Yu-Ji Book Café POS Backend
 * 
 * This handler wraps the Express app for serverless deployment.
 * It uses aws-serverless-express to bridge AWS Lambda events with Express.
 */

const awsServerlessExpress = require('aws-serverless-express');
const app = require('./server');

// Create the server from the Express app
const server = awsServerlessExpress.createServer(app);

/**
 * Lambda handler function
 * @param {Object} event - AWS Lambda event object
 * @param {Object} context - AWS Lambda context object
 * @returns {Promise} Response from Express app
 */
exports.handler = (event, context) => {
  console.log('Lambda invoked:', {
    httpMethod: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString()
  });

  // Use callbackWaitsForEmptyEventLoop to optimize cold starts
  context.callbackWaitsForEmptyEventLoop = false;

  return awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
};
