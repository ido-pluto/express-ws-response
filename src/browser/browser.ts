import {BSON} from "bson";
import {concatenateArrayBuffers, parseBuffer} from "./parseBuffer/buffers.js";
import {TEXT_MIME_TYPES} from "./parseBuffer/parseMimeTypeContent.js";
import {ACCEPT_ENCODING} from "./parseBuffer/decompress.js";

type WSFetchOptions = {
    method?: string,
    body?: any
    headers?: HeadersInit
    onStreaming?: (data: string | Uint8Array | any) => void
}

type WSFetchResponse = {
    data: any,
    headers: Record<string, string | string[]>
    statusCode: number
}

const ACCEPTED_MIME_TYPES = [...TEXT_MIME_TYPES, "*/*"];

export function wsFetch(url: string | URL, {method = "GET", body, onStreaming, headers}: WSFetchOptions = {}) {
    const {reject, resolve, promise} = Promise.withResolvers<WSFetchResponse>();
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
    ws.onerror = reject;
    ws.onclose = reject;

    let textStream = '';
    let jsonResponse: any = null;

    let finalHeaders: Headers;
    let finalStatusCode: number;
    const binaryStream: Uint8Array[] = [];
    ws.onmessage = async data => {
        let {type, chunk, headers, code} = BSON.deserialize(data.data);
        finalHeaders ??= new Headers(headers);
        finalStatusCode ??= code;

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

            resolve({
                data: bodyResponse,
                headers,
                statusCode: code
            });
        } else {
            onStreaming?.(chunk);
        }
    }

    return promise;
}