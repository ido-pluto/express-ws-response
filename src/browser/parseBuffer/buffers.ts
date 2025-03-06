import {decompressData} from "./decompress.js";
import {parseMimeTypeContent} from "./parseMimeTypeContent.js";

function getHeader(name: string, headers: Headers, split = ";") {
    return headers.get(name)?.split(split).map(e => e.trim()).filter(Boolean);
}

export async function parseBuffer(chunk: Uint8Array, headers: Headers) {
    const headerContentEncoding = getHeader('content-encoding', headers, ',') ?? [];

    for (const encoding of headerContentEncoding) {
        chunk = await decompressData(chunk, encoding);
    }

    const mimeType = (getHeader('content-type', headers, ';') ?? [])?.[0] ?? "text/plain";
    return parseMimeTypeContent(mimeType, chunk);
}

export function concatenateArrayBuffers(buffers: (ArrayBuffer | Uint8Array)[]): ArrayBufferLike {
    if (buffers.length === 1) {
        return buffers[0] instanceof ArrayBuffer ? buffers[0] : buffers[0].buffer;
    }
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);

    const resultBuffer = new ArrayBuffer(totalLength);
    const resultView = new Uint8Array(resultBuffer);

    let offset = 0;
    for (const buffer of buffers) {
        resultView.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    return resultBuffer;
}