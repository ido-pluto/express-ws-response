import {Express, Response, Request} from 'express';
import {WebSocket, WebSocketServer} from 'ws';
import * as http from 'node:http';
import * as Stream from 'node:stream';
import {BSON} from 'bson';
import {createRequest, createResponse, MockRequest, MockResponse} from 'node-mocks-http';
import {z} from 'zod';
import {generateErrorMessage} from 'zod-error';
import * as https from 'node:https';
import * as http2 from 'node:http2';

const TEXTUAL_ENCODING = ['ascii', 'utf8', 'utf-8', 'utf16le', 'utf-16le', 'ucs2', 'ucs-2'];

const requestSchema = z.object({
    method: z.enum(['CONNECT', 'DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'TRACE']),
    headers: z.record(z.string()).optional(),
    body: z.any().optional()
});

type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};

export interface ResponseWS extends Response {
    sendError: (errorMessage: string, errorCode?: number) => void;
    ___isWSResponse: boolean;
}


declare global {
    namespace Express {
        export interface Request {
            isWebSocket: boolean;
        }
    }
}

export type SomeHTTPServer = http.Server | https.Server | http2.Http2Server;

const MAX_WAIT_FOR_DATA = 1000 * 10; // 10 seconds

export class ConnectWS {
    private readonly _wss: WebSocketServer;

    public constructor(private readonly _app: Express, _httpServer?: SomeHTTPServer) {
        this._wss = new WebSocketServer({noServer: true});

        if (_httpServer) {
            this._connectServer(_httpServer);
        } else {
            this._responseInterceptor();
        }
    }

    private _responseInterceptor() {
        const originalListen = this._app.listen.bind(this._app);
        this._app.listen = (...args: any) => {
            const server = originalListen(...args);
            this._connectServer(server);
            return server;
        };
    }

    private _connectServer(server: SomeHTTPServer) {
        server.on('upgrade', (request: http.IncomingMessage & { ws?: [Stream.Duplex, Buffer] }, socket, head) => {
            const maxWaitForData = setTimeout(() => {
                socket.end();
            }, MAX_WAIT_FOR_DATA);

            this._wss.handleUpgrade(request, socket, head, (ws) => {
                ws.once('message', (data) => {
                    try {
                        clearTimeout(maxWaitForData);
                        const body = BSON.deserialize(data as any);
                        this._onWSRequest(body, ws, request);
                    } catch(error) {
                        ws.close(1011, "Internal Server Error");
                        socket.end();
                    }
                });
            });
        });
    }

    private _onWSRequest(body: any, ws: WebSocket, originalRequest: http.IncomingMessage) {

        const result = requestSchema.safeParse(body);
        if (!result.success) {
            const res:  MockResponse<ResponseWS> = createResponse({writableStream: function (){}});
            res.sendError(generateErrorMessage(result.error.issues));
            return;
        }

        const {method, body: requestBody, headers} = result.data;
        const request: MockRequest<Request> = createRequest({
            ...originalRequest,
            headers: {
                ...originalRequest.headers,
                ...headers
            },
            method,
            body: requestBody,
            isWebSocket: true
        });

        const mockExpressResponse: MockResponse<ResponseWS> = createResponse({
            writableStream: function (){},
            req: request
        });

        this._handleResponse(request, mockExpressResponse, ws);
        this._app(request, mockExpressResponse);
    }

    private _handleResponse(req:  MockRequest<Request>, res: MockResponse<Mutable<ResponseWS>>, ws: WebSocket) {
        let headersSent = false;

        ws.addEventListener("close", () => {
            req.emit("abort")
            req.emit("close");
            Object.defineProperty(req, 'closed', {
                configurable: true,
                enumerable: true,
                get: () => true
            });

            if(!res.writableEnded){
                res.writableEnded = true;
                res.emit("close");
            }
            Object.defineProperty(res, 'closed', {
                configurable: true,
                enumerable: true,
                get: () => true
            });
        });

        ws.addEventListener("error", (event) => {
            res.emit("error", event.error);
        });

        const write = (chunk: string | Buffer | any, encoding?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void): boolean => {
            if (res.writableEnded) {
                return false;
            }

            let type = ConnectWS.type(chunk);

            if (typeof encoding === 'string') {
                chunk = Buffer.from(chunk, encoding);
                type = 'buffer';

                if (TEXTUAL_ENCODING.includes(encoding)) {
                    type = 'string';
                    chunk = chunk.toString('utf8');
                }
            }

            const sendData: any = {type, chunk};
            if (!headersSent) {
                sendData.headers = res.getHeaders();
                sendData.status = res.statusCode;
            }

            const data = BSON.serialize(sendData);
            const funcCallback = typeof encoding === 'function' ? encoding : callback;
            ws.send(data, funcCallback);
            res.headersSent = true;
            headersSent = true;

            return true;
        };

        const end = (data?: any, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) => {
            if (data) {
                write(data, encodingOrCallback as BufferEncoding, callback);
            }

            if (res.writableEnded) {
                return res;
            }

            const funcCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            ws.send(BSON.serialize({type: 'finish'}), funcCallback);
            ws.close();


            res.finished = true;
            res.writableEnded = true;
            res.headersSent = true;

            res.emit('end');
            res.writableEnded = true;
            res.emit('finish');

            return res;
        };

        const sendError = (errorMessage = 'Internal Server Error', errorCode = 500) => {
            res.statusCode = errorCode;
            end(errorMessage);
        };

        const destroy = (error?: Error) => {
            res.emit('error', error);
            ws.close();
            res.destroyed = true;

            return res;
        }

        res.___isWSResponse = true;
        res.sendError = sendError;
        res.write = write;
        res.end = end;
        res.send = end;
        res.destroy = destroy;
    }

    static type(body: any) {
        return typeof body === 'string' ? 'string' : ConnectWS.isAnyBuffer(body) ? 'buffer' : 'json5';
    }

    static isAnyBuffer(data: any): boolean {
        return Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data);
    }
}
