import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const dirname = new URL(".", import.meta.url).pathname;

/**
 * @import { ServiceCompileResult, Packet, Value, ServiceErrorResponse, ServiceCompileOptions } from "./types.ts"
 */

/**
 * @type {function(string): Uint8Array}
 */
let encodeUTF8;

/**
 * @type {function(Uint8Array): string}
 */
let decodeUTF8;

// For the browser and node 12.x
if (typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined") {
  let encoder = new TextEncoder();
  let decoder = new TextDecoder();
  encodeUTF8 = (text) => encoder.encode(text);
  decodeUTF8 = (bytes) => decoder.decode(bytes);
} // For node 10.x
else if (typeof Buffer !== "undefined") {
  encodeUTF8 = (text) => Buffer.from(text);
  decodeUTF8 = (bytes) => {
    let { buffer, byteOffset, byteLength } = bytes;
    return Buffer.from(buffer, byteOffset, byteLength).toString();
  };
} else {
  throw new Error("No UTF-8 codec found");
}

class ByteBuffer {
  len = 0;
  ptr = 0;

  /** @type {Uint8Array} */
  buf;

  constructor(buf = new Uint8Array(1024)) {
    this.buf = buf;
  }

  /**
   * @param {ByteBuffer} buffer
   */
  append(buffer) {
    let offset = this._write(buffer.len);
    this.buf.set(buffer.buf.subarray(0, buffer.len), offset);
  }

  /**
   * @param {number} delta
   * @returns  {number}
   */
  _write(delta) {
    if (this.len + delta > this.buf.length) {
      let clone = new Uint8Array((this.len + delta) * 2);
      clone.set(this.buf);
      this.buf = clone;
    }
    this.len += delta;
    return this.len - delta;
  }

  /**
   * @param {number} value
   */
  write8(value) {
    let offset = this._write(1);
    this.buf[offset] = value;
  }

  /**
   * @param {number} value
   */
  write32(value) {
    let offset = this._write(4);
    writeUInt32LE(this.buf, value, offset);
  }

  /**
   * @param {Uint8Array} bytes
   */
  write(bytes) {
    let offset = this._write(4 + bytes.length);
    writeUInt32LE(this.buf, bytes.length, offset);
    this.buf.set(bytes, offset + 4);
  }

  /**
   * @param {number} delta
   * @returns  {number}
   */
  _read(delta) {
    if (this.ptr + delta > this.buf.length) {
      throw new Error("Invalid packet");
    }
    this.ptr += delta;
    return this.ptr - delta;
  }

  /**
   * @returns  {number}
   */
  read8() {
    return this.buf[this._read(1)];
  }

  /**
   * @returns  {number}
   */
  read32() {
    return readUInt32LE(this.buf, this._read(4));
  }

  /**
   * @returns  {Uint8Array}
   */
  read() {
    let length = this.read32();
    let bytes = new Uint8Array(length);
    let ptr = this._read(bytes.length);
    bytes.set(this.buf.subarray(ptr, ptr + length));
    return bytes;
  }

  /**
   * @param {number} count
   * @returns {Uint8Array}
   */
  readSlice(count) {
    let slice = new Uint8Array(count);
    let ptr = this._read(count);
    slice.set(this.buf.subarray(ptr, ptr + count));
    return slice;
  }
}

const TypeKind = {
  Nil: 0,
  Bool: 1,
  Int: 2,
  String: 3,
  StringSlice: 4,
  ByteSlice: 5,
  InterfaceSlice: 6,
  Map: 7,
};

/**
 * @param {Packet} packet
 * @returns {Uint8Array}
 */
