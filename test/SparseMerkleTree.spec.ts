import { expect } from 'chai'
import { ethers } from 'hardhat'
import { SMTConsumer, SMTConsumer__factory } from '../typechain-types'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { SparseMerkleTree } from '../lib/SparseMerkleTree'

const TREE_DEPTH = 32

function genAddresses(n: number) {
    return Array(n)
        .fill(0)
        .map((_) => ethers.Wallet.createRandom().address)
}

function genHashedAddresses(n: number) {
    return genAddresses(n).map((address) => ethers.keccak256(address))
}

describe('SparseMerkleTree', () => {
    let smt: SMTConsumer
    let deployer: SignerWithAddress
    let merkleTree: SparseMerkleTree
    beforeEach(async () => {
        ;[deployer] = await ethers.getSigners()
        // Contract
        smt = await new SMTConsumer__factory(deployer).deploy(TREE_DEPTH)
        // Offchain
        merkleTree = new SparseMerkleTree(TREE_DEPTH, [], {
            hashFunction: (left, right) => {
                return BigInt(left) === 0n && BigInt(right) === 0n
                    ? ethers.ZeroHash
                    : ethers.keccak256(ethers.concat([left as string, right as string]))
            },
            zeroElement: ethers.ZeroHash,
        })
    })

    it('should verify empty proof for uninitialised leaf', async () => {
        const index = 890547508
        const { leaf, enables, path } = merkleTree.getProofArgs(index)
        expect(await smt.computeRoot(leaf as string, index, enables, path as string[])).to.eq(
            merkleTree.root,
        )
    })

    it('should compute correct roots', async () => {
        expect(merkleTree.root).to.eq(ethers.ZeroHash)
        // 0
        merkleTree.insert(ethers.ZeroHash)
        expect(merkleTree.root).to.eq(ethers.ZeroHash)

        // update 0th element with non-zero value
        {
            const newLeaf = ethers.hexlify(ethers.randomBytes(32))
            merkleTree.update(0, newLeaf)
            const { enables, path } = merkleTree.getProofArgs(0)
            expect(await smt.computeRoot(newLeaf, 0, enables, path as string[])).to.eq(
                merkleTree.root,
            )
        }

        // update 1st element
        {
            // const newLeaf = ethers.hexlify(ethers.randomBytes(32))
            const newLeaf = ethers.keccak256(ethers.Wallet.createRandom().address)
            merkleTree.insert(newLeaf)
            const index = 1
            const { enables, path } = merkleTree.getProofArgs(index)
            expect(await smt.computeRoot(newLeaf, index, enables, path as string[])).to.eq(
                merkleTree.root,
            )
        }
    })

    it('should compute correct root after inserting', async () => {
        expect(merkleTree.root).to.eq(ethers.ZeroHash)
        const hashedAddresses = genHashedAddresses(10)
        for (let i = 0; i < hashedAddresses.length; i++) {
            // Insert new leaf by updating the newly-inserted zero element with an actual value
            const { leaf: oldLeaf, enables, path } = merkleTree.insert(hashedAddresses[i])
            expect(BigInt(oldLeaf)).to.eq(0n)
            await smt.updateRoot(
                hashedAddresses[i],
                oldLeaf as string,
                i,
                enables,
                path as string[],
            )
            expect(await smt.root()).to.eq(merkleTree.root)
        }
    })

    it('should compute correct root with zero-value compressed path elements', async () => {
        expect(merkleTree.root).to.eq(ethers.ZeroHash)
        const hashedAddresses = genHashedAddresses(10)
        for (let i = 0; i < hashedAddresses.length; i++) {
            // Get proof of *current* leaf
            const { leaf: oldLeaf, enables, path } = merkleTree.getProofArgs(i)
            expect(BigInt(oldLeaf)).to.eq(0n)
            // Insert new leaf by updating the newly-inserted zero element with an actual value
            merkleTree.insert(hashedAddresses[i])
            await smt.updateRoot(
                hashedAddresses[i],
                oldLeaf as string,
                i,
                enables,
                path as string[],
            )
            expect(await smt.root()).to.eq(merkleTree.root)
        }

        // Zero-out elements on the left
        for (let i = 0; i < 9; i++) {
            const newLeaf = ethers.ZeroHash
            const { leaf: oldLeaf, enables, path } = merkleTree.getProofArgs(i)
            merkleTree.update(i, newLeaf)
            await smt.updateRoot(newLeaf, oldLeaf as string, i, enables, path as string[])
        }
    })

    it('should revert if index out-of-range', async () => {
        const { leaf, enables, path } = merkleTree.getProofArgs(0)
        const outOfRangeIndex = 2 ** TREE_DEPTH
        await expect(smt.computeRoot(leaf as string, outOfRangeIndex, enables, path as string[]))
            .to.be.revertedWithCustomError(smt, 'OutOfRange')
            .withArgs(outOfRangeIndex)
    })
})
