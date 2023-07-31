import { MerkleTree, Element } from 'fixed-merkle-tree'

export class SparseMerkleTree extends MerkleTree {
    /**
     * Insert (append) a new element to the Merkle tree and return a proof of
     * the zero-value leaf that will be replaced.
     * @param element New leaf value
     * @returns proof
     */
    insert(element: Element) {
        if (this._layers[0].length >= this.capacity) {
            throw new Error('Tree is full')
        }
        const nextIndex = this._layers[0].length
        const proof = this.getProofArgs(nextIndex)
        this.update(nextIndex, element)
        return proof
    }

    /**
     * Get proof of membership of the leaf at `index`
     * @param index Index of the leaf to get proof of
     * @returns proof
     */
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
            index,
            enables,
            path,
        }
    }
}
