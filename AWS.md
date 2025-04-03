### Create an IAM Role for your lambda function

1. Go to the IAM service in AWS
2. Select Roles and then choose Create Role
3. Use "AWS service" for the "Trusted entity type" and find "Lambda" in the "Use case" selector.
4. Press Next.
5. Type "AWSLambdaBasicExecutionRole" into the Filter box, then check the box next to that role.
6. Choose "Next Step"
7. Enter your role name (GitGatewayLambda)
8. Create Role


### Create Lambda function for handling requests

1. Go to the Lambda service in AWS
2. Create function
3. Use the "Author from scratch" option
4. Enter the function name
5. Use "Node.js 22.x" as the runtime
6. Expand the "Change default execution role", select "Use an existing role" and choose the role you created above ("GitGatewayLambda").
7. Press the "Create function" button to create the Lambda
8. Scroll down to the Code section and upload your code as a Zip file. Necessary files:
    * index.mjs
    * bitbucket.mjs
9. Add environment variables to the Configuration / Environment Variables section of the Lambda


### Create a new API Gateway

1. Go to the API Gateway service of AWS.
2. Choose "Create API"
3. Press the "Build"  button in the "HTTP API" section
4. Enter a name ("GitGatewayApi")
5. Add an integration, type Lambda, and choose your Lambda function you created above. Use Version 2.0.
6. Press the "Next" button.
7. Add the following routes:
    * ANY /git-gateway/bitbucket/{proxy+}
    * OPTIONS /git-gateway/bitbucket/{proxy+}
    * GET /api/v2/components.json
8. Press the "Review and create" button
9. Press the "Create" button

### Add authentication to the API Gateway

1. In the API gateway you created, view the Routes and select the "ANY /git-gateway/bitbucket/{proxy+}" route
2. Press the "Attach authorization" button
3. Press the "Create and attach an authorizer" button
4. Use the "JWT" authorizer type with the following settings:
    * Name: Enter any name
    * Identity source: `$request.header.Authorization`
    * Issuer URL: Your JWT issuer URL
    * Audience: optional -- enter the `aud` value or another string expected in user JWTs
5. Press the "Create and attach" button
6. The authorizer should only be attached to the "ANY "/git-gateway/bitbucket/{proxy+}" route. The "OPTIONS /git-gateway/bitbucket/{proxy+}" and "GET /api/v2/components.json" routes should be left unauthorized.

### Add CORS to the API Gateway

1. In the API gateway, view the CORS settings.
2. Add your origins to the Access-Control-Allow-Origin settings:
    * Examples: http://localhost:8080, https://my.example.com
3. Add "content-type" to the Access-Control-Allow-Headers
4. Add "POST" to the Access-Control-Allow-Methods
