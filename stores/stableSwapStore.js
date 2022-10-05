import {ACTIONS, CONTRACTS, ROUTE_ASSETS} from "./constants";
import {formatBN, parseBN, removeDuplicate} from "../utils";
import stores from "./";
import router from "next/router";
import {getNftById, getVeApr, getVeTotalPower, loadNfts} from "./helpers/ve-helper";
import {enrichPairInfo, getAndUpdatePair, getPairs, loadPair} from "./helpers/pair-helper";
import {removeBaseAsset, saveLocalAsset} from "./helpers/local-storage-helper";
import {getBalancesForBaseAssets, getBaseAssets, getOrCreateBaseAsset, getTokenBalance} from "./helpers/token-helper";
import {enrichAdditionalApr} from "./helpers/additional-apr-helper";
import {
  createGauge,
  createPairDeposit,
  removeLiquidity,
  stakeLiquidity,
  unstakeLiquidity
} from "./helpers/deposit-helper";
import {quoteAddLiquidity, quoteRemoveLiquidity, quoteSwap} from "./helpers/router-helper";
import {swap, unwrap, wrap} from "./helpers/swap-helper";
import {createVest, increaseVestAmount, increaseVestDuration, merge, withdrawVest} from "./helpers/vest-helper";
import {getVestVotes, resetVote, vote} from "./helpers/voter-helper";
import {createBribe} from "./helpers/bribe-helper";
import {
  claimAllRewards,
  claimBribes,
  claimPairFees,
  claimRewards,
  claimVeDist,
  getRewardBalances
} from "./helpers/reward-helper";
import {searchWhitelist, whitelistToken} from "./helpers/whitelist-helpers";
import {emitError} from "./helpers/emit-helper";

class Store {

  configurationLoading = false;
  userAddress = null;
  id = null;

  constructor(dispatcher, emitter) {
    this.id = Date.now()
    this.dispatcher = dispatcher;
    this.emitter = emitter;

    this.store = {
      baseAssets: [],
      govToken: null,
      veToken: null,
      pairs: [],
      vestNFTs: null,
      rewards: {
        bribes: [],
        fees: [],
        rewards: [],
      },
      apr: [],
    };

    dispatcher.register(
      function (payload) {
        switch (payload.type) {
          case ACTIONS.CONFIGURE_SS:
            this.configure();
            break;

          // LIQUIDITY
          case ACTIONS.CREATE_PAIR_AND_DEPOSIT:
            this.createPairDeposit(payload);
            break;
          case ACTIONS.ADD_LIQUIDITY:
            this.addLiquidity(payload);
            break;
          case ACTIONS.STAKE_LIQUIDITY:
            this.stakeLiquidity(payload);
            break;
          case ACTIONS.QUOTE_ADD_LIQUIDITY:
            this.quoteAddLiquidity(payload);
            break;
          case ACTIONS.REMOVE_LIQUIDITY:
            this.removeLiquidity(payload);
            break;
          case ACTIONS.QUOTE_REMOVE_LIQUIDITY:
            this.quoteRemoveLiquidity(payload);
            break;
          case ACTIONS.UNSTAKE_LIQUIDITY:
            this.unstakeLiquidity(payload);
            break;
          case ACTIONS.CREATE_GAUGE:
            this.createGauge(payload);
            break;

          // SWAP
          case ACTIONS.QUOTE_SWAP:
            this.quoteSwap(payload);
            break;
          case ACTIONS.SWAP:
            this.swap(payload);
            break;
          case ACTIONS.WRAP:
            this.wrap(payload);
            break;
          case ACTIONS.UNWRAP:
            this.unwrap(payload);
            break;

          // VESTING
          case ACTIONS.GET_VEST_NFTS:
            this.getVestNFTs(payload);
            break;
          case ACTIONS.CREATE_VEST:
            this.createVest(payload);
            break;
          case ACTIONS.INCREASE_VEST_AMOUNT:
            this.increaseVestAmount(payload);
            break;
          case ACTIONS.INCREASE_VEST_DURATION:
            this.increaseVestDuration(payload);
            break;
          case ACTIONS.MERGE_NFT:
            this.merge(payload);
            break;
          case ACTIONS.WITHDRAW_VEST:
            this.withdrawVest(payload);
            break;

          //VOTE
          case ACTIONS.VOTE:
            this.vote(payload);
            break;
          case ACTIONS.RESET_VOTE:
            this.resetVote(payload);
            break;
          case ACTIONS.GET_VEST_VOTES:
            this.getVestVotes(payload);
            break;
          case ACTIONS.CREATE_BRIBE:
            this.createBribe(payload);
            break;

          //REWARDS
          case ACTIONS.GET_REWARD_BALANCES:
            this.getRewardBalances(payload);
            break;
          case ACTIONS.CLAIM_BRIBE:
            this.claimBribes(payload);
            break;
          case ACTIONS.CLAIM_PAIR_FEES:
            this.claimPairFees(payload);
            break;
          case ACTIONS.CLAIM_REWARD:
            this.claimRewards(payload);
            break;
          case ACTIONS.CLAIM_VE_DIST:
            this.claimVeDist(payload);
            break;
          case ACTIONS.CLAIM_ALL_REWARDS:
            this.claimAllRewards(payload);
            break;

          //WHITELIST
          case ACTIONS.SEARCH_WHITELIST:
            this.searchWhitelist(payload);
            break;
          case ACTIONS.WHITELIST_TOKEN:
            this.whitelistToken(payload);
            break;
          default: {
          }
        }
      }.bind(this)
    );
  }

