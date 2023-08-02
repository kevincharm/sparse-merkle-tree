// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

/// @title SparseMerkleTree
/// @author kevincharm
/// @notice Optimised SMT implementation
library SparseMerkleTree {
    error InvalidTreeDepth(uint16 treeDepth);
    error OutOfRange(uint256 index);

    /// @notice keccak hash, but returns 0 if both inputs are 0
    /// @param left Left value
    /// @param right Right value
    function hash(
        bytes32 left,
        bytes32 right
    ) internal pure returns (bytes32 ret) {
        assembly {
            if iszero(and(iszero(left), iszero(right))) {
                mstore(0, left)
                mstore(32, right)
                ret := keccak256(0, 64)
            }
        }
    }

    /// @notice Compute new Merkle root
    /// @param treeDepth Depth of Merkle tree
    /// @param leaf Leaf
    /// @param index Index of leaf in list; determines hashing direction for
    ///     proof path elements
    /// @param enables Each bit determines whether a sibling element should be
    ///     used (1) or a zero-value hash (0)
    /// @param siblings Siblings in the path; elements only need to be defined
    ///     for non-zero siblings
    function computeRoot(
        uint16 treeDepth,
        bytes32 leaf,
        uint256 index,
        uint256 enables,
        bytes32[] calldata siblings
    ) internal pure returns (bytes32) {
        // Tree depth must be in [0, 256]
        if (treeDepth > 256) revert InvalidTreeDepth(treeDepth);
        // Index must be within the capacity of the tree
        if (treeDepth < 256 && index >= 2 ** treeDepth)
            revert OutOfRange(index);
        // Keep track of the paths already consumed
        uint256 s;
        bytes32 sibling;
        for (uint256 i; i < treeDepth; ++i) {
            // Take the sibling as the next proof path element if bit enabled,
            // otherwise set it to the special zero-value
            sibling = ((enables >> (i)) & 1) == 1 ? siblings[s++] : bytes32(0);
            leaf = ((index >> i) & 1) == 1
                ? hash(sibling, leaf)
                : hash(leaf, sibling);
        }
        return leaf;
    }
}
