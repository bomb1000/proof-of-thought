// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PoTReportRegistry {
    struct Report {
        bytes32 storageRootHash;
        uint256 timestamp;
        address reporter;
    }

    mapping(bytes32 => Report) public reports;

    event ReportRegistered(
        bytes32 indexed potHash,
        bytes32 storageRootHash,
        address indexed reporter,
        uint256 timestamp
    );

    function registerReport(bytes32 potHash, bytes32 storageRootHash) external {
        reports[potHash] = Report({
            storageRootHash: storageRootHash,
            timestamp: block.timestamp,
            reporter: msg.sender
        });
        emit ReportRegistered(potHash, storageRootHash, msg.sender, block.timestamp);
    }

    function getReport(bytes32 potHash) external view returns (bytes32 storageRootHash, uint256 timestamp, address reporter) {
        Report storage r = reports[potHash];
        return (r.storageRootHash, r.timestamp, r.reporter);
    }
}
