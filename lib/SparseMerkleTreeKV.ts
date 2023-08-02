import { keccak, deserialise, serialise } from './utils'

export const SMT_DEPTH = 256

export const ZERO = 0n

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
    hashFn?: HashFunction
    deserialiserFn?: DeserialiserFunction
    serialiserFn?: SerialiserFunction
}

/**
 * SparseMerkleTreeKV
 * SMT-backed key-value database.
 */
export class SparseMerkleTreeKV {
    public db: Map<bigint, [bigint, bigint, bigint?]> = new Map()
    private _root: bigint
    private _hashFn: HashFunction
    private _deserialiserFn: DeserialiserFunction
    private _serialiserFn: SerialiserFunction

    constructor(options: SparseMerkleTreeKVOptions = {}) {
        this._root = 0n
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
     * Get a proof of membership (or non-membership) of a key
     *
     * @param key Key
     * @returns {Proof} Proof of membership (or non-membership)
     */
    public get(key: string): Proof {
        const index = this.hash(this._deserialiserFn(key))

        let enables = 0n
        const siblings: bigint[] = []
        let child = this._root
        // root->leaf
        for (let i = 0; i < SMT_DEPTH; i++) {
            // MSB->LSB
            let j = Number((index >> BigInt(SMT_DEPTH - i - 1)) & 1n) as 0 | 1
            const sibling = this.db.get(child)?.[j ^ 1] || ZERO
            child = this.db.get(child)?.[j] || ZERO
            if (sibling > 0n) {
                siblings.unshift(sibling)
                enables |= 1n << BigInt(SMT_DEPTH - i - 1)
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
        for (let i = 0; i < SMT_DEPTH; i++) {
            // LSB->MSB
            let j = Number((index >> BigInt(i)) & 1n) as 0 | 1
            const isRightChild = Boolean(j)
            const sibling = (enables >> BigInt(i)) & 1n ? this._deserialiserFn(siblings[s++]) : ZERO
            const children: [bigint, bigint] = isRightChild ? [sibling, root] : [root, sibling]
            // Create new parent hash & store
            root = this.hash(...children)
        }
        return root === this._root
    }

    /**
     * Walk down the tree to determine whether a key exists in the database.
     *
     * @param key
     * @returns true if key exists
     */
    public exists(key: bigint): boolean {
        const index = this.hash(key)

        let leaf = this._root
        for (let i = 0; i < SMT_DEPTH; i++) {
            // MSB->LSB
            let j = Number((index >> BigInt(SMT_DEPTH - i - 1)) & 1n) as 0 | 1
            leaf = this.db.get(leaf)?.[j] || ZERO
            if (leaf === ZERO) break
        }
        return leaf !== ZERO
    }

    /**
     * Insert a (key,value) into the database. Throws if key already exists.
     *
     * @param key Key
     * @param value Value
     * @returns {Proof} Membership of previous (key,value) leaf
     */
    public insert(key: string, value: string): UpdateProof {
        const key_ = this._deserialiserFn(key)
        const index = this.hash(key_)
        if (this.exists(key_)) {
            throw new Error(`Leaf with key ${key_}@${index} already exists!`)
        }

        return this.upsert(key, value)
    }

    /**
     * Update a value belonging to an existing key. Throws if key does not exist.
     *
     * @param key Key
     * @param value New value
     * @returns {Proof} Membership of previous (key,value) leaf
     */
    public update(key: string, value: string): UpdateProof {
        const key_ = this._deserialiserFn(key)
        const index = this.hash(key_)
        if (!this.exists(key_)) {
            throw new Error(`Leaf with key ${key}@${index} does not exist!`)
        }

        return this.upsert(key, value)
    }

    /**
     * Update a value at key, regardless of whether it already exists or not.
     *
     * @param key Key
     * @param value Value
     * @returns {Proof} Membership of previous (key,value) leaf
     */
    private upsert(key: string, value: string): UpdateProof {
        const key_ = this._deserialiserFn(key)
        const value_ = this._deserialiserFn(value)
        const proof = this.get(key)

        // 1. Walk root->leaf and delete parent hashes (collect siblings while
        // we're at it)
        const siblings: bigint[] = []
        let nextParent = this._root
        for (let i = 0; i < SMT_DEPTH; i++) {
            const currParent = nextParent
            // MSB->LSB
            let j = Number((proof.index >> BigInt(SMT_DEPTH - i - 1)) & 1n) as 0 | 1
            // Get children before we delete this parent entry
            const sibling = this.db.get(nextParent)?.[j ^ 1] || ZERO
            siblings.push(sibling)
            nextParent = this.db.get(nextParent)?.[j] || ZERO
            // Delete this parent entry
            this.db.delete(currParent)
        }

        // 2. Insert new leaf
        const leaf = this.hash(key_, value_, 1n)
        this.db.set(leaf, [key_, value_, 1n])

        // 3. Walk leaf->root and create parent hashes
        let child = leaf
        for (let i = 0; i < SMT_DEPTH; i++) {
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
            newLeaf: this._serialiserFn(leaf),
            ...proof,
        }
    }
}
