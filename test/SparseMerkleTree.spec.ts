import { expect } from 'chai'
import { ethers } from 'hardhat'
import { SMTConsumer, SMTConsumer__factory } from '../typechain-types'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { SparseMerkleTreeKV } from '../lib/SparseMerkleTreeKV'

const TREE_DEPTH = 256

function genAddresses(n: number) {
    return Array(n)
        .fill(0)
        .map((_) => ethers.Wallet.createRandom().address)
}

function genHashedAddresses(n: number) {
    return genAddresses(n).map((address) => ethers.keccak256(address))
}

function hexPad32(input: string) {
    if (!input.startsWith('0x')) {
        throw new Error(`Invalid hex value: ${input}`)
    }
    if (input.length > 2 + 32 * 2) {
        throw new Error(`Invalid hex length: ${input}`)
    }
    return `0x${input.slice(2).padStart(32 * 2, '0')}`
}

describe('SparseMerkleTree', () => {
    let smt: SMTConsumer
    let deployer: SignerWithAddress
    let merkleTree: SparseMerkleTreeKV
    beforeEach(async () => {
        ;[deployer] = await ethers.getSigners()
        // Contract
        smt = await new SMTConsumer__factory(deployer).deploy(TREE_DEPTH)
        // Offchain
        merkleTree = new SparseMerkleTreeKV()
    })

    it('should verify empty proof for uninitialised leaf', async () => {
        const fooKey = ethers.solidityPackedKeccak256(['string'], ['foo'])
        const fooProof = merkleTree.get(fooKey)
        expect(
            merkleTree.verifyProof(
                fooProof.leaf,
                fooProof.index,
                fooProof.enables,
                fooProof.siblings,
            ),
        ).to.eq(true)
        expect(merkleTree.root).to.eq(0n)
        expect(
            await smt.computeRoot(
                fooProof.leaf,
                fooProof.index,
                fooProof.enables,
                fooProof.siblings,
            ),
        ).to.eq(ethers.ZeroHash)
    })

    it('should verify after insertion', async () => {
        const key = ethers.solidityPackedKeccak256(['string'], ['foo'])
        merkleTree.insert(key, '0xcafebabe')
        const key2 = ethers.solidityPackedKeccak256(['string'], ['bar'])
        merkleTree.insert(key2, '0xdeadbeef')
        const foo = merkleTree.get(key)!
        expect(foo.value).to.eq(hexPad32('0xcafebabe'))
        const bar = merkleTree.get(key2)!
        expect(bar.value).to.eq(hexPad32('0xdeadbeef'))
        expect(merkleTree.verifyProof(bar.leaf, bar.index, bar.enables, bar.siblings)).to.eq(true)
        expect(await smt.computeRoot(bar.leaf, bar.index, bar.enables, bar.siblings)).to.eq(
            merkleTree.root,
        )
    })

    it('should compute correct root after inserting', async () => {
        expect(merkleTree.root).to.eq(ethers.ZeroHash)
        const hashedAddresses = genHashedAddresses(10)
        for (let i = 0; i < hashedAddresses.length; i++) {
            // Insert new leaf by updating the newly-inserted zero element with an actual value
            const {
                newLeaf,
                leaf: oldLeaf,
                index,
                enables,
                siblings,
            } = merkleTree.insert(hashedAddresses[i], ethers.hashMessage('hello, world!'))
            await smt.updateRoot(newLeaf, oldLeaf, index, enables, siblings)
            expect(await smt.root()).to.eq(merkleTree.root)
        }
    })

    it('should revert if index out-of-range', async () => {
        smt = await new SMTConsumer__factory(deployer).deploy(32)
        const { leaf, enables, siblings } = merkleTree.get('0xcafebabe')
        const outOfRangeIndex = 2 ** 33 - 1
        await expect(smt.computeRoot(leaf, outOfRangeIndex, enables, siblings))
            .to.be.revertedWithCustomError(smt, 'OutOfRange')
            .withArgs(outOfRangeIndex)
    })

    it('should revert if specified tree depth is >256', async () => {
        // Redeploy with treeDepth=257 (not ok, but allowed by consumer)
        smt = await new SMTConsumer__factory(deployer).deploy(257)
        // Try to compute zero root, should fail
        await expect(smt.computeRoot(ethers.ZeroHash, ethers.MaxUint256, 0, []))
            .to.be.revertedWithCustomError(smt, 'InvalidTreeDepth')
            .withArgs(257)
    })
})