function encodePacket(packet) {
  /** @param {Value} value */
  let visit = (value) => {
    if (value === null) {
      bb.write8(TypeKind.Nil);
    } else if (typeof value === "boolean") {
      bb.write8(TypeKind.Bool);
      bb.write8(+value);
    } else if (typeof value === "number") {
      bb.write8(TypeKind.Int);
      bb.write32(value | 0);
    } else if (typeof value === "string") {
      bb.write8(TypeKind.String);
      bb.write(encodeUTF8(value));
    } else if (value instanceof Uint8Array) {
      bb.write8(TypeKind.ByteSlice);
      bb.write(value);
    } else if (value instanceof Array) {
      if (value.every((elem) => typeof elem === "string")) {
        bb.write8(TypeKind.StringSlice);
        let stringSliceBb = new ByteBuffer();
        for (let item of value) {
          stringSliceBb.write(encodeUTF8(item));
        }
        bb.write32(stringSliceBb.len);
        bb.append(stringSliceBb);
      } else {
        bb.write8(TypeKind.InterfaceSlice);
        bb.write32(value.length);
        for (let item of value) {
          visit(item);
        }
      }
    } else {
      let keys = Object.keys(value);
      bb.write8(TypeKind.Map);
      bb.write32(keys.length);
      for (let key of keys) {
        bb.write(encodeUTF8(key));
        visit(value[key]);
      }
    }
  };

  let bb = new ByteBuffer();
  bb.write32(0); // Reserve space for the length
  bb.write32((packet.id << 1) | +!packet.isRequest);
  visit(packet.value);
  writeUInt32LE(bb.buf, bb.len - 4, 0); // Patch the length in
  return bb.buf.subarray(0, bb.len);
}

/**
 * @param {Uint8Array} bytes
 * @returns {Packet}
 */
function decodePacket(bytes) {
  /** @type {() => any} */
  let visit = () => {
    switch (bb.read8()) {
      case TypeKind.Nil: // null
        return null;
      case TypeKind.Bool: // boolean
        return !!bb.read8();
      case TypeKind.Int: // number
        return bb.read32();
      case TypeKind.String: // string
        return decodeUTF8(bb.read());
      case TypeKind.ByteSlice: // Uint8Array
        return bb.read();
      case TypeKind.StringSlice: {
        let count = bb.read32();
        const stringSliceBb = new ByteBuffer(bb.readSlice(count));
        /** @type {string[]} */
        let values = [];
        while (true) {
          if (stringSliceBb.ptr === stringSliceBb.len) {
            break;
          }
          const strLen = stringSliceBb.read32();
          values.push(decodeUTF8(stringSliceBb.readSlice(strLen)));
        }
        return values;
      }
      case TypeKind.InterfaceSlice: {
        let count = bb.read32();
        /** @type {Value[]} */
        let value = [];
        for (let i = 0; i < count; i++) {
          value.push(visit());
        }
        return value;
      }
      case TypeKind.Map: {
        // { [key: string]: Value }
        let count = bb.read32();
        /** @type {{ [key: string]: Value }} */
        let value = {};
        for (let i = 0; i < count; i++) {
          value[decodeUTF8(bb.read())] = visit();
        }
        return value;
      }
      default:
        throw new Error("Invalid packet");
    }
  };

  let bb = new ByteBuffer(bytes);
  let id = bb.read32();
  let isRequest = (id & 1) === 0;
  id >>>= 1;
  let value = visit();
  if (bb.ptr !== bytes.length) {
    throw new Error("Invalid packet");
  }
  return { id, isRequest, value };
}

/**
 * @returns {"x86" | "arm64" | "arm"}
 */
function detectArch() {
  const arch = os.arch();
  if (arch === "x64") return "x86";
  if (arch === "arm64") return "arm64";
  if (arch === "arm") return "arm";
  throw new Error(`Unsupported architecture: ${arch}`);
}

/**
 * @returns {"windows.exe" | "darwin.o" | "linux.o"}
 */
function detectOs() {
  const platform = os.platform();
  if (platform === "win32") return "windows.exe";
  if (platform === "darwin") return "darwin.o";
  if (platform === "linux") return "linux.o";
  throw new Error(`Unsupported platform: ${platform}`);
}

