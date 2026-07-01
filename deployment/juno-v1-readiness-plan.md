# Astroport-Juno v1 deployment/readiness plan

Date: 2026-06-29T17:22:23Z
Scope: Juno DEX v1 contracts/config only. This is an operator checklist and blocker list; it is not authorization to broadcast transactions.

## 0. Current verified state

- Repo branch: `juno-agent/dex-guards-20260629` at `c1623b5b chore(juno): remove stale non-v1 schemas`.
- `junod`: `/opt/data/bin/junod`, version `v29.0.0`.
- Mainnet RPC check: `https://juno-rpc.publicnode.com:443/status` returned `network=juno-1`, `catching_up=false`.
- Mainnet tokenfactory module account query returned `juno19ejy8n9qsectrf4semdp9cpknflld0j6tj7k2a`.
- Mainnet wasm params query returned `code_upload_access.permission=Everybody` and `instantiate_default_permission=Everybody`; re-query immediately before any real upload/broadcast because chain params can change.
- `cosmwasm-check`: `/usr/local/bin/cosmwasm-check`, version `3.0.9`.
- Docker is installed but daemon is not reachable here, so `scripts/build_release.sh` cannot produce optimized artifacts in this environment.
- No real optimized v1 artifact directory exists yet; only a test fixture wasm was found under `contracts/periphery/tokenfactory_tracker/tests/test_data/`.

## 1. Required v1 wasm artifacts

Final optimized artifact set must contain exactly these eight files and no deferred/stable/PCL/tokenomics extras:

1. `artifacts/astroport_factory.wasm`
2. `artifacts/astroport_pair.wasm`
3. `artifacts/astroport_router.wasm`
4. `artifacts/astroport_native_coin_registry.wasm`
5. `artifacts/astroport_oracle.wasm`
6. `artifacts/astroport_tokenfactory_tracker.wasm`
7. `artifacts/astroport_whitelist.wasm`
8. `artifacts/astroport_incentives.wasm`

Build/check commands, run in an environment with Docker daemon access:

```sh
cd /opt/data/repos/astroport-core
scripts/build_release.sh
python3 scripts/check_juno_v1_artifacts.py artifacts
for wasm in \
  artifacts/astroport_factory.wasm \
  artifacts/astroport_pair.wasm \
  artifacts/astroport_router.wasm \
  artifacts/astroport_native_coin_registry.wasm \
  artifacts/astroport_oracle.wasm \
  artifacts/astroport_tokenfactory_tracker.wasm \
  artifacts/astroport_whitelist.wasm \
  artifacts/astroport_incentives.wasm; do
  cosmwasm-check --available-capabilities staking,cosmwasm_1_1,cosmwasm_2_0,iterator,stargate "$wasm"
done
```

`cw20-base` is also required as a code ID in the deployment config because the factory instantiate schema still carries `token_code_id`, even though Juno v1 LP shares are TokenFactory-native. Use a known verified cw20-base code ID for the target network or upload a pinned cw20-base artifact separately.

## 2. Required code IDs and addresses

`deployment/juno-v1-testnet.template.json` expects these code IDs:

- `code_ids.astroport-factory`
- `code_ids.astroport-incentives`
- `code_ids.astroport-native-coin-registry`
- `code_ids.astroport-oracle`
- `code_ids.astroport-pair`
- `code_ids.astroport-router`
- `code_ids.astroport-tokenfactory-tracker`
- `code_ids.astroport-whitelist`
- `code_ids.cw20-base`

Final frontend/deployment handoff expects these instantiated addresses:

- `addresses.astroport-native-coin-registry`
- `addresses.astroport-whitelist`
- `addresses.astroport-factory`
- `addresses.astroport-incentives`
- `addresses.astroport-router`
- `addresses.astroport-oracle`
- `addresses.astroport-tokenfactory-tracker`

