import { MerkleTree, Element } from 'fixed-merkle-tree'

export class SparseMerkleTree extends MerkleTree {
    getProofArgs(index: number) {
        if (isNaN(Number(index)) || index < 0 || index >= 2 ** this.capacity) {
            throw new Error('Index out of bounds: ' + index)
        }
        let leaf = index < this.elements.length ? this.elements[index] : this.zeroElement
        let elIndex = +index
        let enables = 0n
        const path: Element[] = []
        let p = 0
        for (let level = 0; level < this.levels; level++) {
            const leafIndex = elIndex ^ 1
            if (
                leafIndex < this._layers[level].length /** subtree hash available */ &&
                this._layers[level][leafIndex] !== this.zeroElement /** subtree hash is nonzero */
            ) {
                path[p++] = this._layers[level][leafIndex]
                enables |= 1n << BigInt(level)
            }
            elIndex >>= 1
        }
        return {
            leaf,
            enables,
            path,
        }
    }
}
