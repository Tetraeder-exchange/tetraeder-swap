import {ACTIONS, CONTRACTS, QUERIES} from "../constants";
import BigNumber from "bignumber.js";
import stores from "../index";
import {createClient} from "urql";

const client = createClient({url: process.env.NEXT_PUBLIC_API});

export function getNftById(id, nfts) {
  if (!nfts || nfts.length === 0) {
    return null;
  }
  return nfts.filter(n => parseInt(n.id) === parseInt(id)).reduce((a, b) => b, null);
}

export const loadNfts = async (account, web3, govToken) => {
  if (!account || !web3) {
    return null;
  }
  try {
    const vestingContract = getVestingContract(web3);

    const nftsLength = await vestingContract.methods
      .balanceOf(account.address)
      .call();
    const arr = Array.from({length: parseInt(nftsLength)}, (v, i) => i);

    return await Promise.all(
      arr.map(async (idx) => {
        const tokenIndex = await vestingContract.methods
          .tokenOfOwnerByIndex(account.address, idx)
          .call();
        const locked = await vestingContract.methods
          .locked(tokenIndex)
          .call();
        const lockValue = await vestingContract.methods
          .balanceOfNFT(tokenIndex)
          .call();

        return {
          id: tokenIndex,
          lockEnds: locked.end,
          lockAmount: BigNumber(locked.amount)
            .div(10 ** parseInt(govToken.decimals))
            .toFixed(parseInt(govToken.decimals)),
          lockValue: BigNumber(lockValue)
            .div(10 ** 18)
            .toFixed(18),
        };
      })
    );
  } catch (ex) {
    console.log("Error load veNFTs", ex);
    return null;
  }
};

export const updateVestNFTByID = async (id, vestNFTs, web3, govToken) => {
  try {
    if (getNftById(id, vestNFTs) === null) {
      return vestNFTs;
    }

    const vestingContract = getVestingContract();

    const locked = await vestingContract.methods.locked(id).call();
    const lockValue = await vestingContract.methods.balanceOfNFT(id).call();

    return vestNFTs.map((nft) => {
      if (nft.id === id) {
        return {
          id: id,
          lockEnds: locked.end,
          lockAmount: BigNumber(locked.amount)
            .div(10 ** parseInt(govToken.decimals))
            .toFixed(parseInt(govToken.decimals)),
          lockValue: BigNumber(lockValue)
            .div(10 ** 18)
            .toFixed(18),
        };
      }

      return nft;
    });
  } catch (ex) {
    console.log("Error update veNFT", ex);
    return null;
  }
};

export async function getVeApr() {
  try {
    const veDistResponse = await client.query(QUERIES.veDistQuery).toPromise();
    if (!veDistResponse.error && veDistResponse.data.veDistEntities.length !== 0) {
      return veDistResponse.data.veDistEntities[0].apr;
    }
  } catch (e) {
    console.log("Error get ve apr", e);
  }
  return 0;
}

function getVestingContract(web3) {
  return new web3.eth.Contract(
    CONTRACTS.VE_TOKEN_ABI,
    CONTRACTS.VE_TOKEN_ADDRESS
  );
}
