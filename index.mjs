import process from 'node:process';
import bitbucket from './bitbucket.mjs';

/**
 * If the LOCAL_DEV env var is set, you can use a global set of credentials for testing.
 */
const getLocalTestHandlerConfig = () => {
    const {
        LOCAL_DEV,
        LOCAL_ACCESS_KEY: accessKey,
        LOCAL_REPO: repo,
        LOCAL_BRANCH: branch,
    } = process.env;
    if (LOCAL_DEV === 'true') {
        return { repo, branch, accessKey };
    }
    return undefined;
};

/**
 * Get the normalized user ID from the auth claims, if available.
 * Normalized = all non-alphanumeric characters are converted to underscores
 * @param event
 * @returns {undefined|string}
 */
const getEnvUserId = (event) => {
    const userIdClaim = process.env.USER_ID_CLAIM || 'username';
    const claims = event.requestContext?.authorizer?.jwt?.claims || {};
    const { [userIdClaim]: userId } = claims;
    if (!userId) return undefined;

    return userId
        .replaceAll(/\s/g, '')
        .replaceAll(/[^a-zA-Z0-9_]/g, '_');
};

/**
 * Look up the specified mappings in the environment variables for a specific user.
 * For example: getConfigFromEnv('MY_INT_', 'jdoe', { branch: BRANCH, repo: REPO }) returns:
 *     { branch: (value of env var MY_INT_jdoe_BRANCH), repo: (value of env var MY_INT_jdoe_REPO) }
 * If any mappings are missing, the user is invalid and no config is returned (undefined).
 *
 * @param prefix The prefix to use for all environment variables
 * @param envUserId The normalized user ID, from getEnvUserId()
 * @param mappings An object whose keys will be in the final result, and values are the environment variables to fetch them from.
 * @returns {undefined|{}}
 */
const getConfigFromEnv = (prefix, envUserId, mappings) => {
    let failure = false;
    const config = Object.keys(mappings).reduce((res, dest) => {
        const key = `${prefix}${envUserId}_${mappings[dest]}`;
        const value = process.env[key];
        if (value) {
            res[dest] = value;
        } else {
            failure = true;
        }
        return res;
    }, {});
    if (failure) console.log(`[index] No credentials for user ${envUserId}`);
    return failure ? undefined : config;
};


/*
 * Define the list of handlers available. Each handler should be implemented in its own file.
 * Supported options per handler:
 *   - basePath - required - matches the requested URL to this handler
 *   - getConfig(event) - required - returns the user-specific configuration from env vars
 *   - handler - required - the actual handler implementation to use
 */
const handlers = [
    {
        basePath: '/git-gateway/bitbucket',
        getConfig: (event) => {
            const envUser = getEnvUserId(event);
            if (!envUser) return undefined;

            const mappings = {
                repo: 'REPO',
                branch: 'BRANCH',
                accessKey: 'ACCESS_KEY',
            };
            return getConfigFromEnv('BB_USER_', envUser, mappings);
        },
        handler: bitbucket,
    }
];

/**
 * Custom handler to mimic the netlifystatus.com API request.
 * @param event
 * @returns {{statusCode: number, headers: {"Access-Control-Allow-Origin": string, "Access-Control-Allow-Methods": string, "Access-Control-Allow-Headers": string}, body: string}|undefined}
 */
const statusHandler = (event) => {
    if (event.rawPath === '/api/v2/components.json' && ['GET', 'OPTIONS'].includes(event.requestContext?.http?.method)) {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
            body: JSON.stringify({
                components: {
                    name: 'Git Gateway',
                    status:'operational',
                },
            }),
        };
    }
    return undefined;
};

/**
 * Main lambda event handler.
 */
export const handler = async (event) => {
    const status = statusHandler(event);
    if (status) {
        return status;
    }

    const { rawPath, requestContext } = event;
    const method = requestContext?.http?.method;
    const match = handlers.find((i) => rawPath.startsWith(`${i.basePath}/`));
    if (match) {
        if (method === 'OPTIONS') {
            return match.handler(event, { basePath: match.basePath});
        }
        const config = match.getConfig(event) || getLocalTestHandlerConfig();
        if (config) {
            return match.handler(event, { ...config, basePath: match.basePath});
        }
    }

    console.log(`[index] No handler for URL: ${method} ${rawPath}`)
    return {
        headers: { 'content-type': 'application/json' },
        statusCode: 404,
        body: JSON.stringify({ error: 'Not found' }),
    };
};