Launch-critical addresses for frontend: factory, native coin registry, router, incentives. Oracle and standalone tokenfactory tracker can be deployed/dormant, but the factory pair tracker config must be correct before public pool creation.

## 3. Instantiate/update order

Use this order to avoid circular dependencies. The rendered config represents the final state, but the first factory instantiate cannot normally know the incentives contract address unless using address precomputation/Instantiate2.

1. Store all v1 wasms and capture code IDs.
2. Resolve manual accounts:
   - `JUNO_OWNER`: DAO/steward owner/admin.
   - `JUNO_GUARDIAN`: incentives guardian.
   - `JUNO_TREASURY`: fee destination and v1 incentives vesting placeholder.
   - `JUNO_TOKENFACTORY_MODULE`: tokenfactory module account (`juno19ejy8n9qsectrf4semdp9cpknflld0j6tj7k2a` on current juno-1 query; re-query before mainnet use).
3. Instantiate `astroport-native-coin-registry` with owner.
4. Execute native coin registry `add`/`register` for `ujuno` plus verified launch IBC denoms and decimals.
5. Instantiate `astroport-whitelist` with owner admin and `mutable=true`.
6. Instantiate `astroport-factory` with:
   - `coin_registry_address` = native coin registry address,
   - `owner` = DAO/steward owner,
   - `fee_address` = treasury,
   - `generator_address` = `null` for the initial instantiate unless the incentives address is safely precomputed,
   - one XYK pair config only: pair code ID, `total_fee_bps=30`, `maker_fee_bps=0`, `permissioned=true`, not disabled. Keep it permissioned until the official first pair is created and seeded.
   - `token_code_id` = cw20-base code ID,
   - `whitelist_code_id` = whitelist code ID,
   - `tracker_config.code_id` = tokenfactory tracker code ID,
   - `tracker_config.token_factory_addr` = tokenfactory module account.
7. Instantiate `astroport-incentives` with native denom (`reward_token={"native_token":{"denom":"ujuno"}}` on mainnet, `ujunox` on uni-7), factory address, owner, and guardian. Do not use legacy `astro_token` or `vesting_contract` fields.
8. Execute factory `update_config` to set `generator_address` to the incentives address.
9. Instantiate `astroport-router` with factory address.
10. Instantiate `astroport-oracle` only for a real pair asset vector when a pool exists; otherwise leave it out of launch-critical UI and do not pretend it proves readiness.
11. Instantiate standalone `astroport-tokenfactory-tracker` only if an operator-facing tracker address is still desired; factory-created pair trackers are the launch-critical path.
12. Verify the official first pair does not already exist by querying factory `pair`/`pairs` for the launch asset infos; stop if any unexpected pair exists.
13. Create the official first XYK pool through factory `create_pair`; wait for pair address and LP denom.
14. Immediately provide official seed liquidity.
15. Query factory pair registry and pool balances; require the official pair address and non-zero liquidity.
16. After smoke checks pass, execute factory `update_pair_config` for XYK with the same fees/code ID and `permissioned=false` to open public pair creation.
17. Query factory/pair/router/config state and produce `deployment/juno-v1-testnet.json` or mainnet equivalent from tx output.

If the team chooses Instantiate2/address precomputation, document the salt, code checksum, creator, predicted addresses, and verification query before deviating from the update-after-incentives path.

## 4. Pool factory config checks

Factory `Config {}` must show:

- owner = approved DAO/steward address.
- one `pair_configs` entry only.
- pair type = `{ "xyk": {} }`.
- pair code ID = uploaded `astroport_pair.wasm` code ID.
- `is_disabled=false` and `is_generator_disabled=false` unless intentionally freezing launch.
- `permissioned=true` during the first-pool gate. It may become `permissioned=false` for public pool creation only after the official first pair is registered, seeded, and smoke-checked.
- `total_fee_bps=30`, `maker_fee_bps=0` unless governance explicitly changes fees.
- `coin_registry_address` = deployed native coin registry.
- `whitelist_code_id` = deployed whitelist code ID.
- `generator_address` = incentives address after step 8, or `null` if incentives are deliberately dormant and UI hides rewards.

