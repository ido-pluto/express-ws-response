import {BSON} from "bson";

function concatenateArrayBuffers(buffers: (ArrayBuffer | Uint8Array)[]): ArrayBufferLike {
    if (buffers.length === 1) {
        return buffers[0] instanceof ArrayBuffer ? buffers[0] : buffers[0].buffer;
    }
    // Calculate total length
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);

    // Create a new ArrayBuffer with the total length
    const resultBuffer = new ArrayBuffer(totalLength);
    const resultView = new Uint8Array(resultBuffer);

    // Copy each buffer into the new buffer
    let offset = 0;
    for (const buffer of buffers) {
        resultView.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    return resultBuffer;
}

type WSFetchOptions = {
    method?: string,
    body?: any
    headers?: HeadersInit
    onStreaming?: (data: string | Uint8Array | any) => void
}

type WSFetchResponse = {
    data: any,
    headers: Record<string, string>
    statusCode: number
}

export default async function wsFetch(url: string | URL, {
    method = "GET",
    body,
    onStreaming,
    headers
}: WSFetchOptions = {}) {
    const {reject, resolve, promise} = Promise.withResolvers<WSFetchResponse>();
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
        const deserialize = BSON.serialize({body, headers, method});
        ws.send(deserialize);
    }
    ws.onclose = reject;

    let textStream = '';
    let jsonResponse: any = null;
    const binaryStream: Uint8Array[] = [];
    ws.onmessage = data => {
        const {type, chunk, headers, code} = BSON.deserialize(data.data);

        if (type === 'string') {
            textStream += chunk;
        } else if (type === 'buffer') {
            binaryStream.push(chunk.data);
        } else if (type === 'json') {
            jsonResponse = chunk;
        }

        if (type === 'finish') {
            ws.close();

            const bodyResponse = binaryStream.length ? concatenateArrayBuffers(binaryStream) :
                textStream.length ? textStream : jsonResponse;

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

export {wsFetch};