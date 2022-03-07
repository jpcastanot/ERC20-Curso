const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const initialSupply = 1000000;
const tokenName = "PlatziToken";
const tokenSymbol = "PLZ";

const eip712DomainTypeDefinition = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const metaTxTypeDefinition = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "data", type: "bytes" },
];

function getTypedData(typedDataInput) {
  return {
    types: {
      EIP712Domain: eip712DomainTypeDefinition,
      [typedDataInput.primaryType]: metaTxTypeDefinition,
    },
    primaryType: typedDataInput.primaryType,
    domain: typedDataInput.domainValues,
    message: typedDataInput.messageValues,
  };
}

describe("Platzi token tests", function() {
  let platziTokenV1;
  let platziTokenV2;
  let platziTokenV3;
  let platziTokenForwarder;
  let deployer;
  let userAccount;
  let receiverAccount;
  let relayerAccount;

  describe("V1 tests", function () {
    before(async function() {
      const availableSigners = await ethers.getSigners();
      deployer = availableSigners[0];

      const PlatziToken = await ethers.getContractFactory("PlatziTokenV1");

      // this.platziTokenV1 = await PlatziToken.deploy(initialSupply);
      platziTokenV1 = await upgrades.deployProxy(PlatziToken, [initialSupply], { kind: "uups" });
      await platziTokenV1.deployed();
    });

    it('Should be named PlatziToken', async function() {
      const fetchedTokenName = await platziTokenV1.name();
      expect(fetchedTokenName).to.be.equal(tokenName);
    });

    it('Should have symbol "PLZ"', async function() {
      const fetchedTokenSymbol = await platziTokenV1.symbol();
      expect(fetchedTokenSymbol).to.be.equal(tokenSymbol);
    });

    it('Should have totalSupply passed in during deployment', async function() {
      const [ fetchedTotalSupply, decimals ] = await Promise.all([
        platziTokenV1.totalSupply(),
        platziTokenV1.decimals(),
      ]);
      const expectedTotalSupply = ethers.BigNumber.from(initialSupply).mul(ethers.BigNumber.from(10).pow(decimals));
      expect(fetchedTotalSupply.eq(expectedTotalSupply)).to.be.true;
    });
  });

  describe("V2 tests", function () {
    before(async function () {

      userAccount = (await ethers.getSigners())[1];

      const PlatziTokenV2 = await ethers.getContractFactory("PlatziTokenV2");

      platziTokenV2 = await upgrades.upgradeProxy(platziTokenV1.address, PlatziTokenV2);

      await platziTokenV2.deployed();
    });

    it("Should revert when an account other than the owner is trying to mint tokens", async function() {
      const tmpContractRef = await platziTokenV2.connect(userAccount);
      try {
        await tmpContractRef.mint(userAccount.address, ethers.BigNumber.from(10).pow(ethers.BigNumber.from(18)));
      } catch (ex) {
        expect(ex.message).to.contain("reverted");
        expect(ex.message).to.contain("Ownable: caller is not the owner");
      }
    });

    it("Should mint tokens when the owner is executing the mint function", async function () {
      const amountToMint = ethers.BigNumber.from(10).pow(ethers.BigNumber.from(18)).mul(ethers.BigNumber.from(10));
      const accountAmountBeforeMint = await platziTokenV2.balanceOf(deployer.address);
      const totalSupplyBeforeMint = await platziTokenV2.totalSupply();
      await platziTokenV2.mint(deployer.address, amountToMint);

      const newAccountAmount = await platziTokenV2.balanceOf(deployer.address);
      const newTotalSupply = await platziTokenV2.totalSupply();
      
      expect(newAccountAmount.eq(accountAmountBeforeMint.add(amountToMint))).to.be.true;
      expect(newTotalSupply.eq(totalSupplyBeforeMint.add(amountToMint))).to.be.true;
    });
  });

  describe("V3 tests", function () {
    
    before(async function () {

      const availableSigners = await ethers.getSigners();
      deployer = availableSigners[0];
      userAccount = availableSigners[1];
      receiverAccount = availableSigners[2];
      relayerAccount = availableSigners[3];

      const PlatziTokenV3 = await ethers.getContractFactory("PlatziTokenV3");
      const PlatziTokenForwarder = await ethers.getContractFactory("PlatziTokenForwarder");

      platziTokenForwarder = await PlatziTokenForwarder.deploy();
      await platziTokenForwarder.deployed();

      platziTokenV3 = await upgrades.deployProxy(PlatziTokenV3, [initialSupply, platziTokenForwarder.address], { kind: "uups" });
      await platziTokenV3.deployed();
    });

    it("Transfer tokens from account A to B without account A paying for gas fees", async function () {

      const forwarderContractTmpInstance = await platziTokenForwarder.connect(relayerAccount);

      const { chainId } = await relayerAccount.provider.getNetwork();
      const userAccountA = deployer;
      const userAccountB = receiverAccount;

      const userAccountAEthersBeforeTx = await userAccountA.getBalance();
      const relayerAccountEthersBeforeTx = await relayerAccount.getBalance();

      const relayerTokensBeforeTx = await platziTokenV3.balanceOf(relayerAccount.address);
      const userACurrentNonce = await platziTokenForwarder.getNonce(userAccountA.address);

      const totalAmountToTransfer = ethers.BigNumber.from(1).mul(ethers.BigNumber.from(10).pow(10));

      const messageValues = {
        from: userAccountA.address,
        to: platziTokenV3.address,
        nonce: userACurrentNonce.toString(),
        data: platziTokenV3.interface.encodeFunctionData("transfer", [
          userAccountB.address,
          totalAmountToTransfer,
        ])
      };

      const typedData = getTypedData({
        domainValues: {
          name: "PlatziTokenForwarder",
          version: "0.0.1",
          chainId: chainId,
          verifyingContract: platziTokenForwarder.address,
        },
        primaryType: "MetaTx",
        messageValues,
      });

      const signedMessage = await ethers.provider.send("eth_signTypedData_v4", [userAccountA.address, typedData]);

      await forwarderContractTmpInstance.executeFunction(messageValues, signedMessage);

      const userAccountAEthersAfterTx = await userAccountA.getBalance();
      const relayerAccountEthersAfterTx = await relayerAccount.getBalance();
      const relayerTokensAfterTx = await platziTokenV3.balanceOf(relayerAccount.address);

      const userAccountBtokens = await platziTokenV3.balanceOf(userAccountB.address);
      
      expect(userAccountBtokens.eq(totalAmountToTransfer)).to.be.true;
      expect(userAccountAEthersBeforeTx.eq(userAccountAEthersAfterTx)).to.be.true;
      expect(relayerAccountEthersAfterTx.lt(relayerAccountEthersBeforeTx)).to.be.true;
      expect(relayerTokensAfterTx.eq(relayerTokensBeforeTx));

    });
  });
});