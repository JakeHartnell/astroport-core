# Astroport-Juno v1 mainnet deployment guide

Scope: Juno mainnet (`juno-1`) deployment of the stripped Astroport-Juno v1 DEX surface.

This guide is an operator runbook. It does not authorize broadcasting transactions by itself. Broadcast only after the owner/guardian/treasury/uploader/counterparty/seed-liquidity decisions are explicitly approved.

## 0. Launch constraints

- Chain: `juno-1`
- Native denom: `ujuno`
- Product scope: XYK swaps, pools, and liquidity only.
- No DEX token, stablecoin, LST, perps, yield vaults, PCL/stable pairs, maker, staking, vesting, converter, or xASTRO launch surface.
- Frontend launch is blocked until at least one seeded XYK pool verifies via factory `pairs`, pair `pool`, and pair `simulation` queries.

## 1. Human decisions required before broadcast

Fill this table before any `junod tx ... --yes` command is run.

| Decision | Value | Source / approval |
|---|---|---|
| Upload signer key name | `TODO` | `TODO` |
| DAO/steward owner/admin | `TODO` | `TODO` |
| Incentives guardian | `TODO` | `TODO` |
| Treasury / fee destination | `TODO` | `TODO` |
| First counterparty denom | `TODO` | `TODO` |
| Counterparty decimals | `TODO` | `TODO` |
| Seed liquidity plan | `TODO` | `TODO` |
| Public launch comms owner | `TODO` | `TODO` |

Recommended default for owner/guardian/treasury is a DAO-controlled address, not an unattended hot wallet. If a hot wallet must deploy, transfer ownership/admin controls immediately after verification.

## 2. Environment

```sh
export CHAIN_ID=juno-1
export DENOM=ujuno
export RPC=https://juno-rpc.publicnode.com:443
export REST=https://juno-rest.publicnode.com
export KEY_NAME=juno-agent          # replace if a different approved uploader is used
export KEYRING_DIR=/opt/data/.juno-agent
export KEYRING_BACKEND=test
export GAS_PRICES=0.075ujuno
export JUNOD=/opt/data/bin/junod
```

Never print or export private keys or seed phrases. Keep tx JSON outputs; they are the deployment evidence.

## 3. Preflight: re-query mainnet state

Run immediately before any tx work:

```sh
$JUNOD version
curl -fsS "$RPC/status" | jq -r '.result.node_info.network, .result.sync_info.catching_up, .result.sync_info.latest_block_height'
curl -fsS "$REST/cosmos/base/tendermint/v1beta1/node_info" | jq -r '.default_node_info.network'
$JUNOD query wasm params --node "$RPC" -o json | jq
$JUNOD query globalfee minimum-gas-prices --node "$RPC" -o json | jq
$JUNOD query auth module-account tokenfactory --node "$RPC" -o json | jq -r '.account.value.address // .account.address'
$JUNOD keys show "$KEY_NAME" --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" -a
$JUNOD query bank balances "$($JUNOD keys show "$KEY_NAME" --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" -a)" --node "$RPC" -o json | jq
```

Abort if:

- RPC/REST network is not `juno-1`.
- Node is catching up.
- Wasm upload/instantiate params do not permit the chosen path.
- Gas price policy differs materially from `0.075ujuno`.
- Uploader does not have enough `ujuno` for stores, instantiates, pool creation, and smoke tests.

## 4. Build optimized artifacts

Use a machine with Docker daemon access or an equivalent reproducible CosmWasm optimizer path.

```sh
cd /opt/data/repos/astroport-core
scripts/build_release.sh
python3 scripts/check_juno_v1_artifacts.py artifacts
```

The artifact set must be exactly:

```text
artifacts/astroport_factory.wasm
artifacts/astroport_pair.wasm
artifacts/astroport_router.wasm
artifacts/astroport_native_coin_registry.wasm
artifacts/astroport_oracle.wasm
artifacts/astroport_tokenfactory_tracker.wasm
artifacts/astroport_whitelist.wasm
artifacts/astroport_incentives.wasm
```

Then run `cosmwasm-check` on each artifact:

```sh
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

## 5. Upload contracts and capture code IDs

Create a durable tx output directory:

```sh
mkdir -p deployment/tx/juno-1
```

For each v1 wasm:

```sh
SYNC_JSON=/tmp/store-astroport-factory.sync.json
$JUNOD tx wasm store artifacts/astroport_factory.wasm \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.5 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR" \
  --broadcast-mode sync --yes -o json \
  > "$SYNC_JSON"
