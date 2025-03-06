import {ConnectWS, ResponseWS, SomeHTTPServer} from "./ConnectWS.js";
import {Express} from "express";

export function expressWsResponse(app: Express, httpServer?: SomeHTTPServer) {
    new ConnectWS(app, httpServer);
}

export type {
    SomeHTTPServer,
    ResponseWS
}