export function startService() {
  let closed = false;
  const binaryName = `embedcss_${detectArch()}_${detectOs()}`;
  const binaryPath = path.resolve(dirname, "..", "bin", binaryName);

  /** @type {Map<number, (value: ServiceCompileResult | ServiceErrorResponse) => void>} */
  const responseHandlers = new Map();

  const service = spawn(binaryPath, {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: true,
    cwd: process.cwd(),
  });

  process.on("exit", () => {
    service.kill("SIGKILL");
  });

  /**
   * @param {Packet} packet
   */
  function sendPacket(packet) {
    const encoded = encodePacket(packet);
    service.stdin.write(encoded);
  }

  /** @param {Uint8Array} bytes */
  function receivePacket(bytes) {
    let inpacket = decodePacket(bytes);

    if (inpacket.isRequest) {
      if (inpacket.value && "Command" in inpacket.value && inpacket.value.Command === "ping") {
        setTimeout(() => {
          sendPacket({ value: null, isRequest: false, id: inpacket.id });
        }, 50);
      }
    } else {
      const handler = responseHandlers.get(inpacket.id);
      if (handler) {
        responseHandlers.delete(inpacket.id);
        // @ts-ignore
        handler(inpacket.value);
      }
    }
  }

  let stdout = new Uint8Array(16 * 1024);
  let stdoutUsed = 0;
  /** @param {Uint8Array} chunk */
  function readFromStdout(chunk) {
    // Append the chunk to the stdout buffer, growing it as necessary
    let limit = stdoutUsed + chunk.length;
    if (limit > stdout.length) {
      let swap = new Uint8Array(limit * 2);
      swap.set(stdout);
      stdout = swap;
    }
    stdout.set(chunk, stdoutUsed);
    stdoutUsed += chunk.length;

    // Process all complete (i.e. not partial) packets
    let offset = 0;
    while (offset + 4 <= stdoutUsed) {
      let length = readUInt32LE(stdout, offset);
      if (offset + 4 + length > stdoutUsed) {
        break;
      }
      offset += 4;
      receivePacket(stdout.subarray(offset, offset + length));
      offset += length;
    }
    if (offset > 0) {
      stdout.copyWithin(0, offset, stdoutUsed);
      stdoutUsed -= offset;
    }
  }

  service.stdout.on("data", readFromStdout);

  let nextID = 1;

  return {
    /** @returns {boolean} */
    isClosed() {
      return closed;
    },
    /**
     * @param {string} code
     * @param {ServiceCompileOptions} options
     * @returns {Promise<ServiceCompileResult | ServiceErrorResponse>}
     */
    compile(code, options = { UniqueClassNames: true }) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Embedcss compiler is not responding"));
        }, 10000);

        let id = nextID++;
        responseHandlers.set(id, (value) => {
          resolve(value);
          clearTimeout(timeout);
        });
        sendPacket({
          id,
          isRequest: true,
          value: { Command: "compile", Args: [code, JSON.stringify(options)] },
        });
      });
    },
    /**
     * @returns {Promise<void>}
     */
    close() {
      return new Promise((res, rej) => {
        const timeout = setTimeout(() => {
          service.kill("SIGKILL");
          res();
        }, 10000);

        service.on("exit", (code) => {
          closed = true;
          clearTimeout(timeout);
          if (code === 0 || code === null) {
            res();
          } else {
            rej(new Error(`Embedcss compiler exited with code ${code}`));
          }
        });

        sendPacket({
          id: nextID++,
          isRequest: true,
          value: { Command: "exit", Args: [] },
        });
      });
    },
  };
}

/**
 * @param {Uint8Array} buffer
 * @param {number} offset
 * @returns {number}
 */
function readUInt32LE(buffer, offset) {
  return buffer[offset++] | (buffer[offset++] << 8) | (buffer[offset++] << 16) | (buffer[offset++] << 24);
}

/**
 * @param {Uint8Array} buffer
 * @param {number} value
 * @param {number} offset
 */
function writeUInt32LE(buffer, value, offset) {
  buffer[offset++] = value;
  buffer[offset++] = value >> 8;
  buffer[offset++] = value >> 16;
  buffer[offset++] = value >> 24;
}
