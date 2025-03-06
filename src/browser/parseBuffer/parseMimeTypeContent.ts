export const TEXT_MIME_TYPES = ["application/json", "application/xml", "application/xhtml+xml", "text/html", "text/plain", "text/xml"];
const JSON_MIME_TYPES = ["application/json"];

export function parseMimeTypeContent(type: string, data: Uint8Array){
    let stringContent = '';
    let contentType = 'buffer';

    if(TEXT_MIME_TYPES.includes(type)){
        stringContent =  new TextDecoder().decode(data);
        contentType = 'string';

        if(JSON_MIME_TYPES.includes(type)){
            try {
                stringContent = JSON.parse(stringContent);
                contentType = 'json';
            } catch (e) {}
        }
    }

    return {
        data: stringContent || data,
        type: contentType
    }
}