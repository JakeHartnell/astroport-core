//! Regression tests for zero-stake incentives accrual.
//!
//! Rewards emitted while no LP is staked must not be assigned to the first
//! depositor. They are protocol orphans recoverable by the DAO, not user yield.

use cosmwasm_std::{coin, Addr, Timestamp, Uint128};

use astroport::asset::{Asset, AssetInfo, PairInfo};
use astroport::factory::{ExecuteMsg as FactoryExecuteMsg, PairType, QueryMsg as FactoryQueryMsg};
use astroport::incentives::{ExecuteMsg as IncentivesExecuteMsg, InputSchedule, EPOCHS_START};
use astroport::pair::ExecuteMsg as PairExecuteMsg;
use astroport_test::cw_multi_test::{BankSudo, Executor, SudoMsg};

use astroport_juno_integration_tests::{
    balance_of, deploy_incentives_addon, deploy_keep_set, fund, mock_app, KeepSetHandles, TestApp,
    MOCK_USDC, UJUNO,
};

const ALICE: &str = "alice";
const FUNDER: &str = "funder";
const LP_SEED: u128 = 100_000_000_000;
const INTERNAL_REWARD_FUND_AMOUNT: u128 = 10_000_000;
const TOKENS_PER_SECOND: u128 = 100;
const EMPTY_SECONDS: u64 = 10;
const STAKED_SECONDS: u64 = 1;
const PROJECT_REWARD: &str = "factory/juno1projectaddr/ZERO";
const EXTERNAL_REWARD_AMOUNT: u128 = 100_000_000;

#[test]
fn internal_emissions_before_first_stake_are_orphaned_not_paid_to_first_depositor() {
    let mut app = mock_app();
    app.update_block(|b| {
        b.time = Timestamp::from_seconds(EPOCHS_START + 86400);
        b.height += 1;
    });

    let handles = deploy_keep_set(&mut app).unwrap();
    let inc = deploy_incentives_addon(
        &mut app,
        &handles,
        AssetInfo::NativeToken {
            denom: UJUNO.to_string(),
        },
        None,
    )
    .unwrap();

    let pair = create_pair(&mut app, &handles, UJUNO, MOCK_USDC);
    let lp_denom = lp_denom_of(&mut app, &handles, UJUNO, MOCK_USDC);

    let alice = app.api().addr_make(ALICE);
    fund(
        &mut app,
        &alice,
        vec![coin(LP_SEED, UJUNO), coin(LP_SEED, MOCK_USDC)],
    )
    .unwrap();
    provide_liquidity(&mut app, &pair, &alice, LP_SEED, LP_SEED);
    let alice_lp = balance_of(&app, &alice, &lp_denom);
    assert!(alice_lp > Uint128::zero(), "Alice received LP tokens");

    app.execute_contract(
        handles.deployer.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::SetupPools {
            pools: vec![(lp_denom.clone(), Uint128::new(1))],
        },
        &[],
    )
    .unwrap();
    app.execute_contract(
        handles.deployer.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::SetTokensPerSecond {
            amount: Uint128::new(TOKENS_PER_SECOND),
        },
        &[],
    )
    .unwrap();
    fund(
        &mut app,
        &inc.incentives,
        vec![coin(INTERNAL_REWARD_FUND_AMOUNT, UJUNO)],
    )
    .unwrap();

    // Emissions run while nobody is staked.
    app.update_block(|b| {
        b.time = b.time.plus_seconds(EMPTY_SECONDS);
        b.height += 1;
    });

    app.execute_contract(
        alice.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::Deposit { recipient: None },
        &[coin(alice_lp.u128(), lp_denom.clone())],
    )
    .unwrap();

    // Let one second accrue with Alice actually staked. She may receive this
    // second, but not the EMPTY_SECONDS that elapsed before any stake existed.
    app.update_block(|b| {
        b.time = b.time.plus_seconds(STAKED_SECONDS);
        b.height += 1;
    });

    let alice_ujuno_before = balance_of(&app, &alice, UJUNO);
    app.execute_contract(
        alice.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::ClaimRewards {
            lp_tokens: vec![lp_denom.clone()],
        },
        &[],
    )
    .unwrap();
    let alice_ujuno_after = balance_of(&app, &alice, UJUNO);
    let received = alice_ujuno_after - alice_ujuno_before;
    let max_staked_period_reward = Uint128::new(STAKED_SECONDS as u128 * TOKENS_PER_SECOND + 1);
    assert!(
        received <= max_staked_period_reward,
        "first depositor received empty-period emissions: got {received}, expected at most {max_staked_period_reward}"
    );

    let dao_before = balance_of(&app, &handles.deployer, UJUNO);
    app.execute_contract(
        handles.deployer.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::ClaimOrphanedRewards {
            limit: None,
            receiver: handles.deployer.to_string(),
        },
        &[],
    )
    .expect("DAO can recover zero-stake internal emissions as orphaned rewards");
    let dao_after = balance_of(&app, &handles.deployer, UJUNO);
    assert!(
        dao_after > dao_before,
        "zero-stake internal emissions should be recoverable by the DAO"
    );
}

