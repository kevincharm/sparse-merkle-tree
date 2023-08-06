import { keccak, deserialise, serialise } from './utils'

export interface Proof {
    /** Whether or not the entry exists in the db */
    exists: boolean
    /** Leaf hash */
    leaf: string
    /** If exists, then will have a value */
    value: string | null
    /** Index, derived from key */
    index: bigint
    /** 256-bit number; each bit represents whether a sibling subtree is nonzero */
    enables: bigint
    /** List of nonzero sibling subtrees */
    siblings: string[]
}

export interface UpdateProof extends Proof {
    /** H(key, value, 1) */
    newLeaf: string
}

/**
 * Hash function that takes 1-3 256-bit numbers and returns a hash digest that
 * is also 256 bits.
 */
export type HashFunction = (...inputs: bigint[]) => bigint

export type DeserialiserFunction = (input: string) => bigint

export type SerialiserFunction = (input: bigint) => string

export interface SparseMerkleTreeKVOptions {
    zeroElement?: bigint
    hashFn?: HashFunction
    deserialiserFn?: DeserialiserFunction
    serialiserFn?: SerialiserFunction
}

/**
 * SparseMerkleTree
 * Raw sparse Merkle tree implementation
 */
export class SparseMerkleTree {
    public db: Map<bigint, [bigint, bigint, bigint?]> = new Map()
    private _root: bigint
    private _depth: number
    private _zeroElement: bigint
    private _hashFn: HashFunction
    private _deserialiserFn: DeserialiserFunction
    private _serialiserFn: SerialiserFunction

    constructor(depth: number, options: SparseMerkleTreeKVOptions = {}) {
        this._root = 0n
        this._depth = depth
        this._zeroElement = options.zeroElement || 0n
        this._hashFn = options.hashFn || keccak
        this._deserialiserFn = options.deserialiserFn || deserialise
        this._serialiserFn = options.serialiserFn || serialise
    }

    public hash(...inputs: bigint[]): bigint {
        return this._hashFn(...inputs)
    }

    public get root(): string {
        return this._serialiserFn(this._root)
    }

    /**
     * Get a proof of membership (or non-membership) of a leaf
     *
     * @param index Index of leaf
     * @returns {Proof} Proof of membership (or non-membership)
     */
    public get(index: bigint): Proof {
        let enables = 0n
        const siblings: bigint[] = []
        let child = this._root
        // root->leaf
        for (let i = 0; i < this._depth; i++) {
            // MSB->LSB
            let j = Number((index >> BigInt(this._depth - i - 1)) & 1n) as 0 | 1
            const sibling = this.db.get(child)?.[j ^ 1] || this._zeroElement
            child = this.db.get(child)?.[j] || this._zeroElement
            if (sibling > 0n) {
                siblings.unshift(sibling)
                enables |= 1n << BigInt(this._depth - i - 1)
            }
        }
        let exists = true
        const leafKeyValue = this.db.get(child)
        if (!leafKeyValue) {
            exists = false
        }
        if (leafKeyValue && leafKeyValue.length < 3) {
            throw new Error(`Invariant error: ${leafKeyValue} not a leaf: ${leafKeyValue}`)
        }

        return {
            exists,
            leaf: this._serialiserFn(child),
            value: leafKeyValue ? this._serialiserFn(leafKeyValue[1]) : null,
            index,
            enables,
            siblings: siblings.map(this._serialiserFn),
        }
    }

