import React, { useEffect, useMemo, useState } from 'react';
import classes from './ssBoostCalculator.module.css';
import {useRouter} from 'next/router';
import ThreePointSlider from '../threePointSlider/threePointSlider';
import BigNumber from "bignumber.js";
import {calculateBoost, calculatePowerForMaxBoost} from "../../stores/helpers/pair-helper";
import { formatCurrency } from '../../utils';
import {VE_TOKEN_NAME} from '../../stores/constants/contracts'
// import {InputBase} from '@mui/material';

export default function ssBoostCalculator({pair, nft, ve, isMobileView = false, amount = 0, popuped = false}) {
  const router = useRouter();
  const boostedType = 'boosted';

  const [ isShowNote, setIsShowNote ] = useState(false);
  const [ isShowCreateAction, setIsShowCreateAction ] = useState(false);
  const [ nftVolume, setNftVolume ] = useState('');
  const [ boostedNFTAmount, setBoostedNFTAmount ] = useState(0);
  const [ currentAPRPercentage, setCurrentAPRPercentage ] = useState(0);
  const [ boostedAPRPercentage, setBoostedAPRPercentage ] = useState(0);
  const [ currentAPRAmount, setCurrentAPRAmount ] = useState(0);
  const [ boostedAPRAmount, setBoostedAPRAmount ] = useState(0);
  const [ usedAPRPercentage, setUsedAPRPercentage ] = useState(0);
  const [ aprLimits, setAprLimits ] = useState({ min: 0, max: 100 }); // Percentage only
  const [ veConeLimits, setVeConeLimits ] = useState({ min: 0, max: 1000 });

  const [lpAmount, setLpAmount] = useState(BigNumber(0))

  const sliderConfig = useMemo(() => {
    if (pair && ve) {
      // min/max APR is static values, need to calculate proportion between APR to Power for UI
      const maxApr = BigNumber(pair.gauge.derivedAPR);
      const minApr = BigNumber(pair.gauge.derivedAPR).times(0.4);

      // gauge balance - exist or future balance, need to set from input field
      // const userGaugeBalance = +pair.gauge.balance + parseFloat((amount ? amount * pair.gauge.balance / 100 : 0).toString());
      const userGaugeBalance = lpAmount;

      // lock value it is veCONE power, if no NFT equals zero
      const lockValue = BigNumber(nft?.lockValue ?? 0);
      const veRatio = lockValue.div(ve.totalPower);

      // aprWithout boost will be the same as minAPR
      // personal APR is dynamic
      const {personalAPR, aprWithoutBoost} = calculateBoost(pair, veRatio.toString(), userGaugeBalance);

      let personalAPRwithBonus = personalAPR;
      let minAprWithBonus = minApr;
      let maxAprWithBonus = maxApr;
      if (pair?.gauge?.additionalApr0 && BigNumber(pair?.gauge?.additionalApr0).gt(0)) {
        personalAPRwithBonus = personalAPRwithBonus.plus(pair?.gauge?.additionalApr0)
        minAprWithBonus = minAprWithBonus.plus(pair?.gauge?.additionalApr0)
        maxAprWithBonus = maxAprWithBonus.plus(pair?.gauge?.additionalApr0)
      }
      if (pair?.gauge?.additionalApr1 && BigNumber(pair?.gauge?.additionalApr1).gt(0)) {
        personalAPRwithBonus = personalAPRwithBonus.plus(pair?.gauge?.additionalApr1)
        minAprWithBonus = minAprWithBonus.plus(pair?.gauge?.additionalApr1)
        maxAprWithBonus = maxAprWithBonus.plus(pair?.gauge?.additionalApr1)
      }

      // console.log(personalAPR.toString())
      // console.log(personalAPRwithBonus.toString())

      // console.log('personalARP', personalAPR)
      // console.log('pair totalSupply USD', BigNumber(pair.reserveETH).times(pair.ethPrice).toString())
      // console.log('pair total supply', pair.totalSupply.toString())
      // calc $ per day doesn't depend on anything and simple math on APR and user balance
      const userGaugeBalanceEth = BigNumber(userGaugeBalance).times(BigNumber(pair.reserveETH).div(pair.totalSupply));
      const userGaugeBalanceUsd = userGaugeBalanceEth.times(pair.ethPrice);
      const earnPerDay = userGaugeBalanceUsd.times(personalAPR).div(365*100);

      // max value for the UI, user can have enough power - then show max possible APR
      const maxPower = calculatePowerForMaxBoost(pair, userGaugeBalance, ve.totalPower);
      // console.log('need ve for max boost', maxPower)

      // console.log('-----------------', );
      // console.log('maxApr', maxApr.toString());
      // console.log('minApr', minApr.toString());
      // console.log('userGaugeBalance', userGaugeBalance.toString());
      // console.log('lockValue', lockValue.toString());
      // console.log('ve lock value', lockValue.toString());
      // console.log('veRatio', veRatio.toString());
      // console.log('personalAPR', personalAPR.toString());
      // console.log('aprWithoutBoost', aprWithoutBoost.toString());
      // console.log('userGaugeBalanceUsd', userGaugeBalanceUsd.toString());
      // console.log('earnPerDay', earnPerDay);
      // console.log('maxPower', maxPower);
      // console.log('userGaugeBalance', userGaugeBalance, ' = ', pair.gauge.balance, ' + ', parseFloat((amount ? amount : 0).toString()));
      // console.log('ve.totalPower', ve.totalPower);
      // console.log('pair', pair);
      // console.log('nft', nft);
      // console.log('ve', ve);
      // console.log('-----------------', );
      return {
        maxApr: parseFloat(maxAprWithBonus),
        minApr: parseFloat(minAprWithBonus),
        earnPerDay: parseFloat(earnPerDay),
        personalAPR: parseFloat(personalAPRwithBonus),
        maxPower: parseFloat(maxPower),
        lockValue: lockValue
      }
    }
  }, [pair, ve, nft, lpAmount]);

  useEffect(() => {
    if (pair && ve) {
      // set lpAmount
      if (popuped) {
        if (BigNumber(pair?.balance).gt(0) || BigNumber(pair?.gauge?.balance).gt(0)) {
          setLpAmount(BigNumber(pair?.balance).plus(BigNumber(pair?.gauge?.balance)))
          // console.log('setLpAmount', BigNumber(pair?.balance).plus(BigNumber(pair?.gauge?.balance)).toString())
        } else {
          if (BigNumber(pair?.ethPrice).gt(0)) {
            // if user dont have liquidity, then calculate $1000 to lpAmount
            const ethPer1k = BigNumber(1000).div(pair.ethPrice)
            setLpAmount(BigNumber(pair.totalSupply).times(ethPer1k.div(BigNumber(pair.reserveETH))))
          } else {
            setLpAmount(BigNumber("1"))
          }
        }
      } else {
        if (BigNumber(pair?.balance).gt(0)) {
          if (amount > 0) {
            setLpAmount(BigNumber(pair?.balance).times(amount).div(100))
          } else {
            setLpAmount(BigNumber(pair?.balance))
          }
        } else {
          if (BigNumber(pair?.gauge?.balance).gt(0)) {
            setLpAmount(BigNumber(pair?.gauge?.balance))
          }
        }
      }
    }
  }, [ pair, amount ]);

  useEffect(() => {
    if (pair && ve) {
      setCurrentAPRPercentage(sliderConfig.personalAPR); // Set default value of APR% (show in Calculator and Default place of thumb of slider)
      setCurrentAPRAmount(sliderConfig.earnPerDay); // APR amount per day (show in Calculator)
      setBoostedAPRPercentage(sliderConfig.personalAPR); // Default value for boosted APR%.
      setUsedAPRPercentage(sliderConfig.personalAPR); // Value of user's used veCone % (Slider will start from this position)
      // console.log('setUsedAPRPercentage', sliderConfig.personalAPR)

      setAprLimits({min: sliderConfig.minApr, max: sliderConfig.maxApr}); // Limits for slider, min & max APR%
      setVeConeLimits({min: 0, max: sliderConfig.maxPower}); // Limits for slider, veCone min & max. It should be linear dependency with APR%
      // console.log('setVeConeLimits', {min: 0, max: sliderConfig.maxPower})
    }
  }, [ pair, lpAmount ]);

  useEffect(() => {
    setIsShowNote(boostedAPRPercentage === usedAPRPercentage || boostedAPRPercentage === aprLimits.min);
    setIsShowCreateAction(boostedAPRPercentage > usedAPRPercentage && boostedAPRPercentage > 0);

    if (pair && ve) {
      setBoostedAPRAmount(parseFloat((boostedAPRPercentage * sliderConfig.earnPerDay / sliderConfig.minApr).toString()));
      setNftVolume(sliderConfig.lockValue > boostedNFTAmount ? 0 : (boostedNFTAmount - parseFloat(sliderConfig.lockValue)).toString());
    }

  }, [ boostedAPRPercentage, pair, lpAmount ]);

  const createAction = () => {
    router.push('/vest/create').then();
  }

  const fixed = (value) => {
    const val = parseFloat(value);
    return +(val.toFixed(val > 0.009 ? 2 : 5));
  }

  const profitRender = (type = 'current') => {
    const label = type === 'current' ? `Current APR <span>${fixed(currentAPRPercentage)}%</span>` : `Boosted APR <span>${fixed(boostedAPRPercentage)}%</span>`;
    const value = type === 'current' ? `${fixed(currentAPRAmount)} $ / day` : `${fixed(boostedAPRAmount)} $ / day`;
    const hasProfit = boostedAPRPercentage > currentAPRPercentage;
    return (
        <>
          <div
              className={[ classes.profitLabel, classes[ `profitLabel--${hasProfit && type === boostedType ? 'profit' : 'shortage'}` ] ].join(' ')}
              dangerouslySetInnerHTML={{ __html: label }}/>
          <div className={classes.profitValue}>{value}</div>
        </>
    );
  }

  const noteRender = <div className={classes.sliderNote}>
    <div className={classes.sliderNoteWarnSymbol}>!</div>
    <div>Move slider above to calculate the veCONE Power for Max Boosted Rewards.</div>
  </div>;

  const onChange = ({ currentPct,  currentAmount}) => {
    // console.log(currentPct, currentAmount)
    setBoostedAPRPercentage(currentPct);
    setBoostedNFTAmount(currentAmount);
  }

  const className = isMobileView ? [classes.boostCalculator, classes['boostCalculator--mobile']].join(' ') : classes.boostCalculator;

  return (
      <div className={className}>
        <div className={classes.sliderWrapper}>
          {popuped &&
              <div className={classes.calcToValue}>
                <div className={classes.lp}>{pair.symbol}</div>
                <div className={classes.lpamount}>{lpAmount.toString().slice(0, 12)}</div>
                <div className={classes.usdamount}>${lpAmount.div(BigNumber(pair.totalSupply)).times(BigNumber(pair.reserveETH)).times(pair.ethPrice).toFixed(2)}</div>
                {/*<InputBase
                    className={classes.massiveInputAmount}
                    placeholder="0.00"
                    value={lpAmount}
                    disabled={true}
                    onChange={e => {
                      setLpAmount(e.target.value)
                    }}
                    InputProps={{
                      disableUnderline: true,
                    }}
                />*/}
                {/*<span className={css.flyPercent}>%</span>*/}
              </div>
          }
          <div className={classes.sliderLabels}>
            <div className={classes.sliderLabelsItem}>
              Min-Max APR
            </div>
            <div className={classes.sliderLabelsItem}>
              veCONE
            </div>
          </div>
          <div className={classes.slider}>
            <ThreePointSlider
                valueLabelDisplay="on"
                pointCurrent={currentAPRPercentage}
                pointUsed={usedAPRPercentage}
                pointMinPct={aprLimits.min}
                pointMaxPct={aprLimits.max}
                pointMinValue={veConeLimits.min}
                pointMaxValue={veConeLimits.max}
                step={1}
                disabled={false}
                onChange={onChange}
                fixedCallback={fixed}
            />
          </div>
          <div className={[ classes.sliderLabels, classes[ 'sliderLabels--mobile' ] ].join(' ')}>
            <div className={classes.sliderLabelsItem}>
              veCONE
            </div>
          </div>
        </div>
        {isShowNote && !isMobileView && noteRender}
        {(pair.gauge?.additionalApr0 && BigNumber(pair?.gauge?.additionalApr0).gt(0)) || (pair.gauge?.additionalApr1 && BigNumber(pair?.gauge?.additionalApr1).gt(0)) &&
            <div className={classes.profitWrapper} style={{marginBottom: 12,}}>
              {(pair.gauge?.additionalApr0 && BigNumber(pair?.gauge?.additionalApr0).gt(0)) &&
                  <div className={classes.profitItem}>
                    <div className={[ classes.profitLabel, classes[ `profitLabel--shortage` ] ].join(' ')}>
                      Bonus {pair.token0.symbol} APR
                      <span style={{marginLeft: 4,}}>
                        {formatCurrency(
                            BigNumber(pair?.gauge?.additionalApr0),
                            2
                        )}
                        %
                      </span>
                    </div>
                  </div>
              }
              {(pair.gauge?.additionalApr0 && BigNumber(pair?.gauge?.additionalApr0).gt(0)) && (pair.gauge?.additionalApr1 && BigNumber(pair?.gauge?.additionalApr1).gt(0)) &&
                  <div className={classes.profitItemDivider}></div>
              }
              {(pair.gauge?.additionalApr1 && BigNumber(pair?.gauge?.additionalApr1).gt(0)) &&
                  <div className={classes.profitItem}>
                    <div className={[ classes.profitLabel, classes[ `profitLabel--shortage` ] ].join(' ')}>
                      Bonus {pair.token1.symbol} APR
                      <span style={{marginLeft: 4,}}>
                        {formatCurrency(
                            BigNumber(pair?.gauge?.additionalApr1),
                            2
                        )}
                        %
                      </span>{" "}
                    </div>
                  </div>
              }
            </div>
        }
        <div className={classes.profitWrapper}>
          <div className={classes.profitItem}>{profitRender()}</div>
          {!isShowNote && <>
            <div className={classes.profitItemDivider}></div>
            <div className={classes.profitItem}>{profitRender(boostedType)}</div>
          </>}
        </div>
        {isShowCreateAction && <div className={classes.createAction}>
          <div className={classes.createActionNote}>You need to have NFT with {fixed(boostedNFTAmount)} {VE_TOKEN_NAME} Power. Create or select/merge
            NFTs.
          </div>
          <div className={classes.createActionButton} onClick={createAction}>Create veCone</div>
        </div>}
      </div>
  );
}
