import pako from "pako";

export const ACCEPT_ENCODING = "gzip, deflate, br; q=0.9, identity; q=0.8";

/**
 * Decompresses a compressed buffer based on the given Content-Encoding.
 *
 * @param compressedData - The compressed data as ArrayBuffer or Uint8Array.
 * @param contentEncoding - The encoding format ('gzip', 'deflate', 'br').
 * @returns A promise that resolves to a Uint8Array of the decompressed data.
 */
export async function decompressData(compressedData: ArrayBuffer | Uint8Array, contentEncoding: string): Promise<Uint8Array> {
    const normalized = contentEncoding.trim().toLowerCase().replace(/^x-/, "");

    if (typeof window !== "undefined" && "DecompressionStream" in window && (normalized === "gzip" || normalized === "deflate")) {
        try {
            return await nativeDecompress(compressedData, normalized);
        } catch (err) {
            return pakoDecompress(compressedData, normalized);
        }
    }

    if (normalized === "gzip" || normalized === "deflate") {
        return pakoDecompress(compressedData, normalized);
    }

    if (normalized === "br") {
        return brotliFallback(compressedData);
    }

    throw new Error(`Unsupported or unhandled encoding: ${normalized}`);
}

async function nativeDecompress(data: ArrayBuffer | Uint8Array, format: "gzip" | "deflate") {
    const ds = new DecompressionStream(format);
    const decompressedStream = new Response(
        new Blob([data]).stream().pipeThrough(ds)
    );

    const arrayBuffer = await decompressedStream.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}


function pakoDecompress(data: ArrayBuffer | Uint8Array, format: "gzip" | "deflate") {
    const input = data instanceof Uint8Array ? data : new Uint8Array(data);
    return format === "gzip" ? pako.ungzip(input) : pako.inflate(input);
}


async function brotliFallback(data: ArrayBuffer | Uint8Array) {
    const input = data instanceof Uint8Array ? data : new Uint8Array(data);
    const {decompress} = await import("brotli-wasm");
    return decompress(input);
}
