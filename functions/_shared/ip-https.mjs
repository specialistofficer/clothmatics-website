import { connect as connectTls } from "node:tls";
import { Buffer } from "node:buffer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value) {
  return typeof value === "string" ? encoder.encode(value) : value;
}

function join(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function headerEndIndex(value) {
  for (let index = 0; index <= value.length - 4; index += 1) {
    if (value[index] === 13 && value[index + 1] === 10 && value[index + 2] === 13 && value[index + 3] === 10) return index;
  }
  return -1;
}

function decodeChunked(value) {
  const chunks = [];
  let offset = 0;
  while (offset < value.length) {
    let end = offset;
    while (end + 1 < value.length && !(value[end] === 13 && value[end + 1] === 10)) end += 1;
    if (end + 1 >= value.length) throw new Error("Incomplete chunked response.");
    const size = Number.parseInt(decoder.decode(value.slice(offset, end)).split(";", 1)[0], 16);
    if (!Number.isFinite(size)) throw new Error("Invalid chunked response.");
    offset = end + 2;
    if (size === 0) break;
    if (offset + size > value.length) throw new Error("Incomplete response body.");
    chunks.push(value.slice(offset, offset + size));
    offset += size + 2;
  }
  return join(chunks);
}

function parseResponse(value) {
  const boundary = headerEndIndex(value);
  if (boundary < 0) throw new Error("Invalid response from image service.");
  const lines = decoder.decode(value.slice(0, boundary)).split("\r\n");
  const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(lines.shift() || "");
  if (!match) throw new Error("Invalid response status.");
  const headers = new Headers();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator > 0) headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  let body = value.slice(boundary + 4);
  if (/chunked/i.test(headers.get("transfer-encoding") || "")) body = decodeChunked(body);
  const declared = Number(headers.get("content-length"));
  if (Number.isFinite(declared) && declared >= 0) body = body.slice(0, declared);
  return { status: Number(match[1]), headers, body };
}

function exchange(hostname, requestChunks) {
  return new Promise((resolve, reject) => {
    const responseChunks = [];
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const socket = connectTls({ host: hostname, port: 443, rejectUnauthorized: true }, () => {
      for (const chunk of requestChunks) socket.write(Buffer.from(chunk));
    });
    const timer = setTimeout(() => {
      socket.destroy();
      finish(reject, new Error("Image service connection timed out."));
    }, 70_000);
    socket.on("data", (chunk) => responseChunks.push(new Uint8Array(chunk)));
    socket.on("end", () => finish(resolve, join(responseChunks)));
    socket.on("close", () => finish(resolve, join(responseChunks)));
    socket.on("error", (error) => finish(reject, error));
  });
}

function multipartBody(image, imageBytes, fields) {
  const boundary = `----clothmatics-${crypto.randomUUID()}`;
  const chunks = [
    bytes(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="clothmatics-garment.jpg"\r\nContent-Type: ${image.type}\r\n\r\n`),
    imageBytes,
    bytes("\r\n"),
  ];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    chunks.push(bytes(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`));
  }
  chunks.push(bytes(`--${boundary}--\r\n`));
  return { boundary, chunks, length: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) };
}

export async function postMultipartToHttpsIp({ hostname, path, token, image, fields }) {
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  const multipart = multipartBody(image, imageBytes, fields);
  const response = await exchange(hostname, [
    bytes(
      `POST ${path} HTTP/1.1\r\nHost: ${hostname}\r\nAuthorization: Bearer ${token}\r\nContent-Type: multipart/form-data; boundary=${multipart.boundary}\r\nContent-Length: ${multipart.length}\r\nAccept: image/png, application/json\r\nConnection: close\r\n\r\n`,
    ),
    ...multipart.chunks,
  ]);
  return parseResponse(response);
}
