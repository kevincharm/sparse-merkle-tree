# Sparse Merkle Tree

Sparse Merkle Tree (SMT) implementation in Solidity with accompanying JavaScript library. This SMT implementation uses `bytes32(0)` as the empty node value so that paths representing empty subtrees in the Merkle proof may be omitted. This proof compression technique is described by Vitalik in [Optimizing sparse Merkle trees](https://ethresear.ch/t/optimizing-sparse-merkle-trees/3751).

## Installation

```sh
yarn add @kevincharm/sparse-merkle-tree @noble/hashes
```

`@noble/hashes` is required as a peer dependency for the JS library.

## Onchain usage

Below is an example contract that keeps track of only the current SMT root, and allows updating any leaf with a new value given the old leaf value and the Merkle proof.

```solidity
import { SparseMerkleTree } from '@kevincharm/sparse-merkle-tree/contracts/SparseMerkleTree.sol';

/// @notice Example SparseMerkleTree consumer
contract SMTConsumer {
    /// @notice Depth of Merkle tree
    uint16 immutable treeDepth;
    /// @notice Current Merkle root
    bytes32 public root;

    /// @param treeDepth_ The tree depth determines the capacity of the tree,
    ///     and must not change. `capacity = 2**treeDepth`
    constructor(uint16 treeDepth_) {
        treeDepth = treeDepth_;
    }

    function computeRoot(
        bytes32 leaf,
        uint256 index,
        uint256 enables,
        bytes32[] calldata path
    ) public view returns (bytes32) {
        return SparseMerkleTree.computeRoot(treeDepth, leaf, index, enables, path);
    }

    /// @notice Update a leaf in the tree, producing a new root.
    /// @param newLeaf New value of leaf
    /// @param oldLeaf Current leaf
    /// @param index Index of leaf in list; determines hashing direction for
    ///     proof path elements
    /// @param enables Each bit determines whether a proof path element should
    ///     be used (1) or a zero-value hash (0)
    /// @param siblings Proof path; elements only need to be defined for non-zero
    ///     siblings
    function updateRoot(
        bytes32 newLeaf,
        bytes32 oldLeaf,
        uint256 index,
        uint256 enables,
        bytes32[] calldata siblings
    ) public returns (bytes32) {
        if (root != computeRoot(oldLeaf, index, enables, siblings)) {
            revert InvalidProof(oldLeaf, index, enables, siblings);
        }
        // Replace with new leaf and compute new root
        return (root = computeRoot(newLeaf, index, enables, siblings));
    }
}
```

## Offchain usage

Below is an example JavaScript snippet that instantiates an SMT, then inserts a new leaf into the SMT, and finally submits the update to a contract using the generated Merkle proofs.

```ts
import { SparseMerkleTreeKV } from '@kevincharm/sparse-merkle-tree'
import { ZeroHash, keccak256, concat, hashMessage, Wallet, Contract } from 'ethers'

// Initialise client representation of an empty SMT
const smt = new SparseMerkleTreeKV()

// Insert a new (K,V) entry
const key = keccak256(Wallet.createRandom().address)
const value = hashMessage('Fred Fredburger')
const { newLeaf, leaf: oldLeaf, index, enables, siblings } = smt.insert(key, value)
// Connect to the contract that is consuming the SMT library
const smtConsumer = new Contract(/** ... */)
// We update the SMT onchain by providing:
//  - The new value of the leaf
//  - The proof of membership of the old leaf value
await smtConsumer.updateRoot(newLeaf, oldLeaf, index, enables, siblings)
// The onchain SMT should now be synced with the client-side
assert((await smtConsumer.root()) === smt.root)
```

## Disclaimer

This software is unaudited and probably contains bugs. Use at your own risk.

## License

MIT