  // DISPATCHER FUNCTIONS
  configure = async () => {
    if (this.configurationLoading) {
      return;
    }

    this.userAddress = stores.accountStore.getStore("account")

    if (this.getUserAddress() === null || stores.accountStore.getStore("chainInvalid")) {
      console.log('delay to load config')
      setTimeout(async () => await this.configure(), 1000);
      return;
    }
    console.log('configure ', this.id)
    try {
      this.configurationLoading = true;

      // remove old values
      this.setStore({
        baseAssets: [],
        govToken: null,
        veToken: null,
        pairs: [],
        vestNFTs: null,
        rewards: {
          bribes: [],
          fees: [],
          rewards: [],
        },
      });


      this.setStore({
        govToken: {
          address: CONTRACTS.GOV_TOKEN_ADDRESS,
          name: CONTRACTS.GOV_TOKEN_NAME,
          symbol: CONTRACTS.GOV_TOKEN_SYMBOL,
          decimals: CONTRACTS.GOV_TOKEN_DECIMALS,
          logoURI: CONTRACTS.GOV_TOKEN_LOGO,
        }
      });

      this.setStore({veToken: await this._getVeTokenBase()});
      this.setStore({routeAssets: ROUTE_ASSETS});
      await this.loadBaseAssets()
      await this.getVestNFTs();
      await this.refreshPairs();
      await this._refreshGovTokenInfo(await this.getWeb3(), this.getUserAddress());
      await this._getBaseAssetInfo(await this.getWeb3(), this.getUserAddress());

      this.emitter.emit(ACTIONS.UPDATED);
      this.emitter.emit(ACTIONS.CONFIGURED_SS);
    } finally {
      this.configurationLoading = false;
    }
  };

  getStore = (index) => {
    return this.store[index];
  };

  setStore = (obj) => {
    this.store = {...this.store, ...obj};
    return this.emitter.emit(ACTIONS.STORE_UPDATED);
  };

  getUserAddress() {
    const adr = this.userAddress;
    if (!adr) {
      console.warn("user address not found");
      return null;
    }
    return adr;
  }

  async getWeb3() {
    const web3 = await stores.accountStore.getWeb3Provider();
    if (!web3) {
      console.warn("web3 not found");
      return null;
    }
    return web3;
  }

  ////////////////////////////////////////////////////////////////
  //                 PAIRS
  ////////////////////////////////////////////////////////////////

  refreshPairs = async () => {
    try {
      let pairs = this.getStore("pairs");
      if (!pairs || pairs.length === 0) {
        pairs = await getPairs();
      }
      await enrichPairInfo(
        await this.getWeb3(),
        this.getUserAddress(),
        pairs,
        await stores.accountStore.getMulticall(),
        this.getStore("baseAssets"),
        this.getStore("vestNFTs") ?? []
      );
      await enrichAdditionalApr(pairs)
      this.setStore({pairs: pairs});
    } catch (e) {
      console.error("Error refresh pairs", e);
      await emitError(this.emitter, "Error refresh pairs")
    }
  };

  getPairByAddress = async (pairAddress) => {
    try {
      const pairs = this.getStore("pairs");
      const pair = await getAndUpdatePair(pairAddress, await this.getWeb3(), this.getUserAddress(), pairs);
      this.setStore({pairs: pairs ?? []});
      return pair;
    } catch (e) {
      console.error("Error getting pair", e);
      await emitError(this.emitter, "Error get pair by address")
    }
  };

