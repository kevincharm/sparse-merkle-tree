// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {SparseMerkleTree} from "../SparseMerkleTree.sol";

/// @notice Example SparseMerkleTree consumer, where indices are the set of all
///     possible Ethereum addresses, and the values are strings
contract AddressKeyedSMT {
    /// @notice Depth of Merkle tree
    uint16 immutable treeDepth;
    /// @notice Merkle root
    bytes32 public root;

    event Updated(
        address account,
        string newValue,
        bytes32 newLeaf,
        bytes32 oldLeaf,
        uint256 enables,
        bytes32[] siblings
    );

    error InvalidProof(
        bytes32 leaf,
        uint256 index,
        uint256 enables,
        bytes32[] path
    );

    constructor(uint16 treeDepth_) {
        treeDepth = treeDepth_;
    }

    function computeRoot(
        bytes32 leaf,
        uint256 index,
        uint256 enables,
        bytes32[] calldata path
    ) public view returns (bytes32) {
        return
            SparseMerkleTree.computeRoot(treeDepth, leaf, index, enables, path);
    }

    /// @notice Update a leaf in the tree, producing a new root.
    /// @param enables Each bit determines whether a proof path element should
    ///     be used (1) or a zero-value hash (0)
    /// @param siblings Proof path; elements only need to be defined for non-zero
    ///     siblings
    function update(
        address account,
        string calldata newValue,
        bytes32 oldLeaf,
        uint256 enables,
        bytes32[] calldata siblings
    ) public returns (bytes32) {
        uint256 index = uint160(account);
        if (root != computeRoot(oldLeaf, index, enables, siblings)) {
            revert InvalidProof(oldLeaf, index, enables, siblings);
        }

        // Replace with new leaf and compute new root
        bytes32 newLeaf = keccak256(bytes(newValue));
        bytes32 newRoot = computeRoot(newLeaf, index, enables, siblings);
        root = newRoot;

        // Emit an event so we can index the tree offchain
        emit Updated(account, newValue, newLeaf, oldLeaf, enables, siblings);
        return newRoot;
    }
}
