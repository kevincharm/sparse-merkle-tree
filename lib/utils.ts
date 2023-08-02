import { concatBytes, hexToBytes, bytesToHex } from '@noble/hashes/utils'
import { keccak_256 } from '@noble/hashes/sha3'

function numToBytes(value: bigint) {
    const hexRaw = value.toString(16)
    const hexPadded = hexRaw.padStart(32 * 2, '0')
    return hexToBytes(hexPadded)
}
function bytesToNum(bytes: Uint8Array) {
    return BigInt('0x' + bytesToHex(bytes))
}
export function keccak(...bytes: bigint[]): bigint {
    if (bytes.every((v) => v === 0n)) {
        return 0n
    }
    const buffer = concatBytes(...bytes.map((b) => numToBytes(b)))
    return bytesToNum(keccak_256(buffer))
}
/**
 * Default deserialiser hexstring -> bigint
 *
 * @param input Hex string e.g. "0xcafebabe"
 * @returns internal bigint representation
 */
export function deserialise(input: string): bigint {
    const isHex = /^0x[0-9a-fA-F]+$/.test(input)
    if (!isHex) throw new Error(`Not valid hex: ${input}`)
    return BigInt(input)
}
/**
 * Default serialiser bigint -> 0-padded 32-byte hexstring
 *
 * @param input bigint
 * @returns zero-padded 32-byte hexstring
 */
export function serialise(input: bigint): string {
    const hexRaw = input.toString(16)
    const hexPadded = hexRaw.padStart(32 * 2, '0')
    return `0x${hexPadded}`
}