  getPair = async (addressA, addressB, stab) => {
    try {
      return await loadPair(
        addressA,
        addressB,
        stab,
        await this.getWeb3(),
        this.getUserAddress(),
        this.getStore("pairs"),
        this.getStore("baseAssets")
      );
    } catch (e) {
      console.error("Error get pair by assets", e);
      await emitError(this.emitter, "Error get pair by assets")
    }
  };

  //////////////////////////////////////////////////////////////
  //                   VE
  //////////////////////////////////////////////////////////////

  _getVeTokenBase = async () => {
    try {
      return {
        address: CONTRACTS.VE_TOKEN_ADDRESS,
        name: CONTRACTS.VE_TOKEN_NAME,
        symbol: CONTRACTS.VE_TOKEN_SYMBOL,
        decimals: CONTRACTS.VE_TOKEN_DECIMALS,
        logoURI: CONTRACTS.VE_TOKEN_LOGO,
        veDistApr: await getVeApr(),
        totalPower: await getVeTotalPower(await this.getWeb3()),
      };
    } catch (e) {
      console.error("Error load ve info", e);
      await emitError(this.emitter, "Error load ve info")
    }
  };

  getNFTByID = async (id) => {
    try {
      const existNfts = this.getStore("vestNFTs") ?? [];
      const nft = getNftById(id, existNfts);
      if (nft !== null) {
        return nft;
      }
      const freshNft = await loadNfts(this.getUserAddress(), await this.getWeb3(), id);
      if (freshNft.length > 0) {
        existNfts.push(...freshNft)
      }
      return getNftById(id, existNfts);
    } catch (e) {
      console.log("Error get NFT by ID", e);
      await emitError(this.emitter, "Error get NFT by ID")
    }
  };

  getVestNFTs = async () => {
    try {
      const nfts = await loadNfts(this.getUserAddress(), await this.getWeb3());
      this.setStore({vestNFTs: nfts});
      this.emitter.emit(ACTIONS.VEST_NFTS_RETURNED, nfts);
      return nfts;
    } catch (e) {
      console.log("Error get Vest NFTs", e);
      await emitError(this.emitter, "Error get Vest NFTs")
    }
  };

  getVestVotes = async (payload) => {
    try {
      await getVestVotes(
        payload,
        this.getUserAddress(),
        await this.getWeb3(),
        this.emitter,
        this.getStore("pairs"),
        await stores.accountStore.getMulticall(),
        false // set true if any issues with subgraph
      );
    } catch (e) {
      console.log("Error get Vest Votes", e);
      await emitError(this.emitter, "Error get Vest Votes")
    }
  };

  //////////////////////////////////////////////////////////////
  //                   ASSETS
  //////////////////////////////////////////////////////////////

  async loadBaseAssets() {
    try {
      this.setStore({baseAssets: await getBaseAssets()});
    } catch (e) {
      console.log("Error get Base Assets", e);
      await emitError(this.emitter, "Error load Base Assets")
    }
  }

  removeBaseAsset = (asset) => {
    try {
      const baseAssets = removeDuplicate(removeBaseAsset(asset, this.getStore("baseAssets")));
      this.setStore({baseAssets: baseAssets});
      this.emitter.emit(ACTIONS.BASE_ASSETS_UPDATED, baseAssets);
    } catch (e) {
      console.log("Error remove base asset", e);
      emitError(this.emitter, "Error remove base asset")
    }
  };

  getBaseAsset = async (address, save, getBalance) => {
    if (!address) {
      return null;
    }
    try {
      const baseAssets = this.getStore("baseAssets");
      const newBaseAsset = await getOrCreateBaseAsset(baseAssets, address, await this.getWeb3(), this.getUserAddress(), getBalance);

      //only save when a user adds it. don't for when we look up a pair and find his asset.
      if (save) {
        saveLocalAsset(newBaseAsset);
        const storeBaseAssets = removeDuplicate([...baseAssets, newBaseAsset]);
        this.setStore({baseAssets: storeBaseAssets});
        this.emitter.emit(ACTIONS.BASE_ASSETS_UPDATED, storeBaseAssets);
      }
      return newBaseAsset;
    } catch (ex) {
      console.log("Get base asset error", ex);
      await emitError(this.emitter, "Error load base asset")
      return null;
    }
  };

