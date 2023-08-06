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

    /// @notice Compute new Merkle root (Ref. Solidity implementation)
    /// @param treeDepth Depth of Merkle tree
    /// @param leaf Leaf
    /// @param index Index of leaf in list; determines hashing direction for
    ///     proof path elements
    /// @param enables Each bit determines whether a sibling element should be
    ///     used (1) or a zero-value hash (0)
    /// @param siblings Siblings in the path; elements only need to be defined
    ///     for non-zero siblings
    function computeRoot_REF(
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
            sibling = ((enables >> i) & 1) == 1 ? siblings[s++] : bytes32(0);
            leaf = ((index >> i) & 1) == 1
                ? hash(sibling, leaf)
                : hash(leaf, sibling);
        }
        return leaf;
    }

    /// @notice Compute new Merkle root
    /// @dev Yul saves ~50k gas on average
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
        assembly {
            let sPtr := siblings.offset
            let sEnd := add(siblings.offset, mul(siblings.length, 0x20))
            for {
                let i := 0
            } lt(i, treeDepth) {
                i := add(i, 1)
            } {
                let sibling := 0
                // (enables >> i) & 1
                if and(shr(i, enables), 1) {
                    if iszero(lt(sPtr, sEnd)) {
                        revert(0, 0) // PANIK
                    }
                    sibling := calldataload(sPtr)
                    sPtr := add(sPtr, 0x20)
                }
                // (index >> i) & 1
                let dir := and(shr(i, index), 1)
                mstore(mul(dir, 0x20), leaf)
                mstore(mul(iszero(dir), 0x20), sibling)
                leaf := keccak256(0, 0x40)
                if eq(
                    leaf,
                    0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5
                ) {
                    // leaf == keccak256(abi.encode(uint256(0),uint256(0)))
                    leaf := 0
                }
            }
        }
        return leaf;
    }
}
