import { expect } from 'chai'
import { ethers } from 'hardhat'
import { SMTConsumer, SMTConsumer__factory } from '../typechain-types'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { MerkleTree } from 'fixed-merkle-tree'
import { toProofArgs } from '../lib/toProofArgs'

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
    let merkleTree: MerkleTree
    beforeEach(async () => {
        ;[deployer] = await ethers.getSigners()
        // Contract
        smt = await new SMTConsumer__factory(deployer).deploy(TREE_DEPTH)
        // Offchain
        merkleTree = new MerkleTree(TREE_DEPTH, [], {
            hashFunction: (left, right) => {
                return BigInt(left) === 0n && BigInt(right) === 0n
                    ? ethers.ZeroHash
                    : ethers.keccak256(ethers.concat([left as string, right as string]))
            },
            zeroElement: ethers.ZeroHash,
        })
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
            const proof = merkleTree.path(0)
            const { enables, path } = toProofArgs(proof)
            expect(await smt.computeRoot(newLeaf, 0, enables, path)).to.eq(merkleTree.root)
        }

        // update 1st element
        {
            const newLeaf = ethers.hexlify(ethers.randomBytes(32))
            merkleTree.insert(newLeaf)
            const proof = merkleTree.path(1)
            const { enables, path } = toProofArgs(proof)
            expect(await smt.computeRoot(newLeaf, 1, enables, path)).to.eq(merkleTree.root)
        }
    })

    it('should compute correct root after inserting', async () => {
        expect(merkleTree.root).to.eq(ethers.ZeroHash)
        const hashedAddresses = genHashedAddresses(10)
        for (let i = 0; i < hashedAddresses.length; i++) {
            // We need to explicitly insert a zero element here for fixed-merkle-tree
            merkleTree.insert(ethers.ZeroHash)
            expect(merkleTree.elements.length).to.eq(i + 1)
            // Get proof of *old* leaf
            const proof = merkleTree.path(i)
            const { enables, path } = toProofArgs(proof)
            // Insert new leaf by updating the newly-inserted zero element with an actual value
            merkleTree.update(i, hashedAddresses[i])
            await smt.updateRoot(hashedAddresses[i], ethers.ZeroHash, i, enables, path)
            expect(await smt.root()).to.eq(merkleTree.root)
        }
    })
})
