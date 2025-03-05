import {ConnectWS, ResponseWS, SomeHTTPServer} from "./ConnectWS.js";
import {Express} from "express";

export default function expressWsResponse(app: Express, httpServer?: SomeHTTPServer) {
    new ConnectWS(app, httpServer);
}

export {expressWsResponse};

export type {
    SomeHTTPServer,
    ResponseWS
}