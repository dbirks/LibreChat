const { EModelEndpoint, AuthKeys } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { getLLMConfig } = require('~/server/services/Endpoints/google/llm');
const { isEnabled } = require('~/server/utils');
const { GoogleClient } = require('~/app');
const logger = require('~/config/winston');

const initializeClient = async ({ req, res, endpointOption, overrideModel, optionsOnly }) => {
  const {
    GOOGLE_KEY,
    GOOGLE_KEY_JSON_FILE,
    GOOGLE_REVERSE_PROXY,
    GOOGLE_AUTH_HEADER,
    PROXY,
  } = process.env;
  const isUserProvided = GOOGLE_KEY === 'user_provided';
  const { key: expiresAt } = req.body;

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.google);
    userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.google });
  }

  const googleKeyJsonFilename = GOOGLE_KEY_JSON_FILE ?? '~/data/auth.json';
  let serviceKey = {};
  try {
    logger.info(`Loading Google service key from ${googleKeyJsonFilename}`);
    serviceKey = require(googleKeyJsonFilename);
  } catch (e) {
    logger.error(`Failed to load Google service key from ${googleKeyJsonFilename} with error: ${e.message}`);
  }

  const credentials = isUserProvided
    ? userKey
    : {
      [AuthKeys.GOOGLE_SERVICE_KEY]: serviceKey,
      [AuthKeys.GOOGLE_API_KEY]: GOOGLE_KEY,
    };

  let clientOptions = {};

  /** @type {undefined | TBaseEndpoint} */
  const allConfig = req.app.locals.all;
  /** @type {undefined | TBaseEndpoint} */
  const googleConfig = req.app.locals[EModelEndpoint.google];

  if (googleConfig) {
    clientOptions.streamRate = googleConfig.streamRate;
  }

  if (allConfig) {
    clientOptions.streamRate = allConfig.streamRate;
  }

  clientOptions = {
    req,
    res,
    reverseProxyUrl: GOOGLE_REVERSE_PROXY ?? null,
    authHeader: isEnabled(GOOGLE_AUTH_HEADER) ?? null,
    proxy: PROXY ?? null,
    ...clientOptions,
    ...endpointOption,
  };

  if (optionsOnly) {
    clientOptions = Object.assign(
      {
        modelOptions: endpointOption.model_parameters,
      },
      clientOptions,
    );
    if (overrideModel) {
      clientOptions.modelOptions.model = overrideModel;
    }
    return getLLMConfig(credentials, clientOptions);
  }

  const client = new GoogleClient(credentials, clientOptions);

  return {
    client,
    credentials,
  };
};

module.exports = initializeClient;
