# Express WebSocket Response

> Avoid HTTP Timeouts with WebSocket response, for Express.js

## Features
- Avoid HTTP timeouts by sending response using WebSocket.
- Streaming response to the client.
- Avoid cross-origin issues.
- Support both HTTP and WebSocket requests.
- Encoding data effectively with BSON.
- Support Uint8Array, ArrayBuffer, and Buffer data types.

## Installation
```bash
npm install express-ws-response
```

## Usage
```javascript
import express from 'express';
import expressWsResponse from 'express-ws-response';

const app = express();
expressWsResponse(app); // must be called on the instance of express that open the port (e.g: "app.listen). Can not be called on express sub-router.

app.get('/hello', (req, res) => {
  res.send('Hello World!');
});

app.post('/body', (req, res) => {
  res.json({ message: 'Hello World!', ...req.body });
});

app.post('/stream', (req, res) => {
    res.write({ counter: 1 });
    res.write({ counter: 2 });
    res.write({ counter: 3 });
    res.end({ok: true});
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
```

### In The client

```javascript
import wsFetch from 'express-ws-response/browser';

const {data, headers, statusCode} = wsFetch("http://localhost:3000/hello");
console.log(data); // Hello World!

const {data, headers, statusCode} = wsFetch("http://localhost:3000/body", {
    method: 'POST',
    body: { name: 'John Doe' }
});
console.log(data); // { message: 'Hello World!', name: 'John Doe' }

const {data, headers, statusCode} = wsFetch("http://localhost:3000/stream", {
    method: 'POST',
    onStreaming: data => {
        console.log(data); // { counter: 1 }, { counter: 2 }, { counter: 3 }
    }
});
console.log(data); // {ok: true}
```

### Using external HTTP server

If you use an external http/https/http2 server and only pass the request to express, you can use the following code.
```javascript
import * as http from "http";
import express from 'express';
import expressWsResponse from 'express-ws-response';

const app = express();
const server = http.createServer(app);

expressWsResponse(app, server);

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
```