TXHASH=$(jq -r '.txhash' "$SYNC_JSON")
test -n "$TXHASH" && test "$TXHASH" != null
# Wait for inclusion, then save the included tx response with DeliverTx events.
until $JUNOD query tx "$TXHASH" --node "$RPC" -o json > deployment/tx/juno-1/store-astroport-factory.json; do sleep 3; done
```

Do not feed the sync broadcast JSON directly to `extract_juno_v1_tx_sets.py`: sync responses generally only contain CheckTx/txhash. Always wait for inclusion and save the included tx response from `junod query tx <txhash> -o json` (or an equivalent full tx response containing DeliverTx events).

Repeat for:

- `astroport-incentives`
- `astroport-native-coin-registry`
- `astroport-oracle`
- `astroport-pair`
- `astroport-router`
- `astroport-tokenfactory-tracker`
- `astroport-whitelist`

Also provide `cw20-base` code ID. Either use a verified existing mainnet code ID or upload a pinned `cw20-base` artifact and save `deployment/tx/juno-1/store-cw20-base.json`.

Extract/check code IDs:

```sh
python3 scripts/extract_juno_v1_tx_sets.py --scan deployment/tx/juno-1/store-astroport-factory.json
```

## 6. Instantiate order

Use the update-after-incentives path unless the team explicitly chooses Instantiate2 and records salt/checksum/predicted-address evidence.

1. Instantiate native coin registry.
2. Register `ujuno` and the verified first counterparty denom + decimals.
3. Instantiate whitelist.
4. Instantiate factory with one XYK pair config, `permissioned=true`, and `generator_address=null`. Keep XYK pair creation permissioned until the official first pair exists and seed liquidity is confirmed.
5. Instantiate incentives with factory address, owner, guardian, and `reward_token={"native_token":{"denom":"ujuno"}}`.
6. Execute factory `update_config` to set `generator_address` to incentives.
7. Instantiate router with factory address.
8. Instantiate oracle only after a real pair asset vector exists, or keep oracle dormant/out of the frontend launch-critical path.
9. Instantiate standalone tokenfactory tracker only if the operator still needs it; factory-created pair trackers are the critical path.
10. Verify the official first pair does not already exist by querying factory `pair`/`pairs` for the launch asset infos. If it exists unexpectedly, stop and reconcile before continuing.
11. Create the official first XYK pair through factory from the approved owner/operator wallet.
12. Immediately seed official liquidity from the approved seed wallet.
13. Query factory pair registry and pool balances; require the official pair address to be registered and pool liquidity to be non-zero.
14. Run the smoke checks in section 8, then execute factory `update_pair_config` for XYK with the same fees/code ID and `permissioned=false` to open public pair creation.

Save every tx response under `deployment/tx/juno-1/` with explicit names, for example:

```text
instantiate-astroport-native-coin-registry.json
execute-native-coin-registry-add-ujuno.json
execute-native-coin-registry-add-counterparty.json
instantiate-astroport-whitelist.json
instantiate-astroport-factory.json
instantiate-astroport-incentives.json
execute-factory-update-generator.json
instantiate-astroport-router.json
instantiate-astroport-oracle.json
instantiate-astroport-tokenfactory-tracker.json
execute-factory-create-pair.json
execute-pair-provide-liquidity.json
execute-factory-open-public-pair-creation.json
```

## 7. Render deployment config from tx output

Build a tx set, then render the canonical handoff:

```sh
python3 scripts/extract_juno_v1_tx_sets.py \
  --code-id astroport-factory=deployment/tx/juno-1/store-astroport-factory.json \
  --code-id astroport-incentives=deployment/tx/juno-1/store-astroport-incentives.json \
  --code-id astroport-native-coin-registry=deployment/tx/juno-1/store-astroport-native-coin-registry.json \
  --code-id astroport-oracle=deployment/tx/juno-1/store-astroport-oracle.json \
  --code-id astroport-pair=deployment/tx/juno-1/store-astroport-pair.json \
  --code-id astroport-router=deployment/tx/juno-1/store-astroport-router.json \
  --code-id astroport-tokenfactory-tracker=deployment/tx/juno-1/store-astroport-tokenfactory-tracker.json \
  --code-id astroport-whitelist=deployment/tx/juno-1/store-astroport-whitelist.json \
  --code-id cw20-base=deployment/tx/juno-1/store-cw20-base.json \
  --address astroport-factory=deployment/tx/juno-1/instantiate-astroport-factory.json \
  --address astroport-incentives=deployment/tx/juno-1/instantiate-astroport-incentives.json \
  --address astroport-native-coin-registry=deployment/tx/juno-1/instantiate-astroport-native-coin-registry.json \
  --address astroport-oracle=deployment/tx/juno-1/instantiate-astroport-oracle.json \
  --address astroport-router=deployment/tx/juno-1/instantiate-astroport-router.json \
  --address astroport-tokenfactory-tracker=deployment/tx/juno-1/instantiate-astroport-tokenfactory-tracker.json \
  --address astroport-whitelist=deployment/tx/juno-1/instantiate-astroport-whitelist.json \
  > deployment/tx/juno-1/tx-sets.txt

python3 scripts/build_juno_v1_deployment_command.py \
  --tx-sets deployment/tx/juno-1/tx-sets.txt \
  --network juno-1 \
  --owner "$JUNO_OWNER" \
  --guardian "$JUNO_GUARDIAN" \
  --treasury "$JUNO_TREASURY" \
  --tokenfactory-module "$JUNO_TOKENFACTORY_MODULE" \
  --counterparty-denom "$FIRST_COUNTERPARTY_DENOM" \
  --output deployment/juno-v1-mainnet.json \
  --render
