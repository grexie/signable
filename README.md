# Grexie Signable

Inheritable solidity smart contract, ABIs and Node.js library to sign Web3 requests to a Signable contract.

## Installing

```bash
yarn add @grexie/signable
```

## Usage

This repository provides a solidity abstract contract that allows solidity methods to authorize transactions based on a secure signature generated from a known signer address, controlled by a backend such as Node.js on AWS.

The signer account private key can be stored in Grexie Vault or AWS Secrets Manager and consumed from AWS Lambda, EKS, ECS or EC2 and similar services from Google, etc. The suggestion is to rotate the signer account manually and regularly, and update the signer account from a signed method such as `setSigner` in the smart contract.

It is also possible to delegate the signer to a registry smart contract, so that all sub-contracts can use the same signer.

Each instance of the `Signable` contract generates its own `uniq` value, which cannot be changed for the lifetime of the contract. The `uniq` value protects against replay attacks across multiple instances of the same contract, on different chains or on the same chain. The `uniq` value is the `keccak256` hash of `block.timestamp` and `address(this)`.

To implement the `ISignable` interface one should create a smart contract such as the following:

```solidity
pragma solidity ^0.8.0;

import '@grexie/signable/contracts/Signable.sol';

contract MySignableContract is Signable {
  address private _signer;

  constructor(address signer_) {
    _signer = signer_;
  }

  function signer() public view virtual override(ISignable) returns (address) {
    return _signer;
  }

  function setSigner(address signer_, Signature calldata signature)
    external
    verifySignature(
      abi.encode(this.setSigner.selector, signer_),
      signature
    )
  {
    _signer = signer_;
  }
}
```

Then to call setSigner you would instantiate the `Signer` class in Node.js in a secure server environment and call the `Signer#sign` method. Note that this needs to be authenticated such that only users you want to have access to signer rotation can access this method. You need to plan carefully access to any signed method, and access to the private key.

```typescript
import ISignable from '@grexie/signable/contracts/ISignable.json';

const signer = Signer({
  keyStore: {
    async get(signerAddress: string): string {
      return MyKeyStore.get(signerAddress);
    },
  },
  address: process.env.CONTRACT_ADDRESS,
  web3,
});

const signature = await signer.sign(
  ISignable,
  'setSigner',
  userAddress,
  newSignerAddress
);
```

Then on the front end you can execute a gasless (user pays the gas fees) transaction for this method:

```typescript
const contract = new web3.eth.Contract(ISignable, process.env.CONTRACT_ADDRESS);

await contract.methods
  .setSigner(newSignerAddress, signature)
  .send({ from: userAddress });
```

Likewise you can secure any other method, including those using structs. Check out `Example.sol` in GitHub and the `signable.spec.js` for details of how this works and the test coverage.

The `Signer` Node.js class expects `verifySignature` in the contract to implement all method parameters, in order, except for the Signature parameter. You can therefore place the `Signable.Signature` argument anywhere in the method signature, and it will simply be filtered out by the `Signer` class when signing. We recommend to place it at the end of the argument list though for simplicity.

For example:

```solidity
struct MyStruct2 {
  string field3;
  string field4;
  string field5;
}

struct MyStruct1 {
  string field1;
  MyStruct2 field2;
}

function myMethodA(string calldata arg1, MyStruct1 calldata arg2, Signature calldata signature)
    external
    verifySignature(
      abi.encode(this.myMethodA.selector, arg1, arg2),
      signature
    )
  {
    ...
  }
```

The corresponding Node.js code:

```typescript
const args = [
  'arg1',
  {
    field1: 'value1',
    field2: {
      field3: 'value3',
      field4: 'value4',
      field5: 'value5',
    },
  },
];

const signature = await signer.sign(
  MyContractABI,
  'myMethodA',
  userAddress,
  ...args
);
```

And the front end code:

```typescript
const contract = new web3.eth.Contract(
  MyContractABI,
  process.env.CONTRACT_ADDRESS
);

await contract.methods
  .myMethodA(...args, signature)
  .send({ from: userAddress });
```
