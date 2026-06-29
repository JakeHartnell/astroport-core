// Example consumer fixture for the Astroport-Juno v1 frontend handoff.
// It intentionally mirrors deployment/juno-v1-testnet.template.json placeholders;
// replace values by importing a rendered deployment/juno-v1-testnet.json at launch.

import type {
  JunoV1FrontendAddressKey,
  JunoV1FrontendDeploymentConfig,
} from "./juno-v1-frontend-config";

export const junoV1FrontendConfigExample = {
  network: {
    chain_id: "uni-7",
    bech32_prefix: "juno",
    fee_denom: "ujunox",
    native_asset_denom: "ujunox",
  },
  code_ids: {
    "astroport-factory": 0,
    "astroport-incentives": 0,
    "astroport-native-coin-registry": 0,
    "astroport-oracle": 0,
    "astroport-pair": 0,
    "astroport-router": 0,
    "astroport-tokenfactory-tracker": 0,
    "astroport-whitelist": 0,
    "cw20-base": 0,
  },
  addresses: {
    "astroport-factory": "juno1replacefactory000000000000000000000000000000",
    "astroport-incentives": "juno1replaceincentives00000000000000000000000000",
    "astroport-native-coin-registry": "juno1replacecoinregistry00000000000000000000000",
    "astroport-oracle": "juno1replaceoracle0000000000000000000000000000000",
    "astroport-router": "juno1replacerouter000000000000000000000000000000",
    "astroport-tokenfactory-tracker": "juno1replacetracker0000000000000000000000000000",
    "astroport-whitelist": "juno1replacewhitelist00000000000000000000000000",
  },
  pair_create_msg_template: {
    pair_type: { xyk: {} },
    asset_infos: [
      { native_token: { denom: "ujunox" } },
      { native_token: { denom: "ibc/REPLACE_COUNTERPARTY_DENOM_HASH" } },
    ],
    init_params: null,
  },
  frontend: {
    required_addresses: [
      "astroport-factory",
      "astroport-router",
      "astroport-native-coin-registry",
      "astroport-incentives",
    ],
    optional_addresses: ["astroport-oracle"],
    pair_discovery: "query astroport-factory pairs/pair; do not hardcode pools before launch",
  },
} satisfies JunoV1FrontendDeploymentConfig;

export function frontendAddressMap(
  config: JunoV1FrontendDeploymentConfig,
): Record<JunoV1FrontendAddressKey, string | undefined> {
  return {
    "astroport-factory": config.addresses["astroport-factory"],
    "astroport-router": config.addresses["astroport-router"],
    "astroport-native-coin-registry": config.addresses["astroport-native-coin-registry"],
    "astroport-incentives": config.addresses["astroport-incentives"],
    "astroport-oracle": config.addresses["astroport-oracle"],
  };
}

export function firstXykPairCreateMsg(config: JunoV1FrontendDeploymentConfig) {
  // Frontends should use this as a create-pair message template only.
  // Existing pools/pairs must be discovered from the factory contract, not hardcoded here.
  return config.pair_create_msg_template;
}
