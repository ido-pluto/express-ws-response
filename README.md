# Express WebSocket Response

> Avoid HTTP Timeouts with WebSocket response, for Express.js

## Features
- Avoid HTTP timeouts by sending response using WebSocket.
- Streaming response to the client.
- Avoid cross-origin issues.
- Support both HTTP and WebSocket requests.
- Encoding data effectively with BSON.
- Support Uint8Array, ArrayBuffer, and Buffer data types.
- Support AbortController for canceling the request.
- Live-streaming data from a client and to a client

## Installation
```bash
npm install express-ws-response
```

## Usage
```javascript
import express from 'express';
import {expressWsResponse} from 'express-ws-response';

const app = express();
expressWsResponse(app); // must be called on the instance of express that open the port (e.g: "app.listen). Can not be called on express sub-router.

app.get('/hello', (req, res) => {
  res.send('Hello World!');
});

app.post('/body', (req, res) => {
  res.json({ message: 'Hello World!', ...req.body });
});

app.post('/stream', async (req, res) => {
    let closed = false;
    res.on("close", () => {
        closed = true;
        console.log("Connection closed");
    });

    req.on("data", data => {
        console.log(data);
    });
    
    for(let i = 0; i < 4 && !closed; i++){
        res.write({ counter: i });
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    if(closed) return;
    res.end({ok: true});
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
```

### In The client

```javascript
import {wsFetch} from 'express-ws-response/browser';

const {data, headers, status} = await wsFetch("http://localhost:3000/hello");
console.log(await data); // Hello World!

const {data} = await wsFetch("http://localhost:3000/body", {
    method: 'POST',
    body: { name: 'John Doe' }
});
console.log(await data); // { message: 'Hello World!', name: 'John Doe' }

const abortController = new AbortController();
const {data, write} = await wsFetch("http://localhost:3000/stream", {
    method: 'POST',
    signal: abortController.signal,
    onStreaming: data => {
        console.log(data); // { counter: 1 }, { counter: 2 }, { counter: 3 }
    }
});

write('Hi from client'); // also can be an object

setTimeout(() => {
    abortController.abort();
}, 1000);

console.log(await data); // throw AbortError
```

### Using external HTTP server

If you use an external http/https/http2 server and only pass the request to express, you can use the following code.
```javascript
import * as http from "http";
import express from 'express';
import {expressWsResponse} from 'express-ws-response';

const app = express();
const server = http.createServer(app);

expressWsResponse(app, server);

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
```


### How to know if the request is WS or HTTP?

You can use the `req.isWebSocket` to check that, if it exists, it is a WebSocket request.

## Vite Top Level Awaits
BSON require top level await to work properly. 
To enable top level await in Vite, you need to add the following configuration to your `vite.config.js` file.

```javascript
export default defineConfig({
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext'
        }
    }
})
```

