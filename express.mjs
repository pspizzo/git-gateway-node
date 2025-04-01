import express from 'express';
import { handler } from './index.mjs';

const app = express();
const port = 3000;

/**
 * Wrap the AWS Lambda handler in an Express app for local testing.
 */
app.use(async (req, res) => {
    const q = req.url.indexOf('?');
    const rawPath = q >= 0 ? req.url.substring(0, q) : req.url;
    const rawQueryString = q >= 0 ? req.url.substring(q + 1) : '';

    const event = {
        rawPath,
        requestContext: {
            http: {
                method: req.method,
            },
        },
        rawQueryString: rawQueryString || '',
        queryStringParameters: req.query,
    };

    const response = await handler(event);
    if (response.headers) {
        res.set(response.headers);
    }
    if (response.statusCode) {
        res.status(response.statusCode);
    }
    res.send(response.body);
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
