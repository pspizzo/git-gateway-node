import process from 'node:process';

const BITBUCKET_BASE_URL = process.env.BITBUCKET_BASE_URL
    || 'https://api.bitbucket.org/2.0/repositories';


/*~~~~   Useful functions   ~~~~*/

const errorMsg = (statusCode, msg) => ({
    headers: { 'content-type': 'application/json' },
    statusCode,
    body: JSON.stringify({ error: msg }),
});
const NOT_FOUND = errorMsg(404, 'Not Found');

const corsHeaders = (methods = 'GET, OPTIONS') => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

const decodeMultipartValues = (event) => {
    let body = event?.body;
    if (!body) return {};
    if (event?.isBase64Encoded) {
        try {
            body = Buffer.from(body, 'base64').toString('utf8')
        } catch {
            return {};
        }
    }
    const contentType = event?.headers?.['content-type'];
    const [, boundary] = contentType?.match(/;\s*boundary=(.+?)(?:$|;)/) || [];
    if (!boundary) return {};

    const parts = body.split(`--${boundary}`);
    return parts.map((p) => {
        const lines = p.replace(/^[\r\n]+/, '').split('\r\n');
        if (lines[1]?.match(/^Content-Type:/i)) return null;

        const [, name] = lines[0].match(/Content-Disposition: .+;\s* name=['"](.+?)['"]/i) || [];
        if (!name) return null;
        return { name, value: lines.slice(2).join('\n').trim()};
    }).filter((i) => !!i);
};

/*~~~~   Proxy the request to BitBucket API   ~~~~*/

const proxy = async (relativeUrl, event, config) => {
    const method = event?.requestContext?.http?.method || 'GET';
    try {
        let url = `${BITBUCKET_BASE_URL}/${config.repo}${relativeUrl}`;
        if (event.rawQueryString) {
            url += `?${event.rawQueryString}`;
        }
        let requestBody = event.body;
        if (requestBody) {
            if (event.isBase64Encoded) {
                requestBody = Buffer.from(requestBody, 'base64').toString('utf8');
            }
        }
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${config.accessKey}`,
                Accept: 'application/json',
                'Content-Type': event.headers['content-type'] || 'application/json',
            },
            body: requestBody,
        });
        if (!response.ok) {
            console.log(`[bitbucket-proxy] Bad response, status=${response.status} url=${relativeUrl}, method=${method}`);
            const msg = await response.text();
            return errorMsg(500, `Proxy error: ${msg}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        let body;
        let isBase64Encoded = false;
        if (contentType.startsWith('application/json') || contentType.startsWith('text/')) {
            body = await response.text();
        } else {
            const bytes = await response.arrayBuffer();
            body = Buffer.from(bytes).toString('base64')
            isBase64Encoded = true;
        }

        return {
            headers: { 'Content-type': contentType },
            statusCode: response.status,
            body,
            isBase64Encoded,
        };
    } catch (err) {
        console.log(`[bitbucket-proxy] Error during proxy, url=${relativeUrl}, method=${method}`, err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};


/*~~~~   Which methods should include CORS headers in the response   ~~~~*/

const corsAllowed = [
    { regex: /^\/refs\/branches\/[^/]+$/, methods: 'GET, OPTIONS' },
    { regex: /^\/src\/[a-zA-Z0-9]+\//, methods: 'GET, OPTIONS' },
    { regex: /^\/commits$/, methods: 'GET, OPTIONS' },
    { regex: /^\/src$/, methods: 'POST, OPTIONS' },
];

/*
 * The list of URLs to handle. Sorted by method (GET, POST, etc.)
 * Each handler should be in one of these formats:
 *  - string - exact match of the requested URL path
 *  - regex - regular expression to check against the URL path
 *  - object - supports the following options:
 *    - match - a string or regex to compare against the requested URL path
 *    - filter(config, url, groups, event) - a function that returns true if the requested URL should be proxied.
 *      + config: the config passed into this file's main handler() function
 *      + event: the event lambda event
 *      + groups: if "match" is a regex, and capturing groups found
 */
const handlers = {
    GET: [
        {
            match: /^\/refs\/branches\/([^/]+)$/,
            filter: (config, event, groups) => groups?.[0] === config.branch,
        },
        {
            match: '/commits',
            filter: (config, event) => event?.queryStringParameters?.include === config.branch,
        },
        /^\/src\/[a-zA-Z0-9]+\//,
    ],
    POST: [
        {
            match: '/src',
            filter: (config, event, groups) => {
                const values = decodeMultipartValues(event);
                return values.branch === config.branch;
            },
        }
    ],
};


/**
 *
 * @param event AWS Lambda HTTP v2.0 event: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
 * @param config {branch: string, repo: string, accessKey: string, basePath: string}
 * @returns Promise<{statusCode: number, headers: {[key]: string: any}, body: any}>
 */
const handler = async (event, config) => {
    const { rawPath, requestContext, rawQueryString, queryStringParameters } = event;
    const method = requestContext?.http?.method;
    if (!rawPath.startsWith(config.basePath)) {
        console.log(`[bitbucket] Invalid URL: ${method} ${rawPath}`);
        return NOT_FOUND;
    }

    const relPath = rawPath.substring(config.basePath.length);

    // CORS
    const corsMatch = corsAllowed.find((c) => c.regex.test(relPath));
    if (method === 'OPTIONS') {
        if (!corsMatch) return NOT_FOUND;
        return {
            headers: corsHeaders(corsMatch.methods),
            statusCode: 200,
            body: '{}',
        };
    }

    const methodHandlers = handlers[method];
    if (!methodHandlers) return NOT_FOUND;

    // Check for any handler matches
    let groups = [];
    const match = methodHandlers.find((h) => {
        const match = typeof h === 'string' ? h : (typeof h?.match === 'string' ? h.match : undefined);
        if (match) {
            return relPath === match;
        }

        const regex = h instanceof RegExp ? h : (h?.match instanceof RegExp ? h.match : undefined);
        if (regex) {
            const ret = regex.exec(relPath);
            if (ret) {
                groups = ret.slice(1);
                return true;
            }
        }
        return false;
    });

    if (match && (!match?.filter || match.filter(relPath, groups, queryStringParameters))) {
        console.log(`[bitbucket] Proxying: ${method} ${relPath} ${rawQueryString}`);
        const result = await proxy(relPath, event, config);
        if (corsMatch) {
            result.headers = { ...corsHeaders(corsMatch.methods), ...(result.headers || {}) };
        }
        return result;
    }

    console.log(`[bitbucket] No handler for URL: ${method} ${rawPath}`);
    return NOT_FOUND;
};

export default handler;