  _refreshGovTokenInfo = async (web3, account) => {
    try {
      const govToken = this.getStore("govToken");
      const balance = await getTokenBalance(govToken.address, web3, account, govToken.decimals);
      govToken.balanceOf = parseBN(balance, govToken.decimals);
      govToken.balance = balance
      this.setStore({govToken});
      this.emitter.emit(ACTIONS.GOVERNANCE_ASSETS_UPDATED, govToken);
    } catch (ex) {
      console.log("Get gov token info error", ex);
      await emitError(this.emitter, "Error load governance token")
    }
  };

  _getBaseAssetInfo = async (web3, account) => {
    try {
      const baseAssets = this.getStore("baseAssets");
      await getBalancesForBaseAssets(web3, account, baseAssets, await stores.accountStore.getMulticall())
      this.setStore({baseAssets});
    } catch (e) {
      console.log("Error load governance token", e);
      await emitError(this.emitter, "Error load governance token")
    }
  };

  _refreshAssetBalance = async (web3, account, assetAddress) => {
    try {
      const baseAssets = this.getStore("baseAssets");
      const govToken = this.getStore("govToken");
      const asset = baseAssets?.filter((asset) => asset.address.toLowerCase() === assetAddress.toLowerCase())[0]
      if (!asset) {
        return;
      }
      if (asset.address === "BNB") {
        asset.balance = formatBN(await web3.eth.getBalance(account))
      } else {
        asset.balance = await getTokenBalance(assetAddress, web3, account, asset.decimals)
      }
      if (assetAddress.toLowerCase() === govToken.address.toLowerCase()) {
        await this._refreshGovTokenInfo(web3, account);
      }
      this.emitter.emit(ACTIONS.UPDATED);
    } catch (ex) {
      console.log("Refresh balance error", ex);
      await emitError(this.emitter, "Error refresh asset balances")
    }
  };

  //////////////////////////////////////////////////////////////
  //                   REWARDS
  //////////////////////////////////////////////////////////////

  getRewardBalances = async (payload) => {
    try {
      const rewards = await getRewardBalances(
        payload,
        this.getUserAddress(),
        await this.getWeb3(),
        this.emitter,
        this.getStore("pairs"),
        this.getStore("veToken"),
        this.getStore("govToken"),
        this.getStore("vestNFTs"),
        this.getStore("baseAssets") ?? [],
        await stores.accountStore.getMulticall(),
      );
      this.setStore({rewards});
      this.emitter.emit(ACTIONS.REWARD_BALANCES_RETURNED, rewards);
    } catch (e) {
      console.log("Error refresh reward balances", e);
      await emitError(this.emitter, "Error refresh reward balances")
    }
  };

  ////////////////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////////////////
  //                              Transactions calls
  ////////////////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////////////////

  ////////////////////////////////////////////////////////////////////////////////
  //                            LIQUIDITY
  ////////////////////////////////////////////////////////////////////////////////

  createPairDeposit = async (payload) => {
    const {token0, token1, amount0, amount1, isStable, slippage} = payload.content;
    await createPairDeposit(
      token0,
      token1,
      amount0,
      amount1,
      isStable,
      slippage,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      true,
      async () => await this.refreshPairs()
    );
  };

  quoteAddLiquidity = async (payload) => {
    await quoteAddLiquidity(
      payload,
      await this.getWeb3(),
      this.emitter,
    )
  };

  addLiquidity = async (payload) => {
    const {token0, token1, amount0, amount1, pair, slippage} = payload.content;
    await createPairDeposit(
      token0,
      token1,
      amount0,
      amount1,
      pair.isStable,
      slippage,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      false,
      async () => await this.refreshPairs()
    );
  };

  quoteRemoveLiquidity = async (payload) => {
    await quoteRemoveLiquidity(
      payload,
      await this.getWeb3(),
      this.emitter,
    )
  };

  removeLiquidity = async (payload) => {
    await removeLiquidity(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => await this.refreshPairs()
    )
  };

  ////////////////////////////////////////////////////////////////////////////////
  //                            STAKE
  ////////////////////////////////////////////////////////////////////////////////

  createGauge = async (payload) => {
    await createGauge(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => await this.refreshPairs()
    )
  };

  stakeLiquidity = async (payload) => {
    await stakeLiquidity(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => await this.refreshPairs()
    )
  };


  unstakeLiquidity = async (payload) => {
    await unstakeLiquidity(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => await this.refreshPairs()
    )
  };

  ////////////////////////////////////////////////////////////////////////////////
  //                            SWAP
  ////////////////////////////////////////////////////////////////////////////////

