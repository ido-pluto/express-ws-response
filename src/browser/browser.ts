import {BSON} from "bson";
import {concatenateArrayBuffers, getContentType, parseBuffer} from "./parseBuffer/buffers.js";
import {parseTextualContent, TEXT_MIME_TYPES} from "./parseBuffer/parseMimeTypeContent.js";
import {ACCEPT_ENCODING} from "./parseBuffer/decompress.js";

type WSFetchOptions = {
    method?: string,
    body?: any
    headers?: HeadersInit
    onStreaming?: (data: string | Uint8Array | any) => void
    signal?: AbortSignal
}

type WSFetchResponse = {
    data: Promise<any>
    headers: Headers
    status: number
}

const ACCEPTED_MIME_TYPES = [...TEXT_MIME_TYPES, "*/*"];

export function wsFetch(url: string | URL, {method = "GET", body, onStreaming, headers, signal}: WSFetchOptions = {}) {
    const {reject, resolve, promise} = Promise.withResolvers<WSFetchResponse>();
    const bodyPromise = Promise.withResolvers<any>();

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
        const deserialize = BSON.serialize({
            body,
            headers: {
                "accept": ACCEPTED_MIME_TYPES.join(","),
                "accept-encoding": ACCEPT_ENCODING,
                ...headers
            },
            method
        });
        ws.send(deserialize);
    }

    const rejectAll = (error: Error) => {
        reject(error);
        bodyPromise.reject(error);
    }

    ws.onerror = () => rejectAll(new DOMException("WebSocket Error", "NetworkError"));
    ws.onclose = ({reason, code}) => rejectAll(new DOMException(`WebSocket closed with code ${code} and reason: ${reason || 'unknown'}`, "ServerError"));

    signal?.addEventListener("abort", () => {
        rejectAll(new DOMException("The operation was aborted", "AbortError"));
        ws.close();
    });

    let textStream = '';
    let jsonResponse: any = null;
    let finalHeaders = new Headers();
    const binaryStream: Uint8Array[] = [];

    ws.onmessage = async data => {
        let {type, chunk, headers, status} = BSON.deserialize(data.data);
        if(headers || status){
            finalHeaders = new Headers(headers);
            resolve({
                data: bodyPromise.promise,
                headers: finalHeaders,
                status: status
            });
        }

        if (type === 'string') {
            textStream += chunk;
        } else if (type === 'buffer') {
            binaryStream.push(chunk.data || chunk.buffer || chunk);
        } else if (type === 'json') {
            jsonResponse = chunk;
        }

        if (type === 'finish') {
            ws.onclose = null;
            ws.close();

            let bodyResponse = binaryStream.length ? concatenateArrayBuffers(binaryStream) :
                textStream.length ? textStream : jsonResponse;

            if (binaryStream.length) {
                const {data} = await parseBuffer(bodyResponse, finalHeaders);
                bodyResponse = data;
            }

            if(typeof bodyResponse === 'string'){
                bodyResponse = parseTextualContent(getContentType(finalHeaders), bodyResponse).data;
            }

            bodyPromise.resolve(bodyResponse);
        } else {
            onStreaming?.(chunk);
        }
    }

    return promise;
}