# git-gateway-node

A serverless Node.js implementation of the [Netlify git-gateway application](https://github.com/netlify/git-gateway), written for AWS Lambda.

Allows proxied access to Git servers (Bitbucket, more to come) using your own user pool.

Provides a serverless approach on AWS, using Lambda, API Gateway, and Cognito.

## Why Write a New Version?

Netlify Identity, the user management component tied to the original Netlify git-gateway, has been deprecated and appears to be slowly being removed by Netlify. The original git-gateway, also by Netlify, also appears to be abandoned.

In order to allow users to set up their own low-cost implementations of the git-gateway stack, I created this application.

## How It Works

* AWS Cognito is your user pool, where you create and manage the users that can access your system.
* AWS Lambda is the serverless application, which handles requests to proxy to your actual Git repository. Users are assigned to specific repositories along with access keys, so that the Decap CMS can view and edit the repository files for the assigned users.
* AWS API Gateway exposes the serverless application to the Internet, including authentication and CORS.

## Installation and Configuration

Follow the instructions in the [AWS.md](AWS.md) file for setting up a full AWS stack.

Once you have your Lambda function defined, you need to grant access to users. Right now, that is done through environment variables, although that could be improved eventually.

To add a user to the Lambda, find their user ID (by default, the `username` claim of their JWT). Convert all characters that are not `a-z`, `A-Z`, `0-9`, or `_` to an underscore. That is the normalized username.

### Bitbucket

In the Lambda "Environment Variables" configuration, create these three environment variables for that user. In this example, "my_username_example_com" is the example normalized username:

* `BB_USER_my_username_example_com_REPO`: Set to the Bitbucket repository name, including the workspace. Example: "myworkspace/myrepo"
* `BB_USER_my_username_example_com_BRANCH`: Set to the branch that that the user can access. Example: "main"
* `BB_USER_my_username_example_com_ACCESS_KEY`: Set to the the Bitbucket access key that grants API access for the user to the repository

### Other Git Sources

Other git sources are not implemented yet. Contributions are welcome!

## Local development

You can use express to run the code locally. The express.mjs file proxies requests to the Lambda handler defined in index.mjs. No authentication is enabled locally, but you can provide global settings through environment variables to grant access to a single repository (for testing purposes only).

    npm install
    npm run dev

Environment variables:

    LOCAL_DEV=true
    LOCAL_REPO=myworkspace/myrepo
    LOCAL_BRANCH=main
    LOCAL_ACCESS_KEY=my-access-key

## See also:

* [Netlify git-gateway](https://github.com/netlify/git-gateway), the original implementation of this application.
* [Decap CMS](https://github.com/decaporg/decap-cms), a CMS for static site generators that can use git-gateway.
