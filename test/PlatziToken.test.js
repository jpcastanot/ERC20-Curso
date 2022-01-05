const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const initialSupply = 1000000;
const tokenName = "PlatziToken";
const tokenSymbol = "PLZ";

describe("Platzi token tests", function() {
  before(async function() {
    const availableSigners = await ethers.getSigners();
    this.deployer = availableSigners[0];

    const PlatziToken = await ethers.getContractFactory("PlatziToken");

    // this.platziToken = await PlatziToken.deploy(initialSupply);
    this.platziToken = await upgrades.deployProxy(PlatziToken, [initialSupply], { kind: "uups" });
    await this.platziToken.deployed();
  });

  it('Should be named PlatziToken', async function() {
    const fetchedTokenName = await this.platziToken.name();
    expect(fetchedTokenName).to.be.equal(tokenName);
  });

  it('Should have symbol "PLZ"', async function() {
    const fetchedTokenSymbol = await this.platziToken.symbol();
    expect(fetchedTokenSymbol).to.be.equal(tokenSymbol);
  });

  it('Should have totalSupply passed in during deploying', async function() {
    const [ fetchedTotalSupply, decimals ] = await Promise.all([
      this.platziToken.totalSupply(),
      this.platziToken.decimals(),
    ]);
    const expectedTotalSupply = ethers.BigNumber.from(initialSupply).mul(ethers.BigNumber.from(10).pow(decimals));
    expect(fetchedTotalSupply.eq(expectedTotalSupply)).to.be.true;
  });
});