    /**
     * Verify membership of a leaf using a Merkle proof.
     *
     * @param leaf Leaf = H(key, value, 1)
     * @param index Index = H(key), i.e. path of leaf in the Merkle tree
     * @param enables 256-bitstring signifying which siblings are non-zero in the path
     * @param siblings Non-zero sibling subtree hashes
     * @returns {boolean} true if the proof is valid for this tree
     */
    public verifyProof(leaf: string, index: bigint, enables: bigint, siblings: string[]): boolean {
        // rebuild root from leaf->root
        let root = this._deserialiserFn(leaf)
        let s = 0
        for (let i = 0; i < this._depth; i++) {
            // LSB->MSB
            let j = Number((index >> BigInt(i)) & 1n) as 0 | 1
            const isRightChild = Boolean(j)
            const sibling =
                (enables >> BigInt(i)) & 1n
                    ? this._deserialiserFn(siblings[s++])
                    : this._zeroElement
            const children: [bigint, bigint] = isRightChild ? [sibling, root] : [root, sibling]
            // Create new parent hash & store
            root = this.hash(...children)
        }
        return root === this._root
    }

    /**
     * Walk down the tree to determine whether a key exists in the database.
     *
     * @param index Index of leaf
     * @returns true if key exists
     */
    public exists(index: bigint): boolean {
        let leaf = this._root
        for (let i = 0; i < this._depth; i++) {
            // MSB->LSB
            let j = Number((index >> BigInt(this._depth - i - 1)) & 1n) as 0 | 1
            leaf = this.db.get(leaf)?.[j] || this._zeroElement
            if (leaf === this._zeroElement) break
        }
        return leaf !== this._zeroElement
    }

    /**
     * Insert a (key,value) into the database. Throws if key already exists.
     *
     * @param index Index of leaf
     * @param leaf Value of leaf
     * @returns {Proof} Membership of previous (key,value) leaf
     */
    public insert(index: bigint, leaf: string): UpdateProof {
        if (this.exists(index)) {
            throw new Error(`Leaf at index ${index} already exists!`)
        }

        return this.upsert(index, leaf)
    }

    /**
     * Update a value belonging to an existing key. Throws if key does not exist.
     *
     * @param index Index of leaf
     * @param newLeaf New value of leaf
     * @returns {Proof} Membership of previous (key,value) leaf
     */
    public update(index: bigint, newLeaf: string): UpdateProof {
        if (!this.exists(index)) {
            throw new Error(`Leaf at index ${index} does not exist!`)
        }

        return this.upsert(index, newLeaf)
    }

    /**
     * Update the value of a leaf at a specified index
     *
     * @param index Index of leaf
     * @param newLeaf_ New value of leaf
     * @returns {Proof} Membership of previous (key,value) leaf
     */
    private upsert(index: bigint, newLeaf_: string): UpdateProof {
        const newLeaf = this._deserialiserFn(newLeaf_)
        const proof = this.get(index)

        // 1. Walk root->leaf and delete parent hashes (collect siblings while
        // we're at it)
        const siblings: bigint[] = []
        let nextParent = this._root
        for (let i = 0; i < this._depth; i++) {
            const currParent = nextParent
            // MSB->LSB
            let j = Number((proof.index >> BigInt(this._depth - i - 1)) & 1n) as 0 | 1
            // Get children before we delete this parent entry
            const sibling = this.db.get(nextParent)?.[j ^ 1] || this._zeroElement
            siblings.push(sibling)
            nextParent = this.db.get(nextParent)?.[j] || this._zeroElement
            // Delete this parent entry
            this.db.delete(currParent)
        }

        // 2. Insert new leaf
        this.db.set(newLeaf, [index, newLeaf, 1n])

        // 3. Walk leaf->root and create parent hashes
        let child = newLeaf
        for (let i = 0; i < this._depth; i++) {
            // LSB->MSB
            let j = Number((proof.index >> BigInt(i)) & 1n) as 0 | 1
            const isRightChild = Boolean(j)
            const sibling = siblings.pop()!
            const children: [bigint, bigint] = isRightChild ? [sibling, child] : [child, sibling]
            // Create new parent hash & store
            const parent = this.hash(...children)
            this.db.set(parent, children)
            child = parent
        }
        this._root = child

        return {
            newLeaf: this._serialiserFn(newLeaf),
            ...proof,
        }
    }
}
