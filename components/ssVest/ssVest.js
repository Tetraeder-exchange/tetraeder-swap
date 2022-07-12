import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import BigNumber from "bignumber.js";
import stores from "../../stores";
import { ACTIONS } from "../../stores/constants";
import moment from "moment";
import ExistingLock from "./existingLock";
import Unlock from "./unlock";
import Lock from "./lock";
import { MergeLock } from "./mergeLock";
import { WithdrawLock } from "./withdrawLock";

export default function ssVest() {
  const router = useRouter();
  const [, updateState] = useState();
  const forceUpdate = useCallback(() => updateState({}), []);

  const [govToken, setGovToken] = useState(null);
  const [veToken, setVeToken] = useState(null);
  const [nft, setNFT] = useState(null);

  const ssUpdated = async () => {
    setGovToken(stores.stableSwapStore.getStore("govToken"));
    setVeToken(stores.stableSwapStore.getStore("veToken"));

    const nft = await stores.stableSwapStore.getNFTByID(router.query.id);
    setNFT(nft);
    forceUpdate();
  };

  useEffect(() => {
    ssUpdated();

    stores.emitter.on(ACTIONS.UPDATED, ssUpdated);
    return () => {
      stores.emitter.removeListener(ACTIONS.UPDATED, ssUpdated);
    };
  }, []);

  useEffect(async () => {
    ssUpdated();
  }, [router.query.id]);

  return (
    <>
      {router.query.id === "create" && (
        <Lock nft={nft} govToken={govToken} veToken={veToken} />
      )}
      {/* {router.query.id === "withdraw" && <WithdrawLock nft={nft} govToken={govToken} veToken={veToken} />} */}
      {router.query.id === "merge" && <MergeLock nft={nft} govToken={govToken} veToken={veToken} />}
      {router.query.id !== "create" &&
        nft &&
        BigNumber(nft.lockEnds).gte(moment().unix()) &&
        BigNumber(nft.lockEnds).gt(0) && (
          <ExistingLock nft={nft} govToken={govToken} veToken={veToken} />
        )}
      {router.query.id !== "create" &&
        nft &&
        BigNumber(nft.lockEnds).lt(moment().unix()) &&
        BigNumber(nft.lockEnds).gt(0) && (
          <Unlock nft={nft} govToken={govToken} veToken={veToken} />
        )}
    </>
  );
}
