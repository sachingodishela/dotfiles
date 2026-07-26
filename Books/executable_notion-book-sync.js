#!/usr/bin/node

import { watch } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";

const API_BASE_URL = process.env.NOTION_API_BASE_URL ?? "https://api.notion.com/v1";
const API_VERSION = "2026-03-11";
const BOOKS_DIR = process.env.BOOKS_DIR ?? join(homedir(), "Books");
const STATE_DIR =
  process.env.STATE_DIRECTORY ??
  join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "notion-book-sync");
const STATE_FILE = join(STATE_DIR, "state.json");
const PROPERTY_NAME = "Book";
const MAX_SINGLE_PART_SIZE = 20 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;
const DEBOUNCE_MS = 3_000;
const STABILITY_WAIT_MS = 2_000;
const PAGE_ID_PATTERN = /-([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.pdf$/i;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);

let state = {};
let stateInitialized = false;
let queue = Promise.resolve();
let watcher;
const timers = new Map();

function log(level, message, details = {}) {
  const suffix = Object.entries(details)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  console.log(
    `${new Date().toISOString()} level=${level} message=${JSON.stringify(message)}${suffix ? ` ${suffix}` : ""}`,
  );
}

function fingerprint(fileStat) {
  return {
    size: fileStat.size,
    mtimeMs: Math.trunc(fileStat.mtimeMs),
  };
}

function fingerprintsEqual(left, right) {
  return left?.size === right?.size && left?.mtimeMs === right?.mtimeMs;
}

function pageIdFromFilename(filename) {
  return filename.match(PAGE_ID_PATTERN)?.[1] ?? null;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadToken() {
  if (process.env.NOTION_TOKEN) {
    return process.env.NOTION_TOKEN.trim();
  }

  const credentialsDirectory = process.env.CREDENTIALS_DIRECTORY;
  if (!credentialsDirectory) {
    throw new Error("Notion token credential is unavailable");
  }

  return (await readFile(join(credentialsDirectory, "notion-token"), "utf8")).trim();
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function notionRequest(token, url, options = {}) {
  const absoluteUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Notion-Version", API_VERSION);
      if (options.json !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(absoluteUrl, {
        method: options.method ?? "GET",
        headers,
        body: options.json === undefined ? options.body : JSON.stringify(options.json),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await parseResponse(response);

      if (response.ok) {
        return body;
      }

      const apiMessage =
        typeof body === "object" && body !== null ? body.message : String(body ?? "");
      lastError = new Error(
        `Notion API ${response.status} ${response.statusText}${apiMessage ? `: ${apiMessage}` : ""}`,
      );

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === 4) {
        throw lastError;
      }

      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter)
        ? retryAfter * 1_000
        : Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      log("warn", "Notion request failed; retrying", {
        status: response.status,
        attempt,
        delayMs,
      });
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (attempt === 4 || (error.name !== "TimeoutError" && error.name !== "TypeError")) {
        throw error;
      }
      const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      log("warn", "Notion request failed; retrying", {
        error: error.message,
        attempt,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function readChunk(fileHandle, position, length) {
  const buffer = Buffer.allocUnsafe(length);
  let offset = 0;

  while (offset < length) {
    const { bytesRead } = await fileHandle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) {
      throw new Error("PDF changed or ended while it was being read");
    }
    offset += bytesRead;
  }

  return buffer;
}

async function createFileUpload(token, filename, size) {
  const multiPart = size > MAX_SINGLE_PART_SIZE;
  const numberOfParts = Math.ceil(size / PART_SIZE);
  const request = {
    mode: multiPart ? "multi_part" : "single_part",
    filename,
    content_type: "application/pdf",
  };

  if (multiPart) {
    request.number_of_parts = numberOfParts;
  }

  const upload = await notionRequest(token, "/file_uploads", {
    method: "POST",
    json: request,
  });
  return upload;
}

async function sendPart(token, upload, filename, buffer, partNumber, multiPart) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
  if (multiPart) {
    form.append("part_number", String(partNumber));
  }

  await notionRequest(token, upload.upload_url ?? `/file_uploads/${upload.id}/send`, {
    method: "POST",
    body: form,
  });
}

async function uploadPdf(token, filePath, fileStat) {
  const filename = basename(filePath);
  const upload = await createFileUpload(token, filename, fileStat.size);
  const multiPart = fileStat.size > MAX_SINGLE_PART_SIZE;
  const fileHandle = await open(filePath, "r");

  try {
    let position = 0;
    let partNumber = 1;
    while (position < fileStat.size) {
      const length = Math.min(multiPart ? PART_SIZE : fileStat.size, fileStat.size - position);
      const buffer = await readChunk(fileHandle, position, length);
      await sendPart(token, upload, filename, buffer, partNumber, multiPart);
      position += length;
      partNumber += 1;
    }
  } finally {
    await fileHandle.close();
  }

  if (multiPart) {
    await notionRequest(token, upload.complete_url ?? `/file_uploads/${upload.id}/complete`, {
      method: "POST",
    });
  }

  return upload.id;
}

async function validatePage(token, pageId, filename) {
  const page = await notionRequest(token, `/pages/${pageId}`);
  const property = page.properties?.[PROPERTY_NAME];
  if (property?.type !== "files") {
    throw new Error(
      `Page ${pageId} does not have a "${PROPERTY_NAME}" files and media property`,
    );
  }
}

async function attachUpload(token, pageId, uploadId, filename) {
  await notionRequest(token, `/pages/${pageId}`, {
    method: "PATCH",
    json: {
      properties: {
        [PROPERTY_NAME]: {
          type: "files",
          files: [
            {
              type: "file_upload",
              file_upload: { id: uploadId },
              name: filename,
            },
          ],
        },
      },
    },
  });
}

async function saveState() {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  const temporaryFile = `${STATE_FILE}.${process.pid}.tmp`;
  const contents = {
    version: 1,
    files: state,
  };
  await writeFile(temporaryFile, `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryFile, STATE_FILE);
}

async function loadState() {
  try {
    const contents = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (contents.version !== 1 || typeof contents.files !== "object" || contents.files === null) {
      throw new Error("unsupported state file format");
    }
    state = contents.files;
    stateInitialized = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Cannot read state file: ${error.message}`, { cause: error });
    }
    state = {};
  }
}

async function stableStat(filePath) {
  const before = await stat(filePath);
  await sleep(STABILITY_WAIT_MS);
  const after = await stat(filePath);
  return fingerprintsEqual(fingerprint(before), fingerprint(after)) ? after : null;
}

async function processFile(filename) {
  const pageId = pageIdFromFilename(filename);
  if (!pageId) {
    return;
  }

  const filePath = join(BOOKS_DIR, filename);
  let fileStat;
  try {
    fileStat = await stableStat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (!fileStat) {
    log("info", "PDF is still changing; rescheduling", { filename });
    schedule(filename);
    return;
  }

  const currentFingerprint = fingerprint(fileStat);
  if (fingerprintsEqual(state[filename], currentFingerprint)) {
    return;
  }

  const token = await loadToken();
  log("info", "Synchronizing edited PDF", {
    filename,
    pageId,
    bytes: fileStat.size,
  });
  await validatePage(token, pageId, filename);
  const uploadId = await uploadPdf(token, filePath, fileStat);
  await attachUpload(token, pageId, uploadId, filename);

  const finalFingerprint = fingerprint(await stat(filePath));
  if (!fingerprintsEqual(currentFingerprint, finalFingerprint)) {
    log("warn", "PDF changed during upload; scheduling latest version", { filename });
    schedule(filename);
    return;
  }

  state[filename] = finalFingerprint;
  await saveState();
  log("info", "Updated Notion Book property", {
    filename,
    pageId,
    uploadId,
  });
}

function enqueue(filename) {
  queue = queue
    .then(() => processFile(filename))
    .catch((error) => {
      log("error", "PDF synchronization failed", {
        filename,
        error: error.stack ?? error.message,
      });
    });
}

function schedule(filename) {
  if (!pageIdFromFilename(filename)) {
    return;
  }

  clearTimeout(timers.get(filename));
  timers.set(
    filename,
    setTimeout(() => {
      timers.delete(filename);
      enqueue(filename);
    }, DEBOUNCE_MS),
  );
}

async function matchingFiles() {
  return (await readdir(BOOKS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && pageIdFromFilename(entry.name))
    .map((entry) => entry.name);
}

async function initializeOrScan() {
  const files = await matchingFiles();
  if (!stateInitialized) {
    for (const filename of files) {
      state[filename] = fingerprint(await stat(join(BOOKS_DIR, filename)));
    }
    await saveState();
    log("info", "Initialized PDF baseline", { files: files.length });
    return;
  }

  for (const filename of files) {
    enqueue(filename);
  }
}

async function main() {
  await loadState();
  await initializeOrScan();

  if (process.argv.includes("--once")) {
    await queue;
    return;
  }

  watcher = watch(BOOKS_DIR, { encoding: "utf8" }, (eventType, filename) => {
    if (filename) {
      schedule(filename);
    }
  });
  watcher.on("error", (error) => {
    log("error", "Books directory watcher failed", { error: error.stack ?? error.message });
    process.exitCode = 1;
    watcher.close();
  });
  log("info", "Watching PDFs for changes", { directory: BOOKS_DIR });
}

function shutdown(signal) {
  log("info", "Stopping PDF watcher", { signal });
  watcher?.close();
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  queue.finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  log("error", "Notion book sync stopped", { error: error.stack ?? error.message });
  process.exitCode = 1;
});
