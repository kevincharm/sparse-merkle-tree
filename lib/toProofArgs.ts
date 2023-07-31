import { ProofPath } from 'fixed-merkle-tree'

export function toProofArgs(proofPath: ProofPath) {
    let enables = 0n
    const path: string[] = []
    for (let i = 0; i < proofPath.pathElements.length; i++) {
        if (BigInt(proofPath.pathElements[i]) > 0n) {
            path.push(proofPath.pathElements[i] as string)
            enables |= 1n << BigInt(i)
        }
    }
    return {
        enables,
        path,
    }
}