  quoteSwap = async (payload) => {
    await quoteSwap(
      payload,
      await this.getWeb3(),
      this.getStore("routeAssets"),
      this.emitter,
      this.getStore("baseAssets")
    )
  };

  swap = async (payload) => {
    await swap(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (web3, account, fromAsset, toAsset) => {
        await this._refreshAssetBalance(web3, account, fromAsset.address);
        await this._refreshAssetBalance(web3, account, toAsset.address);
      }
    )
  };

  wrap = async (payload) => {
    await wrap(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (web3, account, fromAsset, toAsset) => {
        await this._refreshAssetBalance(web3, account, fromAsset.address);
        await this._refreshAssetBalance(web3, account, toAsset.address);
      }
    )
  };

  unwrap = async (payload) => {
    await unwrap(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (web3, account, fromAsset, toAsset) => {
        await this._refreshAssetBalance(web3, account, fromAsset.address);
        await this._refreshAssetBalance(web3, account, toAsset.address);
      }
    )
  };

  ////////////////////////////////////////////////////////////////////////////////
  //                            VESTING
  ////////////////////////////////////////////////////////////////////////////////

  createVest = async (payload) => {
    await createVest(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      this.getStore("govToken"),
      async (web3, account) => {
        await this._refreshGovTokenInfo(web3, account);
        await this.getNFTByID("fetchAll");
      }
    )
  };

  increaseVestAmount = async (payload) => {
    await increaseVestAmount(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      this.getStore("govToken"),
      async (web3, account) => {
        await this._refreshGovTokenInfo(web3, account);
        await this.getNFTByID("fetchAll");
      }
    )
  };

  increaseVestDuration = async (payload) => {
    await increaseVestDuration(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (tokenID) => {
        await this.getNFTByID(tokenID);
      }
    )
  };

  withdrawVest = async (payload) => {
    await withdrawVest(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => {
        await this.getNFTByID("fetchAll");
      }
    )
  };

  merge = async (payload) => {
    await merge(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => {
        await this.getNFTByID("fetchAll");
        await router.push("/vest");
      }
    )
  };

  ////////////////////////////////////////////////////////////////////////////////
  //                            VOTES
  ////////////////////////////////////////////////////////////////////////////////

  vote = async (payload) => {
    await vote(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
    )
  };

  resetVote = async (payload) => {
    await resetVote(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
    )
  };

  //////////////////////////////////////////////////////////////
  //                   BRIBE
  //////////////////////////////////////////////////////////////

  createBribe = async (payload) => {
    await createBribe(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async () => await this.refreshPairs()
    );
  };

  //////////////////////////////////////////////////////////////
  //                   CLAIM
  //////////////////////////////////////////////////////////////

  claimBribes = async (payload) => {
    await claimBribes(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (tokenID) => await this.getRewardBalances({content: {tokenID}})
    )
  };

  claimAllRewards = async (payload) => {
    await claimAllRewards(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (tokenID) => await this.getRewardBalances({content: {tokenID}})
    )
  };

  claimRewards = async (payload) => {
    await claimRewards(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (tokenID) => await this.getRewardBalances({content: {tokenID}})
    )
  };

  claimVeDist = async (payload) => {
    await claimVeDist(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (tokenID) => await this.getRewardBalances({content: {tokenID}})
    )
  };

  claimPairFees = async (payload) => {
    await claimPairFees(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (tokenID) => await this.getRewardBalances({content: {tokenID}})
    )
  };

  //////////////////////////////////////////////////////////////
  //                   WHITELIST
  //////////////////////////////////////////////////////////////

  searchWhitelist = async (payload) => {
    try {
      await searchWhitelist(
        payload,
        await this.getWeb3(),
        this.emitter,
        async (search) => await this.getBaseAsset(search)
      );
    } catch (e) {
      console.log("Error search whitelist tokens", e);
      await emitError(this.emitter, "Error search whitelist tokens")
    }
  };

  whitelistToken = async (payload) => {
    await whitelistToken(
      payload,
      this.getUserAddress(),
      await this.getWeb3(),
      this.emitter,
      this.dispatcher,
      await stores.accountStore.getGasPrice(),
      async (dispatcher, token) => {
        window.setTimeout(() => {
          dispatcher.dispatch({
            type: ACTIONS.SEARCH_WHITELIST,
            content: {search: token.address},
          });
        }, 2);
      }
    )
  };
}

export default Store;
