# Sparse Merkle Tree

Sparse Merkle Tree (SMT) implementation in Solidity with accompanying JavaScript library. This SMT implementation uses `bytes32(0)` as the empty node value so that paths representing empty subtrees in the Merkle proof may be omitted. This proof compression technique is described by Vitalik in [Optimizing sparse Merkle trees](https://ethresear.ch/t/optimizing-sparse-merkle-trees/3751).

## Installation

```sh
yarn add @kevincharm/sparse-merkle-tree fixed-merkle-tree
```

The accompanying client-side JavaScript library extends Tornado Cash's [fixed-merkle-tree](https://github.com/tornadocash/fixed-merkle-tree), which is required as a peer dependency.

## Onchain usage

Below is an example contract that keeps track of only the current SMT root, and allows updating any leaf with a new value given the old leaf value and the Merkle proof.

```solidity
import { SparseMerkleTree } from '@kevincharm/sparse-merkle-tree/contracts/SparseMerkleTree.sol';

/// @notice Example SparseMerkleTree consumer
contract SMTConsumer {
    /// @notice Depth of Merkle tree
    uint8 immutable treeDepth;
    /// @notice Current Merkle root
    bytes32 public root;

    /// @param treeDepth_ The tree depth determines the capacity of the tree,
    ///     and must not change. `capacity = 2**treeDepth`
    constructor(uint8 treeDepth_) {
        treeDepth = treeDepth_;
    }

    /// @notice Update a leaf in the tree, producing a new root.
    /// @param newLeaf New value of leaf
    /// @param oldLeaf Current leaf
    /// @param index Index of leaf in list; determines hashing direction for
    ///     proof path elements
    /// @param enables Each bit determines whether a proof path element should
    ///     be used (1) or a zero-value hash (0)
    /// @param path Proof path; elements only need to be defined for non-zero
    ///     siblings
    function updateRoot(
        bytes32 newLeaf,
        bytes32 oldLeaf,
        uint256 index,
        uint256 enables,
        bytes32[] calldata path
    ) external returns (bytes32) {
        if (root != SparseMerkleTree.computeRoot(oldLeaf, index, enables, path)) {
            revert InvalidProof(oldLeaf, index, enables, path);
        }
        // Replace with new leaf and compute new root
        return (root = SparseMerkleTree.computeRoot(newLeaf, index, enables, path));
    }
}
```

## Offchain usage

Below is an example JavaScript snippet that instantiates an SMT, then inserts a new leaf into the SMT, and finally submits the update to a contract using the generated Merkle proofs.

```ts
import { SparseMerkleTree } from '@kevincharm/sparse-merkle-tree'
import { ZeroHash, keccak256, concat, Wallet, Contract } from 'ethers'

// Initialise client representation of an empty SMT
const TREE_DEPTH = 32
const smt = new SparseMerkleTree(TREE_DEPTH, [], {
    hashFunction: (left, right) => {
        return BigInt(left) === 0n && BigInt(right) === 0n
            ? ZeroHash
            : keccak256(concat([left as string, right as string]))
    },
    zeroElement: ZeroHash,
})

// Insert a new leaf
const newLeaf = keccak256(keccak256(Wallet.createRandom().address))
const { leaf: oldLeaf, index, enables, path } = smt.insert(newLeaf)
// Connect to the contract that is consuming the SMT library
const smtConsumer = new Contract(...)
// We update the SMT onchain by providing:
//  - The new value of the leaf
//  - The proof of membership of the old leaf value
await smtConsumer.updateRoot(
    newLeaf /** new leaf value */,
    oldLeaf as string,
    index,
    enables,
    path as string[],
)
// After the update, the onchain SMT should be synced with the client-side
assert((await smtConsumer.root()) === smt.root)
```

## Disclaimer

This software is unaudited and probably contains bugs. Use at your own risk.

## License

MIT