Native coin registry must return correct decimals for each launch denom. Do not launch a pool in the UI until denom trace + decimals + explorer links are verified.

## 5. No-broadcast dry-run commands

Set these once per target. Use uni-7 for rehearsal, juno-1 for mainnet generate-only/dry-run checks.

```sh
# uni-7 rehearsal
export CHAIN_ID=uni-7
export DENOM=ujunox
export RPC=https://juno-testnet-rpc.polkachu.com
export KEY_NAME=juno-agent
export KEYRING_DIR=/opt/data/.juno-agent
export KEYRING_BACKEND=test
export GAS_PRICES=0.075ujunox

# mainnet generate-only/dry-run
export CHAIN_ID=juno-1
export DENOM=ujuno
export RPC=https://juno-rpc.publicnode.com:443
export KEY_NAME=juno-agent
export KEYRING_DIR=/opt/data/.juno-agent
export KEYRING_BACKEND=test
export GAS_PRICES=0.075ujuno
```

Preflight:

```sh
/opt/data/bin/junod version
curl -sS "$RPC/status" | jq -r '.result.node_info.network, .result.sync_info.catching_up'
/opt/data/bin/junod query auth module-account tokenfactory --node "$RPC" -o json | jq -r '.account.value.address // .account.address'
/opt/data/bin/junod query wasm params --node "$RPC" -o json
/opt/data/bin/junod query feemarket params --node "$RPC" -o json || true
/opt/data/bin/junod keys show "$KEY_NAME" --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" -a
```

Store tx generate-only/dry-run pattern, repeat for each artifact:

```sh
/opt/data/bin/junod tx wasm store artifacts/astroport_factory.wasm \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.5 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --generate-only > /tmp/store-astroport-factory.unsigned.json

/opt/data/bin/junod tx wasm store artifacts/astroport_factory.wasm \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.5 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --dry-run -o json
```

Instantiate generate-only pattern:

```sh
jq '.instantiate_msgs["astroport-native-coin-registry"]' deployment/juno-v1-testnet.json > /tmp/native-registry-msg.json
/opt/data/bin/junod tx wasm instantiate "$CODE_ID_NATIVE_COIN_REGISTRY" "$(cat /tmp/native-registry-msg.json)" \
  --label 'astroport-juno-v1-native-coin-registry' \
  --admin "$JUNO_OWNER" \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --generate-only > /tmp/instantiate-native-registry.unsigned.json
```

Factory post-incentives update generate-only:

```sh
/opt/data/bin/junod tx wasm execute "$ADDR_FACTORY" \
  '{"update_config":{"token_code_id":null,"fee_address":null,"generator_address":"'$ADDR_INCENTIVES'","whitelist_code_id":null,"coin_registry_address":null}}' \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --generate-only > /tmp/update-factory-generator.unsigned.json
```

Pair create generate-only:

```sh
jq '.pair_create_msg_template | {create_pair: .}' deployment/juno-v1-testnet.json > /tmp/create-pair-msg.json
/opt/data/bin/junod tx wasm execute "$ADDR_FACTORY" "$(cat /tmp/create-pair-msg.json)" \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --generate-only > /tmp/create-pair.unsigned.json
```

Open public pair creation only after the first-pool gate passes:

```sh
jq '.post_update_state["astroport-factory"].pair_configs[0] | {update_pair_config:{config:.}}' deployment/juno-v1-testnet.json > /tmp/open-public-pair-creation-msg.json
/opt/data/bin/junod tx wasm execute "$ADDR_FACTORY" "$(cat /tmp/open-public-pair-creation-msg.json)" \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --generate-only > /tmp/open-public-pair-creation.unsigned.json
```

Do not add `--yes`; do not broadcast from this plan.

## 6. Readiness verification queries