#[test]
fn external_incentives_before_first_stake_are_orphaned_not_paid_to_first_depositor() {
    let mut app = mock_app();
    app.update_block(|b| {
        b.time = Timestamp::from_seconds(EPOCHS_START + 86400);
        b.height += 1;
    });

    let handles = deploy_keep_set(&mut app).unwrap();
    let inc = deploy_incentives_addon(
        &mut app,
        &handles,
        AssetInfo::NativeToken {
            denom: UJUNO.to_string(),
        },
        None,
    )
    .unwrap();

    let pair = create_pair(&mut app, &handles, UJUNO, MOCK_USDC);
    let lp_denom = lp_denom_of(&mut app, &handles, UJUNO, MOCK_USDC);

    let alice = app.api().addr_make(ALICE);
    fund(
        &mut app,
        &alice,
        vec![coin(LP_SEED, UJUNO), coin(LP_SEED, MOCK_USDC)],
    )
    .unwrap();
    provide_liquidity(&mut app, &pair, &alice, LP_SEED, LP_SEED);
    let alice_lp = balance_of(&app, &alice, &lp_denom);

    let funder = app.api().addr_make(FUNDER);
    app.sudo(SudoMsg::Bank(BankSudo::Mint {
        to_address: funder.to_string(),
        amount: vec![coin(EXTERNAL_REWARD_AMOUNT, PROJECT_REWARD)],
    }))
    .unwrap();

    app.execute_contract(
        funder.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::Incentivize {
            lp_token: lp_denom.clone(),
            schedule: InputSchedule {
                reward: Asset {
                    info: AssetInfo::NativeToken {
                        denom: PROJECT_REWARD.to_string(),
                    },
                    amount: Uint128::new(EXTERNAL_REWARD_AMOUNT),
                },
                duration_periods: 1,
            },
        },
        &[coin(EXTERNAL_REWARD_AMOUNT, PROJECT_REWARD)],
    )
    .expect("Incentivize succeeds while no LP is staked");

    // Advance into the active external schedule while nobody is staked.
    app.update_block(|b| {
        b.time = b.time.plus_seconds(7 * 86400);
        b.height += 1;
    });

    app.execute_contract(
        alice.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::Deposit { recipient: None },
        &[coin(alice_lp.u128(), lp_denom.clone())],
    )
    .unwrap();

    app.update_block(|b| {
        b.time = b.time.plus_seconds(STAKED_SECONDS);
        b.height += 1;
    });

    let alice_reward_before = balance_of(&app, &alice, PROJECT_REWARD);
    app.execute_contract(
        alice.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::ClaimRewards {
            lp_tokens: vec![lp_denom.clone()],
        },
        &[],
    )
    .unwrap();
    let alice_reward_after = balance_of(&app, &alice, PROJECT_REWARD);
    let received = alice_reward_after - alice_reward_before;
    assert!(
        received <= Uint128::new(100),
        "first depositor received zero-stake external emissions: got {received}"
    );

    let dao_before = balance_of(&app, &handles.deployer, PROJECT_REWARD);
    app.execute_contract(
        handles.deployer.clone(),
        inc.incentives.clone(),
        &IncentivesExecuteMsg::ClaimOrphanedRewards {
            limit: None,
            receiver: handles.deployer.to_string(),
        },
        &[],
    )
    .expect("DAO can recover zero-stake external emissions as orphaned rewards");
    let dao_after = balance_of(&app, &handles.deployer, PROJECT_REWARD);
    assert!(
        dao_after > dao_before,
        "zero-stake external emissions should be recoverable by the DAO"
    );
}

// =====================================================================
// helpers (local to this test target)
// =====================================================================

fn create_pair(app: &mut TestApp, handles: &KeepSetHandles, denom_a: &str, denom_b: &str) -> Addr {
    let asset_infos = vec![
        AssetInfo::NativeToken {
            denom: denom_a.to_string(),
        },
        AssetInfo::NativeToken {
            denom: denom_b.to_string(),
        },
    ];
    app.execute_contract(
        handles.deployer.clone(),
        handles.factory.clone(),
        &FactoryExecuteMsg::CreatePair {
            pair_type: PairType::Xyk {},
            asset_infos: asset_infos.clone(),
            init_params: None,
        },
        &[],
    )
    .unwrap();
    let info: PairInfo = app
        .wrap()
        .query_wasm_smart(
            handles.factory.clone(),
            &FactoryQueryMsg::Pair { asset_infos },
        )
        .unwrap();
    info.contract_addr
}

fn lp_denom_of(
    app: &mut TestApp,
    handles: &KeepSetHandles,
    denom_a: &str,
    denom_b: &str,
) -> String {
    let info: PairInfo = app
        .wrap()
        .query_wasm_smart(
            handles.factory.clone(),
            &FactoryQueryMsg::Pair {
                asset_infos: vec![
                    AssetInfo::NativeToken {
                        denom: denom_a.to_string(),
                    },
                    AssetInfo::NativeToken {
                        denom: denom_b.to_string(),
                    },
                ],
            },
        )
        .unwrap();
    info.liquidity_token
}

fn provide_liquidity(
    app: &mut TestApp,
    pair: &Addr,
    sender: &Addr,
    a_amount: u128,
    b_amount: u128,
) {
    let assets = vec![
        Asset {
            info: AssetInfo::NativeToken {
                denom: UJUNO.to_string(),
            },
            amount: Uint128::new(a_amount),
        },
        Asset {
            info: AssetInfo::NativeToken {
                denom: MOCK_USDC.to_string(),
            },
            amount: Uint128::new(b_amount),
        },
    ];
    let mut funds = vec![coin(a_amount, UJUNO), coin(b_amount, MOCK_USDC)];
    funds.sort_by(|a, b| a.denom.cmp(&b.denom));
    app.execute_contract(
        sender.clone(),
        pair.clone(),
        &PairExecuteMsg::ProvideLiquidity {
            assets,
            slippage_tolerance: None,
            auto_stake: None,
            receiver: None,
            min_lp_to_receive: None,
        },
        &funds,
    )
    .unwrap();
}