```

Validate:

```sh
python3 scripts/check_juno_v1_deployment_template.py deployment/juno-v1-mainnet.json
python3 scripts/check_juno_v1_frontend_config.py deployment/juno-v1-mainnet.json
python3 -m json.tool deployment/juno-v1-mainnet.json >/tmp/juno-v1-mainnet.pretty.json
```

## 8. First-pool gate and post-deploy verification queries

Keep XYK pair creation permissioned until all first-pool gate evidence below is captured. Do not open `permissioned=false` while the factory has no official seeded pair.

```sh
$JUNOD query wasm contract-state smart "$ADDR_FACTORY" '{"config":{}}' --node "$RPC" -o json | jq
$JUNOD query wasm contract-state smart "$ADDR_NATIVE_COIN_REGISTRY" '{"native_tokens":{"limit":30}}' --node "$RPC" -o json | jq
$JUNOD query wasm contract-state smart "$ADDR_FACTORY" '{"pair":{"asset_infos":[{"native_token":{"denom":"ujuno"}},{"native_token":{"denom":"'$FIRST_COUNTERPARTY_DENOM'"}}]}}' --node "$RPC" -o json | jq
$JUNOD query wasm contract-state smart "$ADDR_FACTORY" '{"pairs":{"limit":30}}' --node "$RPC" -o json | jq
$JUNOD query wasm contract-state smart "$PAIR_ADDR" '{"pool":{}}' --node "$RPC" -o json | jq
$JUNOD query wasm contract-state smart "$PAIR_ADDR" '{"simulation":{"offer_asset":{"info":{"native_token":{"denom":"ujuno"}},"amount":"1000000"}}}' --node "$RPC" -o json | jq
$JUNOD query wasm contract-state smart "$ADDR_ROUTER" '{"config":{}}' --node "$RPC" -o json | jq
```

Only after the official pair query resolves to the expected `$PAIR_ADDR`, pool balances are non-zero, and smoke checks pass, open public creation:

```sh
jq '.post_update_state["astroport-factory"].pair_configs[0] | {update_pair_config:{config:.}}' deployment/juno-v1-mainnet.json > /tmp/open-public-pair-creation-msg.json
$JUNOD tx wasm execute "$ADDR_FACTORY" "$(cat /tmp/open-public-pair-creation-msg.json)" \
  --from "$KEY_NAME" --chain-id "$CHAIN_ID" --node "$RPC" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  --keyring-backend "$KEYRING_BACKEND" --keyring-dir "$KEYRING_DIR"
```

Expected launch state:

- Factory owner is the approved DAO/steward owner.
- Factory has exactly one active XYK pair config. It remains `permissioned=true` until the official pair is seeded and verified, then becomes `permissioned=false` only after the open-public-creation transaction.
- Native registry returns correct decimals for `ujuno` and first counterparty denom.
- Factory `pairs` includes the first seeded pair.
- Pair `pool` returns non-zero liquidity.
- Pair `simulation` returns a sane ask amount.
- Router config points to the deployed factory.

## 9. Frontend registry handoff

Only after section 8 passes, fill the DEX frontend registry with real values:

- chain ID: `juno-1`
- native denom: `ujuno`
- working RPC/REST endpoints
- factory address
- native coin registry address
- router address
- incentives address
- optional oracle address
- first pool metadata if the frontend expects static bootstrap metadata

Then run the frontend repo checks:

```sh
cd /opt/data/repos/juno-website-dex-v1
python3 -m json.tool public/dex/registry.juno-1.json >/tmp/registry.juno-1.pretty.json
yarn lint
yarn type-check
yarn build
```

## 10. Smoke tests before public announcement

Minimum live smoke:

1. Direct swap using the seeded pair.
2. Add liquidity.
3. Remove a small amount of liquidity.
4. Query balances before/after each action.
5. Verify explorer links and contract labels.
6. Publish a risk notice: experimental v1 DEX, thin liquidity, verify contracts.

## 11. Freeze / rollback playbook

- Bad code ID: stop using it, upload fixed code, instantiate replacements or migrate only if migration is explicitly safe.
- Bad factory config: execute factory update to disable XYK pair config or remove the factory from the frontend registry.
- Bad incentives config: hide incentives in UI and set factory `generator_address=null` if needed.
- Bad pool: remove from frontend registry, warn publicly, create a replacement pool, do not seed more liquidity.
- Bad denom decimals: freeze affected denom in frontend/native registry until fixed and reverified.
- Router issue: hide multi-hop/router paths; direct pair swaps remain the launch-critical surface.

## 12. Final launch gate

Do not call launch ready until all are true:

- [ ] Human decision table is filled and approved.
- [ ] Optimized artifact set is exact and checked.
- [ ] Code IDs and contract addresses are captured from real tx JSON.
- [ ] Owner/guardian/treasury are correct on-chain.
- [ ] First counterparty denom trace + decimals are verified.
- [ ] First XYK pool exists and has seeded liquidity.
- [ ] Factory `pairs`, pair `pool`, and pair `simulation` queries pass.
- [ ] Frontend registry has no placeholders and builds.
- [ ] Swap + add/remove liquidity smoke tests pass.
- [ ] Risk notice and contract address list are ready for public comms.