After real txs exist, save full `junod -o json` tx responses under `deployment/tx/<chain>/` and render config:

```sh
python3 scripts/extract_juno_v1_tx_sets.py \
  --code-id astroport-factory=deployment/tx/uni-7/store-astroport-factory.json \
  --code-id astroport-incentives=deployment/tx/uni-7/store-astroport-incentives.json \
  --code-id astroport-native-coin-registry=deployment/tx/uni-7/store-astroport-native-coin-registry.json \
  --code-id astroport-oracle=deployment/tx/uni-7/store-astroport-oracle.json \
  --code-id astroport-pair=deployment/tx/uni-7/store-astroport-pair.json \
  --code-id astroport-router=deployment/tx/uni-7/store-astroport-router.json \
  --code-id astroport-tokenfactory-tracker=deployment/tx/uni-7/store-astroport-tokenfactory-tracker.json \
  --code-id astroport-whitelist=deployment/tx/uni-7/store-astroport-whitelist.json \
  --code-id cw20-base=deployment/tx/uni-7/store-cw20-base.json \
  --address astroport-factory=deployment/tx/uni-7/instantiate-astroport-factory.json \
  --address astroport-incentives=deployment/tx/uni-7/instantiate-astroport-incentives.json \
  --address astroport-native-coin-registry=deployment/tx/uni-7/instantiate-astroport-native-coin-registry.json \
  --address astroport-oracle=deployment/tx/uni-7/instantiate-astroport-oracle.json \
  --address astroport-router=deployment/tx/uni-7/instantiate-astroport-router.json \
  --address astroport-tokenfactory-tracker=deployment/tx/uni-7/instantiate-astroport-tokenfactory-tracker.json \
  --address astroport-whitelist=deployment/tx/uni-7/instantiate-astroport-whitelist.json \
  > deployment/tx/uni-7/tx-sets.txt

python3 scripts/build_juno_v1_deployment_command.py \
  --tx-sets deployment/tx/uni-7/tx-sets.txt \
  --owner "$JUNO_OWNER" \
  --guardian "$JUNO_GUARDIAN" \
  --treasury "$JUNO_TREASURY" \
  --tokenfactory-module "$JUNO_TOKENFACTORY_MODULE" \
  --counterparty-denom "$FIRST_COUNTERPARTY_DENOM" \
  --output deployment/juno-v1-testnet.json \
  --render
python3 scripts/check_juno_v1_frontend_config.py deployment/juno-v1-testnet.json
```

State checks:

```sh
/opt/data/bin/junod query wasm contract-state smart "$ADDR_FACTORY" '{"config":{}}' --node "$RPC" -o json | jq
/opt/data/bin/junod query wasm contract-state smart "$ADDR_NATIVE_COIN_REGISTRY" '{"native_tokens":{"limit":30}}' --node "$RPC" -o json | jq
/opt/data/bin/junod query wasm contract-state smart "$ADDR_FACTORY" '{"pairs":{"limit":30}}' --node "$RPC" -o json | jq
/opt/data/bin/junod query wasm contract-state smart "$PAIR_ADDR" '{"pool":{}}' --node "$RPC" -o json | jq
/opt/data/bin/junod query wasm contract-state smart "$PAIR_ADDR" '{"simulation":{"offer_asset":{"info":{"native_token":{"denom":"ujuno"}},"amount":"1000000"}}}' --node "$RPC" -o json | jq
/opt/data/bin/junod query wasm contract-state smart "$ADDR_ROUTER" '{"config":{}}' --node "$RPC" -o json | jq
```

Launch is not ready until factory `pairs`, pair `pool`, and pair `simulation` all return sensible values for at least one seeded XYK pool.

## 7. Safety checks before public launch

