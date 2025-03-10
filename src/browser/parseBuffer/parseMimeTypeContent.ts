export const TEXT_MIME_TYPES = ["application/json", "application/xml", "application/xhtml+xml", "text/html", "text/plain", "text/xml"];
const JSON_MIME_TYPES = ["application/json"];

export function parseMimeTypeContent(type: string, data: Uint8Array) {
    let contentType = 'buffer';

    if (TEXT_MIME_TYPES.includes(type)) {
        const stringContent = new TextDecoder().decode(data);
        return parseTextualContent(type, stringContent);
    }

    return {
        data,
        type: contentType
    }
}

export function parseTextualContent(type: string, stringContent: string) {
    let contentType = 'string';
    if (JSON_MIME_TYPES.includes(type)) {
        try {
            stringContent = JSON.parse(stringContent);
            contentType = 'json';
        } catch (e) {
        }
    }

    return {
        data: stringContent,
        type: contentType
    }
}