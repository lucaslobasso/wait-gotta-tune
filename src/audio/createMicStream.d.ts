import type { MicStream, MicStreamOptions } from './types';

/** Implemented per platform in createMicStream.native.ts and createMicStream.web.ts. */
export declare function createMicStream(options: MicStreamOptions): MicStream;
