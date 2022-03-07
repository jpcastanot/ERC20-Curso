// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

contract PlatziTokenForwarder is EIP712 {
    struct MetaTx {
        address from;
        address to;
        uint256 nonce;
        bytes data;
    }

    bytes32 private constant _SIGNATURE_STRUCT_HASH =
        keccak256("MetaTx(address from,address to,uint256 nonce,bytes data)");

    mapping(address => uint256) private _nonces;

    constructor() EIP712("PlatziTokenForwarder", "0.0.1") {}

    function getNonce(address from) public view returns (uint256) {
        return _nonces[from];
    }

    function _verifyMetaTx(MetaTx calldata metaTx, bytes calldata signature)
        private
        view
        returns (bool)
    {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    _SIGNATURE_STRUCT_HASH,
                    metaTx.from,
                    metaTx.to,
                    metaTx.nonce,
                    keccak256(metaTx.data)
                )
            )
        );

        address metaTxSigner = ECDSA.recover(digest, signature);
        return metaTxSigner == metaTx.from;
    }

    function executeFunction(MetaTx calldata metaTx, bytes calldata signature)
        public
        returns (bool)
    {
        require(
            _verifyMetaTx(metaTx, signature),
            "PlatziTokenForwarder: Invalid signature"
        );
        _nonces[metaTx.from] = metaTx.nonce + 1;

        (bool success, ) = metaTx.to.call(
            abi.encodePacked(metaTx.data, metaTx.from)
        );
        return success;
    }
}
