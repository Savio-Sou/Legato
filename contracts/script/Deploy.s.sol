// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Script.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
// Both generated verifiers declare `contract HonkVerifier` plus identically-named helper libraries,
// so they are imported under module aliases to keep their symbols from colliding.
import "../src/DepositVerifier.sol" as DepositV;
import "../src/WithdrawVerifier.sol" as WithdrawV;

// pathUSD on Tempo Moderato testnet
address constant PATH_USD = 0x20C0000000000000000000000000000000000000;
uint32 constant TREE_LEVELS = 16;

/// Deploys the deposit + withdraw verifiers and the ShieldedPool. The PoseidonT3 library the pool's
/// Merkle tree uses is auto-deployed and linked by forge during broadcast.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        address depositVerifier = address(new DepositV.HonkVerifier());
        address withdrawVerifier = address(new WithdrawV.HonkVerifier());
        ShieldedPool pool = new ShieldedPool(depositVerifier, withdrawVerifier, PATH_USD, TREE_LEVELS);

        vm.stopBroadcast();

        console.log("DepositVerifier: ", depositVerifier);
        console.log("WithdrawVerifier:", withdrawVerifier);
        console.log("ShieldedPool:    ", address(pool));
    }
}
