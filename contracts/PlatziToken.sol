// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract PlatziToken is ERC20Upgradeable {

  function initialize(uint256 initialSupply) initializer public {
    __ERC20_init("PlatziToken", "PLZ");
    _mint(msg.sender, initialSupply * (10 ** decimals()));
  }
}