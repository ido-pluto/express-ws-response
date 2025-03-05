import {Express, Response} from 'express';
import {WebSocket, WebSocketServer} from 'ws';
import * as http from 'node:http';
import * as Stream from 'node:stream';
import {BSON} from 'bson';
import {createRequest, createResponse} from 'node-mocks-http';
import {z} from 'zod';
import {generateErrorMessage} from 'zod-error';
import * as https from 'node:https';
import * as http2 from 'node:http2';
import {extension} from 'mime-types';
import {WSResponseAlreadyCloseError} from './errors/WSResponseAlreadyCloseError.js';

const TEXTUAL_ENCODING = ['ascii', 'utf8', 'utf-8', 'utf16le', 'utf-16le', 'ucs2', 'ucs-2'];

const requestSchema = z.object({
    method: z.enum(['CONNECT', 'DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'TRACE']),
    headers: z.record(z.string()).optional(),
    body: z.any().optional()
});

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
                    } catch {
                        socket.end();
                    }
                });
            });
        });
    }

    private _onWSRequest(body: any, ws: WebSocket, originalRequest: http.IncomingMessage) {
        const mockExpressResponse: ResponseWS = createResponse();
        const result = requestSchema.safeParse(body);
        if (!result.success) {
            mockExpressResponse.sendError(generateErrorMessage(result.error.issues));
            return;
        }

        const {method, body: requestBody, headers} = result.data;
        const request = createRequest({
            ...originalRequest,
            headers: {
                ...originalRequest.headers,
                ...headers
            },
            method,
            body: requestBody,
            isWebSocket: true
        });

        this._handleResponse(mockExpressResponse, ws);
        this._app(request, mockExpressResponse);
    }

    private _handleResponse(res: ResponseWS, ws: WebSocket) {
        let responseEnded = false;
        const write = (chunk: string | Buffer | any, encoding?: BufferEncoding, callback?: () => void) => {
            if (responseEnded) {
                throw new WSResponseAlreadyCloseError();
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

            const mimeType = extension([res.getHeader('content-type')].flat().toString());
            if (mimeType === 'json') {
                type = 'json';
                chunk = JSON.parse(chunk.toString('utf8'));
            }

            const data = BSON.serialize({type, chunk});
            const funcCallback = typeof encoding === 'function' ? encoding : callback;
            ws.send(data, funcCallback);
        };

        const end = (data?: any, encoding?: BufferEncoding, callback?: () => void) => {
            if (responseEnded) {
                throw new WSResponseAlreadyCloseError();
            }

            if (data) {
                write(data, encoding, callback);
            }

            const funcCallback = typeof encoding === 'function' ? encoding : callback;
            ws.send(BSON.serialize({type: 'finish', headers: res.getHeaders(), code: res.statusCode}), funcCallback);
            ws.close();
            responseEnded = true;
        };

        const sendError = (errorMessage = 'Internal Server Error', errorCode = 500) => {
            res.statusCode = errorCode;
            end(errorMessage);
        };

        res.___isWSResponse = true;
        res.sendError = sendError;
        res.write = write as any;
        res.end = end as any;
        res.send = end as any;
    }

    static type(body: any) {
        return typeof body === 'string' ? 'string' : ConnectWS.isAnyBuffer(body) ? 'buffer' : 'json5';
    }

    static isAnyBuffer(data: any): boolean {
        return Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data);
    }
}
