// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Script.sol";
import "../src/PayrollManager.sol";
import "../src/UltraVerifier.sol";

// pathUSD on Tempo Moderato testnet
address constant PATH_USD = 0x20C0000000000000000000000000000000000000;

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        // Reuse an existing verifier when VERIFIER_ADDRESS is set (it is unchanged
        // by the permissionless refactor); otherwise deploy a fresh one.
        address existingVerifier = vm.envOr("VERIFIER_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        address verifierAddr = existingVerifier;
        if (verifierAddr == address(0)) {
            verifierAddr = address(new HonkVerifier());
        }
        PayrollManager payrollManager = new PayrollManager(verifierAddr, PATH_USD);

        vm.stopBroadcast();

        console.log("HonkVerifier:   ", verifierAddr);
        console.log("PayrollManager: ", address(payrollManager));
    }
}
