declare module 'chacha' {
  const chacha: any;
  export default chacha;
}

declare module 'get-random-values' {
  const getRandomValues: <T extends Uint8Array>(array: T) => T;
  export default getRandomValues;
}

declare module 'pbkdf2' {
  export function pbkdf2(
    password: string | Buffer,
    salt: string | Buffer,
    iterations: number,
    keylen: number,
    digest: string,
    callback: (err: Error | null, derivedKey: Buffer) => void
  ): void;
  export function pbkdf2Sync(
    password: string | Buffer,
    salt: string | Buffer,
    iterations: number,
    keylen: number,
    digest: string
  ): Buffer;
}