- Artifact set exactly matches the eight v1 wasms; no stable/PCL/maker/staking/vesting/xASTRO/converter artifacts.
- Every wasm passes `cosmwasm-check` with Juno capabilities and no neutron capability requirement.
- Mainnet `wasm params` are re-queried immediately before broadcast; current review state is open upload/instantiate, but if `wasm store` becomes permissioned, upload path must be governance/authorized uploader, not a hot wallet assumption.
- Owner/guardian/treasury are DAO-approved and documented.
- Factory instantiate/update txs are reviewed for no stable/PCL pair configs and no surprise maker fee.
- Native registry has correct decimals for `ujuno` and each launch denom.
- First pool denoms are verified through IBC denom trace and wallet/explorer display.
- UI registry/config has no placeholders and passes strict guards.
- Seed liquidity amount is intentional and publicly acceptable; do not list thin/empty pools.
- One direct swap smoke test and one add/remove liquidity smoke test are executed on the target chain before public comms.
- Risk notice is published: experimental Juno DEX v1, thin liquidity, verify contracts.

## 8. Rollback/freeze risks

- `wasm store` code IDs are immutable. Rollback means stop using a bad code ID, upload fixed code, migrate only contracts that support safe migrate, or instantiate replacements.
- Bad factory config can block or misroute pool creation. Immediate freeze: execute factory `update_pair_config` with `is_disabled=true` for XYK, or remove/avoid listing the factory in the frontend registry.
- Bad incentives config can create reward accounting confusion. Immediate freeze: hide incentives in UI and update factory `generator_address` to `null` if needed.
- Bad pool cannot be deleted from chain history. Mitigation: remove from registry/UI, publish warning, create replacement pool, and do not seed more liquidity.
- Bad native denom decimals corrupt display/quotes. Freeze affected denom in registry/UI until native coin registry and frontend config agree.
- Router misconfiguration affects multi-hop only. Keep direct pair swaps as launch path; hide router routes until router `config` and simulations pass.
- Mainnet upload permissioning can block deployment entirely if chain params change. Current review query shows `code_upload_access.permission=Everybody`; re-query before broadcast and require a governance/authorized uploader path only if the target query says code upload is restricted.

## 9. Exact current blockers

1. Optimized artifacts have not been produced in this environment because Docker daemon is unreachable.
2. Real code IDs do not exist in this repo yet for the eight Astroport-Juno v1 artifacts plus cw20-base.
3. Real instantiated contract addresses do not exist in this repo yet.
4. Owner, guardian, treasury, target upload signer, and first launch counterpart denom are not finalized in repo state.
5. The factory/incentives circular address dependency must be resolved by the update-after-incentives path above or by a documented Instantiate2/precomputed-address path.
6. No seeded XYK pool has been verified by factory `pairs`, pair `pool`, and pair `simulation` queries.
7. No real direct swap or add/remove liquidity smoke tx has been executed on the target chain.

## 10. Operator-ready acceptance gate

DEX v1 deployment handoff is ready for frontend only when this exact command sequence passes against real target-chain outputs:

```sh
python3 scripts/check_juno_v1_artifacts.py artifacts
python3 scripts/check_juno_v1_deployment_template.py deployment/juno-v1-testnet.json
python3 scripts/check_juno_v1_frontend_config.py deployment/juno-v1-testnet.json
/opt/data/bin/junod query wasm contract-state smart "$ADDR_FACTORY" '{"config":{}}' --node "$RPC" -o json
/opt/data/bin/junod query wasm contract-state smart "$ADDR_FACTORY" '{"pairs":{"limit":30}}' --node "$RPC" -o json
/opt/data/bin/junod query wasm contract-state smart "$PAIR_ADDR" '{"pool":{}}' --node "$RPC" -o json
/opt/data/bin/junod query wasm contract-state smart "$PAIR_ADDR" '{"simulation":{"offer_asset":{"info":{"native_token":{"denom":"'$DENOM'"}},"amount":"1000000"}}}' --node "$RPC" -o json
```

Until then, frontend work may use the placeholder template/read-only shell, but it must not present Juno DEX v1 as live.
